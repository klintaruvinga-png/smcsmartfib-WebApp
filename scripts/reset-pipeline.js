import fs from "node:fs";
import path from "node:path";
import { readWorkflowState, writeWorkflowState } from "./workflow-state.js";
import { resolvePipelineContext } from "./pipeline-config.js";

const PIPELINE_CONTEXT = resolvePipelineContext();
const STATE_FILE = PIPELINE_CONTEXT.paths.stateFile;
const REPORTS_DIR = PIPELINE_CONTEXT.paths.reportsDir;
const ARCHIVE_DIR = PIPELINE_CONTEXT.paths.archiveDir;
const PIPELINE_RESET_FILE = PIPELINE_CONTEXT.paths.resetFile;
const RESEARCH_FILE = PIPELINE_CONTEXT.paths.researchFile;
const PLAN_FILE = PIPELINE_CONTEXT.paths.planFile;
const PLAN_METADATA_FILE = PIPELINE_CONTEXT.paths.planMetadataFile;
const IMPLEMENTATION_FILE = PIPELINE_CONTEXT.paths.implementationFile;
const IMPLEMENTATION_METADATA_FILE = PIPELINE_CONTEXT.paths.implementationMetadataFile;

function buildArchiveTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function archiveFileWithCopyDelete(src, destDir, name) {
  if (!fs.existsSync(src)) {
    return false;
  }

  fs.mkdirSync(destDir, { recursive: true });

  try {
    fs.copyFileSync(src, path.join(destDir, name));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[reset-pipeline] WARNING: Failed to archive reports/${name} (${message})`);
    return false;
  }

  try {
    fs.unlinkSync(src);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[reset-pipeline] WARNING: Archived reports/${name} but source removal failed (${message})`,
    );
  }

  console.log(`[reset-pipeline] Archived reports/${name} during manual reset`);
  return true;
}

function isCurrentCycleResearchArtifact(state) {
  if (!state || !fs.existsSync(RESEARCH_FILE)) {
    return false;
  }

  const cycleStartedAt = Date.parse(state.started_at ?? "");
  if (!Number.isFinite(cycleStartedAt)) {
    return false;
  }

  try {
    return fs.statSync(RESEARCH_FILE).mtimeMs >= cycleStartedAt;
  } catch {
    return false;
  }
}

function archiveArtifactsForManualReset(state) {
  const dest = path.join(ARCHIVE_DIR, `manual-reset-${buildArchiveTimestamp()}`);
  const artifacts = [
    ...(isCurrentCycleResearchArtifact(state) ? [[RESEARCH_FILE, "copilot-research.md"]] : []),
    [PLAN_FILE, "claude-plan.md"],
    [PLAN_METADATA_FILE, "claude-plan.meta.json"],
    [IMPLEMENTATION_FILE, "claude-implementation.md"],
    [IMPLEMENTATION_METADATA_FILE, "claude-implementation.meta.json"],
  ];

  let archivedAny = false;
  for (const [src, name] of artifacts) {
    archivedAny = archiveFileWithCopyDelete(src, dest, name) || archivedAny;
  }

  if (!archivedAny) {
    console.log("[reset-pipeline] No plan or implementation artifacts required archiving.");
  }
}

function markIdle(reason) {
  writeWorkflowState(STATE_FILE, {
    state: "IDLE",
    idled_at: new Date().toISOString(),
    idle_reason: reason,
  });
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  let state = null;
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = readWorkflowState(STATE_FILE, { autoRepair: true, snapshotDir: ARCHIVE_DIR });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[reset-pipeline] WARNING: Failed to read ${path.basename(STATE_FILE)} (${message}). Continuing with manual reset.`,
      );
      state = null;
    }
  }
  if (state) {
    console.log(`[reset-pipeline] Current state: ${state.state}`);
    if (state.issue) {
      console.log(`[reset-pipeline] Active issue: ${state.issue}`);
    }
    if (state.implementation_failure_reason) {
      console.log(`[reset-pipeline] Failure reason: ${state.implementation_failure_reason}`);
    }
  } else {
    console.log(
      "[reset-pipeline] No workflow state file found. Archiving orphaned artifacts only.",
    );
  }

  if (state?.state === "PLANNING" && state.editing_locked === true) {
    console.error(
      "[reset-pipeline] ERROR: Cannot reset while in PLANNING state with editing_locked=true.",
    );
    console.error(
      "  The pipeline is actively hardening the implementation plan. Wait for it to finish.",
    );
    process.exit(1);
  }

  archiveArtifactsForManualReset(state);
  markIdle("Manual pipeline reset requested via reports/.pipeline-reset-requested");
  console.log("[reset-pipeline] Workflow state reset to IDLE.");

  fs.writeFileSync(
    PIPELINE_RESET_FILE,
    `${JSON.stringify({ requested_at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );

  console.log("[reset-pipeline] Reset sentinel written to reports/.pipeline-reset-requested");
  console.log(
    "[reset-pipeline] If a pipeline watcher is running, it will observe the reset within 5 seconds.",
  );
}

main();
