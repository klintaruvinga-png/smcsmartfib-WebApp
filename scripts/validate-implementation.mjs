/**
 * validate-implementation.mjs
 *
 * Regression guard for the Codex pipeline.
 *
 * Run after every Codex implementation to verify that the required
 * artifacts are present and well-formed before marking the pipeline
 * IMPLEMENTATION_COMPLETE. The pipeline-watcher.js already performs
 * these checks inside validateImplementationRun(), but this script
 * is a standalone, human-runnable equivalent that:
 *
 *   1. Can be invoked manually to diagnose a failure.
 *   2. Can be added as a pre-commit hook to prevent partial artifacts
 *      from being committed.
 *   3. Serves as living documentation of the exact checks the watcher
 *      performs, so future failures are immediately diagnosable.
 *
 * Usage:
 *   node scripts/validate-implementation.mjs
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks failed (details printed to stderr)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, "..");

const IMPLEMENTATION_FILE = path.join(REPO_ROOT, "reports", "codex-implementation.md");
const IMPLEMENTATION_META_FILE = path.join(REPO_ROOT, "reports", "codex-implementation.meta.json");
const PLAN_FILE = path.join(REPO_ROOT, "reports", "codex-plan.md");
const STATE_FILE = path.join(REPO_ROOT, ".smc-workflow-state.json");
const FAILED_FILE = path.join(REPO_ROOT, "reports", ".codex-implementation-failed.json");

// Required top-level sections in codex-implementation.md.
// MUST match isUsableImplementation() in scripts/pipeline-watcher.js exactly.
const REQUIRED_SECTIONS = [
  "Issue summary",
  "Root cause implemented",
  "Exact files changed",
  "Tests run",
  "Reports generated",
  "Remaining risks",
  "Any contract ambiguities resolved during implementation",
];

function pass(msg) {
  console.log(`  ✔ ${msg}`);
}
function fail(msg) {
  console.error(`  ✘ ${msg}`);
}
function header(msg) {
  console.log(`\n${msg}`);
}

let failCount = 0;

function check(condition, passMsg, failMsg) {
  if (condition) {
    pass(passMsg);
  } else {
    fail(failMsg);
    failCount++;
  }
}

// ── 1. reports/codex-implementation.md ───────────────────────────────────────

header("1. reports/codex-implementation.md");

const implExists = fs.existsSync(IMPLEMENTATION_FILE);
check(implExists, "File exists", "File MISSING — Codex did not write the implementation report");

if (implExists) {
  const implText = fs.readFileSync(IMPLEMENTATION_FILE, "utf8").trim();
  check(implText.length > 0, "File is non-empty", "File is empty");

  for (const section of REQUIRED_SECTIONS) {
    check(
      implText.includes(section),
      `Contains required section: "${section}"`,
      `MISSING required section: "${section}" — pipeline-watcher will reject this report`,
    );
  }
}

// ── 2. reports/codex-implementation.meta.json ────────────────────────────────

header("2. reports/codex-implementation.meta.json");

const metaExists = fs.existsSync(IMPLEMENTATION_META_FILE);
check(metaExists, "File exists", "File MISSING — pipeline will re-run Codex on next watcher tick");

if (metaExists) {
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(IMPLEMENTATION_META_FILE, "utf8").replace(/^﻿/, ""));
    check(true, "Valid JSON", "");
  } catch {
    fail("Invalid JSON — file is corrupt");
    failCount++;
    meta = null;
  }

  if (meta) {
    check(
      typeof meta.issue === "string" && meta.issue.length > 0,
      "Contains 'issue' field",
      "Missing 'issue' field",
    );
    check(
      typeof meta.plan_hash === "string" && meta.plan_hash.length === 64,
      "Contains 'plan_hash' (SHA-256)",
      "Missing or malformed 'plan_hash'",
    );
    check(
      typeof meta.written_at === "string",
      "Contains 'written_at' timestamp",
      "Missing 'written_at'",
    );

    // Verify plan_hash matches the current plan file.
    if (fs.existsSync(PLAN_FILE)) {
      const { createHash } = await import("node:crypto");
      const planHash = createHash("sha256").update(fs.readFileSync(PLAN_FILE)).digest("hex");
      check(
        meta.plan_hash === planHash,
        "plan_hash matches current reports/codex-plan.md",
        `plan_hash MISMATCH — meta has ${meta.plan_hash.slice(0, 8)}… but plan is ${planHash.slice(0, 8)}…`,
      );
    }
  }
}

// ── 3. reports/.codex-implementation-failed.json (should NOT exist) ──────────

header("3. reports/.codex-implementation-failed.json (must be absent for success)");

const failedExists = fs.existsSync(FAILED_FILE);
check(
  !failedExists,
  "Failure sentinel absent — no recorded failure",
  "Failure sentinel present — pipeline recorded a failure: " +
    (failedExists ? JSON.parse(fs.readFileSync(FAILED_FILE, "utf8")).reason : ""),
);

// ── 4. Workflow state ─────────────────────────────────────────────────────────

header("4. .smc-workflow-state.json");

const stateExists = fs.existsSync(STATE_FILE);
check(stateExists, "Workflow state file exists", "Workflow state file MISSING");

if (stateExists) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8").replace(/^﻿/, ""));
    check(true, "Valid JSON", "");
  } catch {
    fail("Invalid JSON — self-repair required");
    failCount++;
    state = null;
  }

  if (state) {
    const validStates = ["IMPLEMENTATION_COMPLETE", "READY_FOR_IMPLEMENTATION"];
    check(
      validStates.includes(state.state),
      `State is ${state.state}`,
      `Unexpected state: ${state.state} (expected IMPLEMENTATION_COMPLETE or READY_FOR_IMPLEMENTATION)`,
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("");
if (failCount === 0) {
  console.log("All checks passed — implementation artifacts are valid.");
  process.exit(0);
} else {
  console.error(`${failCount} check(s) failed.`);
  console.error("");
  console.error("Common causes and fixes:");
  console.error("  • 'Codex implementation finished without reports/codex-implementation.md'");
  console.error("    → Codex ran successfully but skipped step 9 (write implementation summary).");
  console.error("    → Fix: write reports/codex-implementation.md manually with all 7 required");
  console.error(
    "      sections, then set .smc-workflow-state.json state to IMPLEMENTATION_COMPLETE.",
  );
  console.error("  • plan_hash mismatch");
  console.error("    → The plan was modified after Codex wrote its meta. Re-run validation or");
  console.error("      delete reports/codex-implementation.meta.json and let the watcher retry.");
  console.error("  • Failure sentinel present");
  console.error("    → Delete reports/.codex-implementation-failed.json to allow the watcher to");
  console.error("      retry, or advance the state manually after confirming the work is done.");
  process.exit(1);
}
