import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";

const DEFAULT_WORKER_SCHEDULE = "__WORKER_SCHEDULE__";
const DEFAULT_LOCK_AFTER_MINUTES = Number("__LOCK_AFTER_MINUTES__");
const DEFAULT_DRY_RUN = true;
const DEFAULT_LOCK_ROOT_PAGES = false;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_CRAWL_DEPTH = 10;
const DEFAULT_MAX_CRAWL_PAGES = 1000;
const AUDIT_DATABASE_TITLE = "__AUDIT_DATABASE_TITLE__";
const NOTION_API_VERSION = "__NOTION_API_VERSION__";
const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const MAX_RETRY_DELAY_MS = 30_000;
const MIN_SCHEDULE_MINUTES = 5;
const MAX_SCHEDULE_MINUTES = 7 * 24 * 60;
const SCHEDULE_MINUTES_BY_UNIT = {
  m: 1,
  h: 60,
  d: 24 * 60
} as const;
const RETRYABLE_STATUS_CODES = new Set([409, 429, 500, 502, 503, 504, 529]);

type WorkerSchedule = `${number}${"m" | "h" | "d"}`;
type ScheduleUnit = keyof typeof SCHEDULE_MINUTES_BY_UNIT;

type RuntimeConfig = {
  token: string;
  rootPageIds: string[];
  targetDataSourceIds: string[];
  lockAfterMinutes: number;
  dryRun: boolean;
  lockRootPages: boolean;
  pageSize: number;
  maxRetries: number;
  maxCrawlDepth: number;
  maxCrawlPages: number;
};

type QueryDataSourceResponse = {
  object: "list";
  results: unknown[];
  next_cursor: string | null;
  has_more: boolean;
};

type ListBlockChildrenResponse = {
  object: "list";
  results: unknown[];
  next_cursor: string | null;
  has_more: boolean;
};

type PageObject = {
  object: "page";
  id: string;
  last_edited_time: string;
  is_locked: boolean;
};

type BlockObject = {
  object: "block";
  id: string;
  type: string;
  has_children: boolean;
};

type DatabaseObject = {
  object: "database";
  id: string;
  data_sources?: Array<{ id: string; name?: string }>;
};

type DataSourceObject = {
  object: "data_source";
  id: string;
};

type RunStats = {
  checkedPageCount: number;
  eligiblePageCount: number;
  lockedPageCount: number;
  skippedPageCount: number;
  errorCount: number;
};

type CrawlState = {
  checkedPageIds: Set<string>;
  crawledPageIds: Set<string>;
  crawledBlockIds: Set<string>;
  crawledDatabaseIds: Set<string>;
  filteredDataSourceIds: Set<string>;
  fullDataSourceIds: Set<string>;
  crawledBlockCount: number;
  crawledDatabaseCount: number;
  crawledDataSourceCount: number;
  crawlLimitReached: boolean;
};

type RunSummary = RunStats & {
  runId: string;
  startedAt: string;
  dryRun: boolean;
  lockRootPages: boolean;
  scope: string;
  rootPageCount: number;
  targetDataSourceCount: number;
  crawledPageCount: number;
  crawledBlockCount: number;
  crawledDatabaseCount: number;
  crawledDataSourceCount: number;
  crawlLimitReached: boolean;
  lockAfterMinutes: number;
  cutoffTime: string;
  elapsedMs: number;
};

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

class NotionApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(status: number, code: string, retryAfterMs?: number) {
    super(`Notion API request failed with ${status} ${code}`);
    this.name = "NotionApiError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

const WORKER_SCHEDULE = readScheduleEnv("WORKER_SCHEDULE", DEFAULT_WORKER_SCHEDULE);

const worker = new Worker();
export default worker;

const auditRuns = worker.database("autoLockRuns", {
  type: "managed",
  initialTitle: AUDIT_DATABASE_TITLE,
  primaryKeyProperty: "Run ID",
  schema: {
    properties: {
      Name: Schema.title(),
      "Run ID": Schema.richText(),
      "Started At": Schema.richText(),
      Scope: Schema.richText(),
      "Dry Run": Schema.checkbox(),
      "Lock Root Pages": Schema.checkbox(),
      Checked: Schema.number(),
      Eligible: Schema.number(),
      Locked: Schema.number(),
      Skipped: Schema.number(),
      Errors: Schema.number(),
      "Crawled Pages": Schema.number(),
      "Crawled Blocks": Schema.number(),
      "Crawled Databases": Schema.number(),
      "Crawled Data Sources": Schema.number(),
      "Crawl Limit": Schema.checkbox(),
      "Elapsed ms": Schema.number()
    }
  }
});

worker.sync("autoLockPages", {
  database: auditRuns,
  mode: "incremental",
  schedule: WORKER_SCHEDULE,
  execute: async () => {
    const startedAt = new Date();

    try {
      const config = loadRuntimeConfig();
      const summary = await runAutoLock(config, startedAt);
      logSummary(summary);

      return {
        changes: [toAuditChange(summary)],
        hasMore: false
      };
    } catch (error) {
      logFatalError(error);
      throw error;
    }
  }
});

async function runAutoLock(config: RuntimeConfig, startedAt: Date): Promise<RunSummary> {
  const startedAtMs = startedAt.getTime();
  const cutoff = new Date(startedAtMs - config.lockAfterMinutes * 60_000);
  const stats: RunStats = {
    checkedPageCount: 0,
    eligiblePageCount: 0,
    lockedPageCount: 0,
    skippedPageCount: 0,
    errorCount: 0
  };
  const state = createCrawlState();

  for (const dataSourceId of config.targetDataSourceIds) {
    await crawlDataSource(config, dataSourceId, cutoff, stats, state, {
      depth: 0,
      scanAll: false
    });
  }

  for (const rootPageId of config.rootPageIds) {
    await crawlPage(config, rootPageId, cutoff, stats, state, 0);
  }

  return {
    runId: createRunId(startedAt),
    startedAt: startedAt.toISOString(),
    dryRun: config.dryRun,
    lockRootPages: config.lockRootPages,
    scope: createScopeLabel(config),
    rootPageCount: config.rootPageIds.length,
    targetDataSourceCount: config.targetDataSourceIds.length,
    crawledPageCount: state.crawledPageIds.size,
    crawledBlockCount: state.crawledBlockCount,
    crawledDatabaseCount: state.crawledDatabaseCount,
    crawledDataSourceCount: state.crawledDataSourceCount,
    crawlLimitReached: state.crawlLimitReached,
    lockAfterMinutes: config.lockAfterMinutes,
    cutoffTime: cutoff.toISOString(),
    elapsedMs: Date.now() - startedAtMs,
    ...stats
  };
}

async function crawlPage(
  config: RuntimeConfig,
  pageId: string,
  cutoff: Date,
  stats: RunStats,
  state: CrawlState,
  depth: number
): Promise<void> {
  if (state.crawlLimitReached || depth > config.maxCrawlDepth) {
    return;
  }

  const pageKey = normalizeId(pageId);
  if (state.crawledPageIds.has(pageKey)) {
    return;
  }

  if (state.crawledPageIds.size >= config.maxCrawlPages) {
    state.crawlLimitReached = true;
    return;
  }

  state.crawledPageIds.add(pageKey);
  const shouldCheckPage = depth > 0 || config.lockRootPages;
  const pageWasReadable = shouldCheckPage
    ? await handleCandidatePage(config, pageId, cutoff, stats, state)
    : true;

  if (!pageWasReadable || depth >= config.maxCrawlDepth) {
    return;
  }

  await crawlBlockChildren(config, pageId, cutoff, stats, state, depth + 1);
}

async function crawlBlockChildren(
  config: RuntimeConfig,
  blockId: string,
  cutoff: Date,
  stats: RunStats,
  state: CrawlState,
  depth: number
): Promise<void> {
  if (state.crawlLimitReached || depth > config.maxCrawlDepth) {
    return;
  }

  const blockKey = `${normalizeId(blockId)}:${depth}`;
  if (state.crawledBlockIds.has(blockKey)) {
    return;
  }
  state.crawledBlockIds.add(blockKey);

  let cursor: string | undefined;

  do {
    let response: ListBlockChildrenResponse;

    try {
      response = await listBlockChildren(config, blockId, cursor);
    } catch (error) {
      if (isScopeTraversalError(error)) {
        throw error;
      }

      stats.errorCount += 1;
      logPageError(error);
      return;
    }

    cursor = response.next_cursor ?? undefined;

    for (const result of response.results) {
      if (!isBlockObject(result)) {
        continue;
      }

      state.crawledBlockCount += 1;

      if (result.type === "child_page") {
        await crawlPage(config, result.id, cutoff, stats, state, depth + 1);
        continue;
      }

      if (result.type === "child_database") {
        await crawlDatabase(config, result.id, cutoff, stats, state, depth + 1);
        continue;
      }

      if (result.has_children) {
        await crawlBlockChildren(config, result.id, cutoff, stats, state, depth + 1);
      }
    }
  } while (cursor && !state.crawlLimitReached);
}

async function crawlDatabase(
  config: RuntimeConfig,
  databaseId: string,
  cutoff: Date,
  stats: RunStats,
  state: CrawlState,
  depth: number
): Promise<void> {
  if (state.crawlLimitReached || depth > config.maxCrawlDepth) {
    return;
  }

  const databaseKey = normalizeId(databaseId);
  if (state.crawledDatabaseIds.has(databaseKey)) {
    return;
  }
  state.crawledDatabaseIds.add(databaseKey);
  state.crawledDatabaseCount += 1;

  try {
    const database = await retrieveDatabase(config, databaseId);
    if (!isDatabaseObject(database)) {
      return;
    }

    for (const dataSource of database.data_sources ?? []) {
      if (dataSource?.id) {
        await crawlDataSource(config, dataSource.id, cutoff, stats, state, {
          depth: depth + 1,
          scanAll: true
        });
      }
    }
  } catch (error) {
    if (isScopeTraversalError(error)) {
      throw error;
    }

    stats.errorCount += 1;
    logPageError(error);
  }
}

async function crawlDataSource(
  config: RuntimeConfig,
  dataSourceId: string,
  cutoff: Date,
  stats: RunStats,
  state: CrawlState,
  options: { depth: number; scanAll: boolean }
): Promise<void> {
  if (state.crawlLimitReached || options.depth > config.maxCrawlDepth) {
    return;
  }

  if (!markDataSourceForScan(state, dataSourceId, options.scanAll)) {
    return;
  }
  state.crawledDataSourceCount += 1;

  let cursor: string | undefined;

  do {
    let response: QueryDataSourceResponse;

    try {
      response = await queryDataSource(config, dataSourceId, cutoff.toISOString(), cursor, options.scanAll);
    } catch (error) {
      if (isScopeTraversalError(error)) {
        throw error;
      }

      stats.errorCount += 1;
      logPageError(error);
      return;
    }

    cursor = response.next_cursor ?? undefined;

    for (const result of response.results) {
      if (isPageObject(result)) {
        await crawlPage(config, result.id, cutoff, stats, state, options.depth + 1);
        continue;
      }

      if (isDataSourceObject(result)) {
        await crawlDataSource(config, result.id, cutoff, stats, state, {
          depth: options.depth + 1,
          scanAll: true
        });
        continue;
      }

      if (isDatabaseObject(result)) {
        await crawlDatabase(config, result.id, cutoff, stats, state, options.depth + 1);
      }
    }
  } while (cursor && !state.crawlLimitReached);
}

async function handleCandidatePage(
  config: RuntimeConfig,
  pageId: string,
  cutoff: Date,
  stats: RunStats,
  state: CrawlState
): Promise<boolean> {
  const pageKey = normalizeId(pageId);
  if (state.checkedPageIds.has(pageKey)) {
    return true;
  }
  state.checkedPageIds.add(pageKey);
  stats.checkedPageCount += 1;

  try {
    const page = await retrievePage(config, pageId);

    if (!isPageObject(page)) {
      stats.skippedPageCount += 1;
      return false;
    }

    if (page.is_locked || new Date(page.last_edited_time).getTime() > cutoff.getTime()) {
      stats.skippedPageCount += 1;
      return true;
    }

    stats.eligiblePageCount += 1;

    if (config.dryRun) {
      return true;
    }

    await lockPage(config, page.id);
    stats.lockedPageCount += 1;
    return true;
  } catch (error) {
    if (isFailFastError(error)) {
      throw error;
    }

    stats.errorCount += 1;
    logPageError(error);
    return false;
  }
}

async function queryDataSource(
  config: RuntimeConfig,
  dataSourceId: string,
  cutoffTime: string,
  startCursor: string | undefined,
  scanAll: boolean
): Promise<QueryDataSourceResponse> {
  const body: Record<string, unknown> = {
    page_size: config.pageSize
  };

  if (!scanAll) {
    body.filter = {
      timestamp: "last_edited_time",
      last_edited_time: {
        on_or_before: cutoffTime
      }
    };
  }

  if (startCursor) {
    body.start_cursor = startCursor;
  }

  const response = await notionRequest<QueryDataSourceResponse>(
    config,
    `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
    {
      method: "POST",
      body
    }
  );

  if (!Array.isArray(response.results)) {
    throw new NotionApiError(500, "invalid_query_response");
  }

  return response;
}

async function listBlockChildren(
  config: RuntimeConfig,
  blockId: string,
  startCursor?: string
): Promise<ListBlockChildrenResponse> {
  const query = new URLSearchParams({
    page_size: String(config.pageSize)
  });

  if (startCursor) {
    query.set("start_cursor", startCursor);
  }

  const response = await notionRequest<ListBlockChildrenResponse>(
    config,
    `/blocks/${encodeURIComponent(blockId)}/children?${query.toString()}`,
    {
      method: "GET"
    }
  );

  if (!Array.isArray(response.results)) {
    throw new NotionApiError(500, "invalid_block_children_response");
  }

  return response;
}

async function retrieveDatabase(config: RuntimeConfig, databaseId: string): Promise<unknown> {
  return notionRequest(config, `/databases/${encodeURIComponent(databaseId)}`, {
    method: "GET"
  });
}

async function retrievePage(config: RuntimeConfig, pageId: string): Promise<unknown> {
  return notionRequest(config, `/pages/${encodeURIComponent(pageId)}`, {
    method: "GET"
  });
}

async function lockPage(config: RuntimeConfig, pageId: string): Promise<void> {
  await notionRequest(config, `/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: {
      is_locked: true
    }
  });
}

