#!/usr/bin/env node

import { createProject, parseCliArgs } from "./scaffold.js";

try {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(options.helpText);
    process.exit(0);
  }

  const result = await createProject(options);
  console.log(`Created ${result.projectName} in ${result.targetDir}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${result.relativeTargetDir}`);
  console.log("  npm install");
  console.log("  npm run check");
  console.log("  ntn login");
  console.log("  ntn workers env set AUTO_LOCK_API_TOKEN=ntn_...");
  console.log("  ntn workers env set AUTO_LOCK_ROOT_PAGE_IDS=...");
  console.log("  ntn workers env set DRY_RUN=true");
  console.log("  ntn workers deploy");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
