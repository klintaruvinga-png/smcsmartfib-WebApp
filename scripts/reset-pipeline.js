import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.join(__dirname, "..");
const STATE_FILE = path.join(REPO_ROOT, ".smc-workflow-state.json");
const REPORTS_DIR = path.join(REPO_ROOT, "reports");
const PIPELINE_RESET_FILE = path.join(REPORTS_DIR, ".pipeline-reset-requested");

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const state = readJson(STATE_FILE);
  if (state) {
    console.log(`[reset-pipeline] Current state: ${state.state}`);
    if (state.issue) {
      console.log(`[reset-pipeline] Active issue: ${state.issue}`);
    }
    if (state.implementation_failure_reason) {
      console.log(`[reset-pipeline] Failure reason: ${state.implementation_failure_reason}`);
    }
  } else {
    console.log("[reset-pipeline] No workflow state file found — nothing to reset.");
    process.exit(0);
  }

  if (state.state === "PLANNING" && state.editing_locked === true) {
    console.error(
      "[reset-pipeline] ERROR: Cannot reset while in PLANNING state with editing_locked=true.",
    );
    console.error(
      "  The pipeline is actively hardening the implementation plan. Wait for it to finish.",
    );
    process.exit(1);
  }

  fs.writeFileSync(
    PIPELINE_RESET_FILE,
    `${JSON.stringify({ requested_at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );

  console.log("[reset-pipeline] Reset sentinel written to reports/.pipeline-reset-requested");
  console.log(
    "[reset-pipeline] If a pipeline watcher is running, it will reset to IDLE within 5 seconds.",
  );
  console.log("[reset-pipeline] If no watcher is running, start one with: npm run pipeline:start");
}

main();