async function notionRequest<T>(
  config: RuntimeConfig,
  path: string,
  options: { method: "GET" | "POST" | "PATCH"; body?: unknown }
): Promise<T> {
  let attempt = 0;

  while (true) {
    let response: Response;

    try {
      response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_API_VERSION
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch (error) {
      if (attempt >= config.maxRetries) {
        throw new NotionApiError(0, getNetworkErrorCode(error));
      }

      await delay(getRetryDelayMs(attempt));
      attempt += 1;
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const error = new NotionApiError(response.status, await readNotionErrorCode(response), retryAfterMs);

    if (!RETRYABLE_STATUS_CODES.has(error.status) || attempt >= config.maxRetries) {
      throw error;
    }

    await delay(getRetryDelayMs(attempt, error.retryAfterMs));
    attempt += 1;
  }
}

async function readNotionErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : "unknown_error";
  } catch {
    return "unknown_error";
  }
}

function loadRuntimeConfig(): RuntimeConfig {
  const rootPageIds = uniqueIds([
    ...readIdListEnv("AUTO_LOCK_ROOT_PAGE_IDS"),
    ...readIdListEnv("NOTION_ROOT_PAGE_IDS")
  ]);
  const targetDataSourceIds = uniqueIds([
    ...readIdListEnv("AUTO_LOCK_DATA_SOURCE_IDS"),
    ...readIdListEnv("AUTO_LOCK_DATA_SOURCE_ID"),
    ...readIdListEnv("NOTION_TARGET_DATA_SOURCE_IDS"),
    ...readIdListEnv("NOTION_TARGET_DATA_SOURCE_ID")
  ]);

  if (rootPageIds.length === 0 && targetDataSourceIds.length === 0) {
    throw new ConfigError("Set AUTO_LOCK_ROOT_PAGE_IDS or AUTO_LOCK_DATA_SOURCE_IDS.");
  }

  return {
    token: readFirstRequiredEnv(["AUTO_LOCK_API_TOKEN", "NOTION_API_TOKEN"]),
    rootPageIds,
    targetDataSourceIds,
    lockAfterMinutes: readIntegerEnv("LOCK_AFTER_MINUTES", DEFAULT_LOCK_AFTER_MINUTES, {
      min: 1
    }),
    dryRun: readBooleanEnv("DRY_RUN", DEFAULT_DRY_RUN),
    lockRootPages: readBooleanEnv("LOCK_ROOT_PAGES", DEFAULT_LOCK_ROOT_PAGES),
    pageSize: DEFAULT_PAGE_SIZE,
    maxRetries: DEFAULT_MAX_RETRIES,
    maxCrawlDepth: readIntegerEnv("MAX_CRAWL_DEPTH", DEFAULT_MAX_CRAWL_DEPTH, { min: 0 }),
    maxCrawlPages: readIntegerEnv("MAX_CRAWL_PAGES", DEFAULT_MAX_CRAWL_PAGES, { min: 1 })
  };
}

