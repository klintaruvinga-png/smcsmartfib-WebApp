//!/usr/bin/env node
/**
 * Global entry point for the /research-and-plan slash command.
 * It forwards to the existing pipeline-watcher implementation, using the
 * current working directory as the repository root.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve the location of the pipeline-watcher script relative to this file.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const watcherPath = path.resolve(__dirname, "pipeline-watcher.js");

// Run the watcher with the explicit --repo argument pointing at cwd.
// The watcher itself handles its own loop; we simply exec it and inherit stdio.
execFileSync(process.execPath, [watcherPath, "--repo", process.cwd()], {
  stdio: "inherit",
  windowsHide: true,
});
