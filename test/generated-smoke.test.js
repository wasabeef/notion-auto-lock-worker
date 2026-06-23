import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createProject } from "../lib/scaffold.js";

const generatedTestDir = path.resolve(".tmp", "test-generated", "notion-auto-lock-worker");

test("generated worker project has expected defaults and no placeholders", async () => {
  await rm(path.resolve(".tmp", "test-generated"), { recursive: true, force: true });

  await createProject({
    targetDir: generatedTestDir,
    workerSchedule: "1h",
    lockAfterMinutes: 180,
    auditDatabaseTitle: "Auto Lock Runs",
    notionApiVersion: "2026-03-11",
    force: true
  });

  const packageJson = JSON.parse(await readFile(path.join(generatedTestDir, "package.json"), "utf8"));
  assert.equal(packageJson.packageManager, "npm@11.17.0");
  assert.equal(packageJson.engines.node, ">=22");
  assert.equal(packageJson.engines.npm, ">=10.9.2");
  assert.equal(packageJson.scripts.build, "tsc");
  assert.equal(packageJson.scripts.check, "tsc --noEmit");
  assert.equal(packageJson.scripts.typecheck, "npm run check");
  assert.equal(packageJson.scripts["dry-run"], "ntn workers sync trigger autoLockPages");

  const index = await readFile(path.join(generatedTestDir, "src", "index.ts"), "utf8");
  assert.match(index, /const WORKER_SCHEDULE = "1h"/);
  assert.match(index, /const DEFAULT_LOCK_AFTER_MINUTES = Number\("180"\)/);
  assert.match(index, /AUTO_LOCK_ROOT_PAGE_IDS/);
  assert.match(index, /AUTO_LOCK_DATA_SOURCE_IDS/);
  assert.match(index, /LOCK_ROOT_PAGES/);
  assert.match(index, /MAX_CRAWL_DEPTH/);
  assert.match(index, /MAX_CRAWL_PAGES/);
  assert.match(index, /child_database/);
  assert.match(index, /\/blocks\/\$\{encodeURIComponent\(blockId\)\}\/children/);
  assert.match(index, /\/databases\/\$\{encodeURIComponent\(databaseId\)\}/);
  assert.match(index, /is_locked: true/);
  assert.doesNotMatch(index, /__[A-Z0-9_]+__/);

  const readme = await readFile(path.join(generatedTestDir, "README.md"), "utf8");
  assert.match(readme, /Node\.js 22 or later/);
  assert.match(readme, /npm 10\.9\.2 or later/);
  assert.match(readme, /AUTO_LOCK_ROOT_PAGE_IDS/);
  assert.match(readme, /LOCK_ROOT_PAGES/);
  assert.match(readme, /child databases/);
  assert.doesNotMatch(readme, /__[A-Z0-9_]+__/);
});