function createCrawlState(): CrawlState {
  return {
    checkedPageIds: new Set(),
    crawledPageIds: new Set(),
    crawledBlockIds: new Set(),
    crawledDatabaseIds: new Set(),
    filteredDataSourceIds: new Set(),
    fullDataSourceIds: new Set(),
    crawledBlockCount: 0,
    crawledDatabaseCount: 0,
    crawledDataSourceCount: 0,
    crawlLimitReached: false
  };
}

function markDataSourceForScan(state: CrawlState, dataSourceId: string, scanAll: boolean): boolean {
  const key = normalizeId(dataSourceId);

  if (scanAll) {
    if (state.fullDataSourceIds.has(key)) {
      return false;
    }

    state.fullDataSourceIds.add(key);
    return true;
  }

  if (state.fullDataSourceIds.has(key) || state.filteredDataSourceIds.has(key)) {
    return false;
  }

  state.filteredDataSourceIds.add(key);
  return true;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(`${name} is required.`);
  }
  return value;
}

function readFirstRequiredEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new ConfigError(`${names[0]} is required.`);
}

function readScheduleEnv(name: string, defaultValue: string): WorkerSchedule {
  const value = process.env[name]?.trim() || defaultValue;
  const minutes = parseScheduleMinutes(value);

  if (minutes === null) {
    throw new ConfigError(`${name} must be an interval schedule like 5m, 1h, or 1d.`);
  }

  if (minutes < MIN_SCHEDULE_MINUTES || minutes > MAX_SCHEDULE_MINUTES) {
    throw new ConfigError(`${name} must be at least 5m and at most 7d.`);
  }

  return value as WorkerSchedule;
}

