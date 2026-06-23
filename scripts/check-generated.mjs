#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const generatedRoot = path.join(rootDir, ".tmp", "generated");
const projectDir = path.join(generatedRoot, "notion-auto-lock-worker");
const npmCacheDir = path.join(rootDir, ".tmp", "npm-cache");

await rm(generatedRoot, { recursive: true, force: true });
await mkdir(generatedRoot, { recursive: true });
await mkdir(npmCacheDir, { recursive: true });

run("node", [
  "bin/create-notion-auto-lock-worker.js",
  projectDir,
  "--force",
  "--schedule",
  "15m",
  "--lock-after-minutes",
  "90"
]);

await assertGeneratedProject(projectDir);

run("npm", ["install", "--cache", npmCacheDir, "--prefer-offline", "--no-audit", "--no-fund"], {
  cwd: projectDir
});
run("npm", ["run", "build"], { cwd: projectDir });
run("npm", ["run", "check"], { cwd: projectDir });

console.log(`Generated project check passed: ${path.relative(rootDir, projectDir)}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

async function assertGeneratedProject(targetDir) {
  const requiredFiles = [
    "src/index.ts",
    "package.json",
    "tsconfig.json",
    ".gitignore",
    ".env.example",
    "README.md"
  ];

  for (const file of requiredFiles) {
    await assertFileExists(path.join(targetDir, file));
  }

  const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
  assertEqual(packageJson.name, "notion-auto-lock-worker", "generated package name");
  assertEqual(packageJson.packageManager, "npm@11.17.0", "generated packageManager");
  assertEqual(packageJson.engines?.node, ">=22", "generated node engine");
  assertEqual(packageJson.engines?.npm, ">=10.9.2", "generated npm engine");
  assertEqual(packageJson.scripts?.build, "tsc", "build script");
  assertEqual(packageJson.scripts?.check, "tsc --noEmit", "check script");
  assertEqual(packageJson.scripts?.typecheck, "npm run check", "typecheck script");
  assertEqual(packageJson.scripts?.["dry-run"], "ntn workers sync trigger autoLockPages", "dry-run script");

  const index = await readFile(path.join(targetDir, "src", "index.ts"), "utf8");
  assertIncludes(index, 'const WORKER_SCHEDULE = "15m";', "schedule replacement");
  assertIncludes(index, 'const DEFAULT_LOCK_AFTER_MINUTES = Number("90");', "lock-after replacement");
  assertIncludes(index, "AUTO_LOCK_ROOT_PAGE_IDS", "root page scope configuration");
  assertIncludes(index, "AUTO_LOCK_DATA_SOURCE_IDS", "multi data source configuration");
  assertIncludes(index, "LOCK_ROOT_PAGES", "root page lock opt-in configuration");
  assertIncludes(index, "MAX_CRAWL_DEPTH", "crawl depth guard");
  assertIncludes(index, "MAX_CRAWL_PAGES", "crawl page guard");
  assertIncludes(index, 'result.type === "child_database"', "child database crawl");
  assertIncludes(index, "/blocks/${encodeURIComponent(blockId)}/children", "block children crawl");
  assertIncludes(index, "/databases/${encodeURIComponent(databaseId)}", "database retrieval");
  assertIncludes(index, 'is_locked: true', "lock operation");
  assertIncludes(index, 'mode: "incremental"', "incremental audit sync");

  const envExample = await readFile(path.join(targetDir, ".env.example"), "utf8");
  assertIncludes(envExample, "AUTO_LOCK_ROOT_PAGE_IDS=", "root page env example");
  assertIncludes(envExample, "AUTO_LOCK_DATA_SOURCE_IDS=", "data source list env example");
  assertIncludes(envExample, "LOCK_ROOT_PAGES=false", "root page lock opt-in env example");
  assertIncludes(envExample, "MAX_CRAWL_DEPTH=10", "crawl depth env example");
  assertIncludes(envExample, "MAX_CRAWL_PAGES=1000", "crawl page env example");

  const leftoverPlaceholders = await findPlaceholderFiles(targetDir);
  if (leftoverPlaceholders.length > 0) {
    throw new Error(`Unreplaced template placeholders found in ${leftoverPlaceholders.join(", ")}`);
  }
}

async function assertFileExists(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`${filePath} exists but is not a file.`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Expected generated file is missing: ${filePath}`);
    }
    throw error;
  }
}

async function findPlaceholderFiles(targetDir) {
  const matches = [];

  for (const file of await listFiles(targetDir)) {
    const content = await readFile(file, "utf8");
    if (/__[A-Z0-9_]+__/.test(content)) {
      matches.push(path.relative(targetDir, file));
    }
  }

  return matches;
}

async function listFiles(targetDir) {
  const entries = await readdir(targetDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const entryPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) {
    throw new Error(`${label}: expected generated content to include ${JSON.stringify(expected)}`);
  }
}
