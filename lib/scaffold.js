import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET_DIR = "notion-auto-lock-worker";
const DEFAULT_WORKER_SCHEDULE = "1h";
const DEFAULT_LOCK_AFTER_MINUTES = 180;
const DEFAULT_AUDIT_DATABASE_TITLE = "Auto Lock Runs";
const DEFAULT_NOTION_API_VERSION = "2026-03-11";

const HELP_TEXT = `Create a Notion auto-lock Worker project.

Usage:
  npm create notion-auto-lock-worker@latest [directory] [options]

Options:
  --schedule <interval>          Worker schedule, from 5m to 7d. Default: 1h
  --lock-after-minutes <number>  Minutes after last edit before locking. Default: 180
  --audit-title <title>          Managed audit database title. Default: Auto Lock Runs
  --api-version <version>        Notion API version. Default: 2026-03-11
  --force                        Overwrite template files in an existing directory
  -h, --help                     Show this help
`;

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "worker");

export function parseCliArgs(argv) {
  const options = {
    targetDir: DEFAULT_TARGET_DIR,
    workerSchedule: DEFAULT_WORKER_SCHEDULE,
    lockAfterMinutes: DEFAULT_LOCK_AFTER_MINUTES,
    auditDatabaseTitle: DEFAULT_AUDIT_DATABASE_TITLE,
    notionApiVersion: DEFAULT_NOTION_API_VERSION,
    force: false,
    help: false,
    helpText: HELP_TEXT
  };

  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--schedule") {
      options.workerSchedule = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--lock-after-minutes") {
      options.lockAfterMinutes = parsePositiveInteger(
        readFlagValue(argv, index, arg),
        "lock-after-minutes"
      );
      index += 1;
      continue;
    }

    if (arg === "--audit-title") {
      options.auditDatabaseTitle = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--api-version") {
      options.notionApiVersion = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    throw new Error("Only one target directory can be provided.");
  }

  if (positional[0]) {
    options.targetDir = positional[0];
  }

  validateSchedule(options.workerSchedule);
  validateApiVersion(options.notionApiVersion);

  if (!options.auditDatabaseTitle.trim()) {
    throw new Error("audit-title must not be empty.");
  }

  return options;
}

export async function createProject(options) {
  const targetDir = path.resolve(options.targetDir);
  const projectName = toPackageName(path.basename(targetDir));

  if (!options.force && (await directoryExists(targetDir))) {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error(
        `Target directory is not empty: ${targetDir}. Re-run with --force to overwrite matching files.`
      );
    }
  }

  await mkdir(targetDir, { recursive: true });
  await copyTemplate(TEMPLATE_DIR, targetDir, {
    PROJECT_NAME: projectName,
    WORKER_SCHEDULE: options.workerSchedule,
    LOCK_AFTER_MINUTES: String(options.lockAfterMinutes),
    AUDIT_DATABASE_TITLE: options.auditDatabaseTitle,
    NOTION_API_VERSION: options.notionApiVersion
  });

  return {
    projectName,
    targetDir,
    relativeTargetDir: getDisplayTargetDir(targetDir)
  };
}

function readFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(value, name) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function validateSchedule(value) {
  if (value === "manual" || value === "continuous") {
    throw new Error("Only interval schedules are supported for this project.");
  }

  const match = /^(\d+)([mhd])$/.exec(value);
  if (!match) {
    throw new Error("schedule must be an interval like 5m, 1h, or 1d.");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const minutes = unit === "m" ? amount : unit === "h" ? amount * 60 : amount * 60 * 24;

  if (minutes < 5 || minutes > 7 * 24 * 60) {
    throw new Error("schedule must be at least 5m and at most 7d.");
  }
}

function validateApiVersion(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("api-version must use YYYY-MM-DD format.");
  }
}

function toPackageName(name) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_TARGET_DIR;
}

function getDisplayTargetDir(targetDir) {
  const relative = path.relative(process.cwd(), targetDir);

  if (!relative || relative === "") {
    return ".";
  }

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return targetDir;
  }

  return relative;
}

async function directoryExists(targetDir) {
  try {
    const targetStat = await stat(targetDir);
    return targetStat.isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function copyTemplate(sourceDir, targetDir, replacements) {
  await assertReadable(sourceDir);
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetName = entry.name === "_gitignore" ? ".gitignore" : entry.name;
    const targetPath = path.join(targetDir, targetName);

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      await copyTemplate(sourcePath, targetPath, replacements);
      continue;
    }

    if (entry.isFile()) {
      const content = await readFile(sourcePath, "utf8");
      await writeFile(targetPath, renderTemplate(content, replacements));
    }
  }
}

async function assertReadable(targetPath) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`Template directory was not found: ${targetPath}`);
  }
}

function renderTemplate(content, replacements) {
  return Object.entries(replacements).reduce(
    (rendered, [key, value]) => rendered.replaceAll(`__${key}__`, value),
    content
  );
}