function parseScheduleMinutes(value: string): number | null {
  const match = /^(\d+)([mhd])$/.exec(value);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2] as ScheduleUnit;

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  return amount * SCHEDULE_MINUTES_BY_UNIT[unit];
}

function readIdListEnv(name: string): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readIntegerEnv(name: string, defaultValue: number, limits: { min: number; max?: number }): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be an integer.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < limits.min || (limits.max !== undefined && value > limits.max)) {
    const upper = limits.max === undefined ? "" : ` and <= ${limits.max}`;
    throw new ConfigError(`${name} must be >= ${limits.min}${upper}.`);
  }

  return value;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new ConfigError(`${name} must be "true" or "false".`);
}

function uniqueIds(values: string[]): string[] {
  const idsByKey = new Map<string, string>();

  for (const value of values) {
    const key = normalizeId(value);
    if (key && !idsByKey.has(key)) {
      idsByKey.set(key, value);
    }
  }

  return [...idsByKey.values()];
}

function isPageObject(value: unknown): value is PageObject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const page = value as Partial<PageObject>;
  return (
    page.object === "page" &&
    typeof page.id === "string" &&
    typeof page.last_edited_time === "string" &&
    typeof page.is_locked === "boolean"
  );
}

function isBlockObject(value: unknown): value is BlockObject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const block = value as Partial<BlockObject>;
  return (
    block.object === "block" &&
    typeof block.id === "string" &&
    typeof block.type === "string" &&
    typeof block.has_children === "boolean"
  );
}

function isDatabaseObject(value: unknown): value is DatabaseObject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const database = value as Partial<DatabaseObject>;
  return database.object === "database" && typeof database.id === "string";
}

function isDataSourceObject(value: unknown): value is DataSourceObject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const dataSource = value as Partial<DataSourceObject>;
  return dataSource.object === "data_source" && typeof dataSource.id === "string";
}

