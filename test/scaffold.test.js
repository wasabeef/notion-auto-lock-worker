import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createProject, parseCliArgs } from "../lib/scaffold.js";

test("parseCliArgs uses safe defaults", () => {
  const options = parseCliArgs([]);

  assert.equal(options.targetDir, "notion-auto-lock-worker");
  assert.equal(options.workerSchedule, "1h");
  assert.equal(options.lockAfterMinutes, 180);
  assert.equal(options.auditDatabaseTitle, "Auto Lock Runs");
  assert.equal(options.notionApiVersion, "2026-03-11");
});

test("parseCliArgs accepts scaffold customization", () => {
  const options = parseCliArgs([
    "custom-worker",
    "--schedule",
    "15m",
    "--lock-after-minutes",
    "90",
    "--audit-title",
    "Runs",
    "--api-version",
    "2026-03-11"
  ]);

  assert.equal(options.targetDir, "custom-worker");
  assert.equal(options.workerSchedule, "15m");
  assert.equal(options.lockAfterMinutes, 90);
  assert.equal(options.auditDatabaseTitle, "Runs");
});

test("parseCliArgs rejects unsupported schedule modes", () => {
  assert.throws(() => parseCliArgs(["--schedule", "manual"]), /interval schedules/);
  assert.throws(() => parseCliArgs(["--schedule", "continuous"]), /interval schedules/);
  assert.throws(() => parseCliArgs(["--schedule", "1m"]), /at least 5m/);
  assert.throws(() => parseCliArgs(["--schedule", "8d"]), /at most 7d/);
});

test("createProject renders a deployable worker scaffold", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "notion-auto-lock-worker-test-"));
  const targetDir = path.join(tempRoot, "My Worker");

  try {
    const result = await createProject({
      targetDir,
      workerSchedule: "30m",
      lockAfterMinutes: 120,
      auditDatabaseTitle: "Lock Runs",
      notionApiVersion: "2026-03-11",
      force: false
    });

    assert.equal(result.projectName, "my-worker");
    assert.equal(result.relativeTargetDir, targetDir);

    const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
    assert.equal(packageJson.name, "my-worker");

    const index = await readFile(path.join(targetDir, "src", "index.ts"), "utf8");
    assert.match(index, /const WORKER_SCHEDULE = "30m"/);
    assert.match(index, /const DEFAULT_LOCK_AFTER_MINUTES = Number\("120"\)/);
    assert.match(index, /const AUDIT_DATABASE_TITLE = "Lock Runs"/);
    assert.match(index, /const NOTION_API_VERSION = "2026-03-11"/);

    const gitignore = await readFile(path.join(targetDir, ".gitignore"), "utf8");
    assert.match(gitignore, /\.env/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("createProject refuses a non-empty directory unless forced", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "notion-auto-lock-worker-test-"));
  const targetDir = path.join(tempRoot, "existing");

  try {
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "README.md"), "existing");

    await assert.rejects(
      createProject({
        targetDir,
        workerSchedule: "1h",
        lockAfterMinutes: 180,
        auditDatabaseTitle: "Auto Lock Runs",
        notionApiVersion: "2026-03-11",
        force: false
      }),
      /not empty/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