function isFailFastError(error: unknown): boolean {
  if (error instanceof ConfigError) {
    return true;
  }

  if (error instanceof NotionApiError) {
    return error.status === 401 || error.status === 403;
  }

  return false;
}

function isScopeTraversalError(error: unknown): boolean {
  if (isFailFastError(error)) {
    return true;
  }

  if (error instanceof NotionApiError) {
    return error.status === 404;
  }

  return false;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return Math.max(0, dateMs - Date.now());
}

function getRetryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
  }

  return Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRunId(startedAt: Date): string {
  return `${startedAt.toISOString()}-${crypto.randomUUID()}`;
}

function createScopeLabel(config: RuntimeConfig): string {
  const parts = [];

  if (config.rootPageIds.length > 0) {
    parts.push(`${config.rootPageIds.length} root page${config.rootPageIds.length === 1 ? "" : "s"}`);
  }

  if (config.targetDataSourceIds.length > 0) {
    parts.push(
      `${config.targetDataSourceIds.length} data source${config.targetDataSourceIds.length === 1 ? "" : "s"}`
    );
  }

  return parts.join(", ");
}

function toAuditChange(summary: RunSummary) {
  return {
    type: "upsert" as const,
    key: summary.runId,
    properties: {
      Name: Builder.title(`Auto lock run ${summary.startedAt}`),
      "Run ID": Builder.richText(summary.runId),
      "Started At": Builder.richText(summary.startedAt),
      Scope: Builder.richText(summary.scope),
      "Dry Run": Builder.checkbox(summary.dryRun),
      "Lock Root Pages": Builder.checkbox(summary.lockRootPages),
      Checked: Builder.number(summary.checkedPageCount),
      Eligible: Builder.number(summary.eligiblePageCount),
      Locked: Builder.number(summary.lockedPageCount),
      Skipped: Builder.number(summary.skippedPageCount),
      Errors: Builder.number(summary.errorCount),
      "Crawled Pages": Builder.number(summary.crawledPageCount),
      "Crawled Blocks": Builder.number(summary.crawledBlockCount),
      "Crawled Databases": Builder.number(summary.crawledDatabaseCount),
      "Crawled Data Sources": Builder.number(summary.crawledDataSourceCount),
      "Crawl Limit": Builder.checkbox(summary.crawlLimitReached),
      "Elapsed ms": Builder.number(summary.elapsedMs)
    }
  };
}

function logSummary(summary: RunSummary): void {
  console.log(
    JSON.stringify({
      event: "notion_auto_lock_summary",
      runId: summary.runId,
      dryRun: summary.dryRun,
      lockRootPages: summary.lockRootPages,
      scope: summary.scope,
      rootPageCount: summary.rootPageCount,
      targetDataSourceCount: summary.targetDataSourceCount,
      lockAfterMinutes: summary.lockAfterMinutes,
      cutoffTime: summary.cutoffTime,
      checkedPageCount: summary.checkedPageCount,
      eligiblePageCount: summary.eligiblePageCount,
      lockedPageCount: summary.lockedPageCount,
      skippedPageCount: summary.skippedPageCount,
      errorCount: summary.errorCount,
      crawledPageCount: summary.crawledPageCount,
      crawledBlockCount: summary.crawledBlockCount,
      crawledDatabaseCount: summary.crawledDatabaseCount,
      crawledDataSourceCount: summary.crawledDataSourceCount,
      crawlLimitReached: summary.crawlLimitReached,
      elapsedMs: summary.elapsedMs
    })
  );
}

function logPageError(error: unknown): void {
  console.warn(
    JSON.stringify({
      event: "notion_auto_lock_page_error",
      errorCode: getSafeErrorCode(error)
    })
  );
}

function logFatalError(error: unknown): void {
  console.error(
    JSON.stringify({
      event: "notion_auto_lock_fatal_error",
      errorCode: getSafeErrorCode(error)
    })
  );
}

function getSafeErrorCode(error: unknown): string {
  if (error instanceof ConfigError) {
    return "configuration_error";
  }

  if (error instanceof NotionApiError) {
    return error.code;
  }

  return "unknown_error";
}

function getNetworkErrorCode(error: unknown): string {
  if (error instanceof TypeError) {
    return "network_error";
  }

  return "unknown_network_error";
}

function normalizeId(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}
