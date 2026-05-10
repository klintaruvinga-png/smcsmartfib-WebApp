import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.join(__dirname, "..");
const RESEARCH_FILE = path.join(REPO_ROOT, "reports", "copilot-research.md");
const PLAN_FILE = path.join(REPO_ROOT, "reports", "codex-plan.md");
const PLAN_METADATA_FILE = path.join(REPO_ROOT, "reports", "codex-plan.meta.json");
const IMPLEMENTATION_FILE = path.join(REPO_ROOT, "reports", "codex-implementation.md");
const IMPLEMENTATION_METADATA_FILE = path.join(REPO_ROOT, "reports", "codex-implementation.meta.json");
const STATE_FILE = path.join(REPO_ROOT, ".smc-workflow-state.json");
// Write-only JSON lock — status field ("running"|"done") determines liveness.
// The file is NEVER deleted; it is overwritten on acquire and on release.
// This avoids EPERM failures from OneDrive holding a sync lock on the file.
const LOCK_FILE = path.join(REPO_ROOT, "reports", ".pipeline-lock.json");
const CLAUDE_PLAN_PROMPT_FILE = path.join(REPO_ROOT, ".github", "prompts", "codex-plan-prompt.md");
const CODEX_IMPLEMENT_PROMPT_FILE = path.join(
  REPO_ROOT,
  ".github",
  "prompts",
  "codex-implement-prompt.md",
);
const CODEX_OUTPUT_FILE = path.join(REPO_ROOT, "reports", "codex-last-message.txt");
// Written when the Claude CLI invocation fails so the watcher stops retrying until
// the research/issue changes or the file is manually deleted.
const CLAUDE_HARDENING_BLOCKED_FILE = path.join(REPO_ROOT, "reports", ".claude-hardening-blocked.json");
const POLL_INTERVAL_MS = 5000;
const CLAUDE_TIMEOUT_MS = 900000; // 15 min — larger research reports need more time
const CODEX_TIMEOUT_MS = 900000;
const LOCK_STALE_MS = 30 * 60 * 1000;

let lastObservedKey = null;

function log(message) {
  console.log(`[pipeline-watcher] ${new Date().toISOString()} - ${message}`);
}

function ensureReportsDir() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
}

function statMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function buildObservedKey() {
  return [
    statMtime(RESEARCH_FILE),
    statMtime(PLAN_FILE),
    statMtime(PLAN_METADATA_FILE),
    statMtime(STATE_FILE),
    statMtime(IMPLEMENTATION_FILE),
    statMtime(CLAUDE_HARDENING_BLOCKED_FILE),
  ].join(":");
}

function readJson(filePath) {
  // PowerShell's Set-Content -Encoding UTF8 writes a UTF-8 BOM on Windows.
  // Strip it before parsing so the watcher never fails on Copilot-written files.
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function markReadyForImplementation(state, source) {
  writeJson(STATE_FILE, {
    ...state,
    state: "READY_FOR_IMPLEMENTATION",
    editing_locked: false,
    plan_hardened_at: new Date().toISOString(),
    plan_source: source,
  });
}

function markImplementationComplete(state) {
  writeJson(STATE_FILE, {
    ...state,
    state: "IMPLEMENTATION_COMPLETE",
    implementation_completed_at: new Date().toISOString(),
  });
}

function isPermissionStub(text) {
  return /Waiting for permission to write/i.test(text)
    || /Please approve the file write above/i.test(text);
}

function isUsablePlan(text) {
  if (!text || isPermissionStub(text)) {
    return false;
  }

  const requiredSections = [
    "1. Issue validation",
    "2. Implementation contract",
    "3. Patch sequence",
    "4. Regression guards",
    "5. Non-goals",
    "6. Risk assessment",
    "7. Test requirements",
    "8. Implementation handoff",
  ];

  return requiredSections.every((section) => text.includes(section));
}

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readPlanMetadata() {
  if (!fs.existsSync(PLAN_METADATA_FILE)) {
    return null;
  }

  try {
    return readJson(PLAN_METADATA_FILE);
  } catch {
    return null;
  }
}

function writePlanMetadata(state) {
  writeJson(PLAN_METADATA_FILE, {
    issue: state.issue ?? "",
    research_hash: hashFile(RESEARCH_FILE),
    written_at: new Date().toISOString(),
  });
}

function writeHardeningBlockedState(state, reason) {
  writeJson(CLAUDE_HARDENING_BLOCKED_FILE, {
    blocked_at: new Date().toISOString(),
    reason,
    issue: state.issue ?? "",
    research_hash: (() => { try { return hashFile(RESEARCH_FILE); } catch { return null; } })(),
    resolution: [
      "Option A (automatic): ensure 'claude' CLI is installed and authenticated",
      "  — install:        npm install -g @anthropic-ai/claude-code",
      "  — authenticate:   claude auth",
      "  — then delete this file and the pipeline will retry automatically.",
      "Option B (manual): open Claude Code, ask it to harden the plan from",
      "  reports/copilot-research.md following .github/prompts/codex-plan-prompt.md,",
      "  save output to reports/codex-plan.md, write reports/codex-plan.meta.json,",
      "  and set .smc-workflow-state.json state to READY_FOR_IMPLEMENTATION.",
    ],
  });
}

function clearHardeningBlockedState() {
  try { fs.unlinkSync(CLAUDE_HARDENING_BLOCKED_FILE); } catch { /* ignore */ }
}

function isHardeningBlockedForCurrentState(state) {
  let blocked;
  try {
    blocked = readJson(CLAUDE_HARDENING_BLOCKED_FILE);
  } catch {
    return false;
  }

  if (blocked.issue !== (state.issue ?? "")) {
    return false;
  }

  try {
    if (blocked.research_hash !== hashFile(RESEARCH_FILE)) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function readImplementationMetadata() {
  if (!fs.existsSync(IMPLEMENTATION_METADATA_FILE)) {
    return null;
  }

  try {
    return readJson(IMPLEMENTATION_METADATA_FILE);
  } catch {
    return null;
  }
}

function writeImplementationMetadata(state) {
  writeJson(IMPLEMENTATION_METADATA_FILE, {
    issue: state.issue ?? "",
    plan_hash: hashFile(PLAN_FILE),
    written_at: new Date().toISOString(),
  });
}

function hasUsablePlanArtifactForState(state) {
  if (!fs.existsSync(RESEARCH_FILE) || !fs.existsSync(PLAN_FILE)) {
    return false;
  }

  try {
    const metadata = readPlanMetadata();
    if (!metadata) {
      return false;
    }

    if (metadata.issue !== (state.issue ?? "")) {
      return false;
    }

    if (metadata.research_hash !== hashFile(RESEARCH_FILE)) {
      return false;
    }

    return isUsablePlan(fs.readFileSync(PLAN_FILE, "utf8"));
  } catch {
    return false;
  }
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  try {
    return readJson(STATE_FILE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Invalid workflow state file: ${message}`);
    return null;
  }
}

function slugifyIssue(issue) {
  return issue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function canSignalPid(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Write-only lock primitives ────────────────────────────────────────────────
// The lock file is never deleted. Acquiring writes status:"running"; releasing
// overwrites with status:"done". A lock is considered active only when:
//   status === "running"  AND  owner process is alive  AND  not expired.
// OneDrive can return EPERM on unlink but not on writeFileSync.

function readLockState() {
  try {
    return readJson(LOCK_FILE);
  } catch {
    return null;
  }
}

function isActiveLock(lockState) {
  if (!lockState || lockState.status !== "running") {
    return false;
  }

  const startedAt = Date.parse(lockState.started_at ?? "");
  if (Number.isFinite(startedAt) && Date.now() - startedAt > LOCK_STALE_MS) {
    return false;
  }

  if (typeof lockState.pid === "number" && !canSignalPid(lockState.pid)) {
    return false;
  }

  return true;
}

function acquireLock(label) {
  ensureReportsDir();

  const existing = readLockState();
  if (isActiveLock(existing)) {
    return false;
  }

  if (existing && existing.status === "running") {
    log(`Overriding stale lock held by pid ${existing.pid} (${existing.label})`);
  }

  writeJson(LOCK_FILE, {
    label,
    pid: process.pid,
    started_at: new Date().toISOString(),
    status: "running",
  });
  return true;
}

function releaseLock() {
  const existing = readLockState();
  writeJson(LOCK_FILE, {
    ...(existing ?? {}),
    status: "done",
    finished_at: new Date().toISOString(),
  });
}

function withPipelineLock(label, fn) {
  if (!acquireLock(label)) {
    log("Pipeline already running - skipping trigger");
    return;
  }

  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${label} error: ${message}`);
  } finally {
    releaseLock();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function runClaudePlanHardening(state) {
  if (!fs.existsSync(RESEARCH_FILE)) {
    log("State is PLANNING but reports/copilot-research.md is missing");
    return;
  }

  if (isHardeningBlockedForCurrentState(state)) {
    log("Claude plan hardening blocked - see reports/.claude-hardening-blocked.json for resolution steps");
    return;
  }

  const prompt = `${fs.readFileSync(CLAUDE_PLAN_PROMPT_FILE, "utf8")}

## Runtime context
- Issue: ${state.issue}
- Input artifact: reports/copilot-research.md
- Output artifact: reports/codex-plan.md
- Return the plan as plain markdown on stdout only.
- Do not attempt to edit files or use any tools.
- Do not implement code.
- Stop after the plan is written.
`;

  withPipelineLock("claude-plan-hardening", () => {
    log("PLANNING detected - running Claude plan hardening");

    // Write prompt to a temp file to avoid Windows argv length limits (8 191-char CMD cap).
    // Mirrors the pattern used for Codex: pass content via stdin redirect, not via argv.
    const promptFile = path.join(REPO_ROOT, "reports", "claude-plan-prompt.tmp.md");
    fs.writeFileSync(promptFile, prompt, "utf8");

    let planText;
    try {
      // On Windows, execFileSync without shell cannot resolve .cmd shims in PATH.
      // Use execSync with shell:true and the platform-specific binary name instead —
      // exactly the same fix applied to the Codex invocation above.
      const claudeBin = process.platform === "win32" ? "claude.cmd" : "claude";
      const cmd = [
        `"${claudeBin}"`,
        "--print",
        "--output-format", "text",
        "--tools", '""',
        "<", `"${promptFile}"`,
      ].join(" ");

      planText = execSync(cmd, {
        cwd: REPO_ROOT,
        shell: true,
        timeout: CLAUDE_TIMEOUT_MS,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeHardeningBlockedState(state, message);
      log(`Claude CLI invocation failed — blocked state written. Fix: see reports/.claude-hardening-blocked.json`);
      throw err;
    } finally {
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
    }

    planText = planText.trim();
    if (!planText) {
      writeHardeningBlockedState(state, "Claude returned an empty response");
      throw new Error("Claude plan hardening returned an empty plan");
    }

    if (!isUsablePlan(planText)) {
      writeHardeningBlockedState(state, "Claude returned a response missing required plan sections");
      throw new Error("Claude plan hardening returned invalid plan output");
    }

    clearHardeningBlockedState();
    fs.writeFileSync(PLAN_FILE, `${planText}\n`, "utf8");
    writePlanMetadata(state);
    markReadyForImplementation(state, "claude");
    log("Claude plan hardening complete - state READY_FOR_IMPLEMENTATION");
  });
}

function isImplementationAlreadyDone(state) {
  if (!fs.existsSync(IMPLEMENTATION_FILE)) {
    return false;
  }
  // If the implementation file is newer than when the plan was hardened, Codex already
  // completed this cycle. Protect against re-runs on every watcher restart.
  const implMtime = statMtime(IMPLEMENTATION_FILE);
  const hardened = Date.parse(state.plan_hardened_at ?? "");
  if (!Number.isFinite(hardened) || implMtime <= hardened) {
    return false;
  }

  const metadata = readImplementationMetadata();
  if (!metadata) {
    // Backward compatibility: older/in-flight cycles may have a valid implementation
    // artifact without metadata. Fall back to mtime-only behavior to avoid duplicate
    // Codex runs and duplicate PR creation on watcher restart.
    return true;
  }

  if (metadata.issue !== (state.issue ?? "")) {
    return false;
  }

  try {
    return metadata.plan_hash === hashFile(PLAN_FILE);
  } catch {
    return false;
  }
}

function runCodexImplementation(state) {
  if (!fs.existsSync(RESEARCH_FILE) || !fs.existsSync(PLAN_FILE)) {
    log("READY_FOR_IMPLEMENTATION requires both research and plan artifacts");
    return;
  }

  if (isImplementationAlreadyDone(state)) {
    log("Codex implementation already complete for this cycle - marking IMPLEMENTATION_COMPLETE");
    markImplementationComplete(state);
    return;
  }

  const issueSlug = slugifyIssue(state.issue || "pipeline-issue");
  const prompt = `${fs.readFileSync(CODEX_IMPLEMENT_PROMPT_FILE, "utf8")}

## Runtime context
- Current issue: ${state.issue}
- Required branch: codex/${issueSlug}
- Implementation summary target: reports/codex-implementation.md
- Open a normal PR, not a draft PR.
- The existing Codex PR review automation starts after PR creation.
`;

  withPipelineLock("codex-implementation", () => {
    log("READY_FOR_IMPLEMENTATION detected - running Codex implementation");
    // Write the prompt to a temp file so we can feed it via stdin redirect
    // without relying on execFileSync's `input` option, which triggers EINVAL
    // on Windows when stdout/stderr are not inheritable (detached background process).
    const promptFile = path.join(REPO_ROOT, "reports", "codex-prompt.tmp.md");
    fs.writeFileSync(promptFile, prompt, "utf8");

    try {
      // execSync with shell:true lets Windows resolve codex.cmd and handle
      // the stdin redirect operator (<) without needing inheritable file descriptors.
      const codexBin = process.platform === "win32" ? "codex.cmd" : "codex";
      // --json disables the interactive TUI so codex can run in a detached
      // background process (no console attached). Without it, codex crashes
      // immediately with STATUS_CONTROL_C_EXIT (0xC000013A) on Windows.
      // --dangerously-bypass-approvals-and-sandbox already disables the sandbox,
      // so --sandbox workspace-write is redundant and removed to avoid conflict.
      const cmd = [
        `"${codexBin}"`,
        "exec",
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C", `"${REPO_ROOT}"`,
        "-o", `"${CODEX_OUTPUT_FILE}"`,
        "-",
        "<", `"${promptFile}"`,
      ].join(" ");

      execSync(cmd, {
        cwd: REPO_ROOT,
        shell: true,
        timeout: CODEX_TIMEOUT_MS,
        // stdin: "ignore" — the shell handles stdin via the < redirect in cmd.
        // stdout/stderr: "inherit" — Codex output streams directly to the
        // watcher's inherited log file descriptors (set by start-pipeline-runner.js
        // to logFd). This avoids buffering all output in memory, which would
        // hit Node's default execSync maxBuffer limit on verbose Codex runs.
        stdio: ["ignore", "inherit", "inherit"],
      });
    } finally {
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
    }

    if (!fs.existsSync(IMPLEMENTATION_FILE)) {
      throw new Error("Codex implementation finished without reports/codex-implementation.md");
    }

    writeImplementationMetadata(state);

    markImplementationComplete(state);
    log("Codex implementation run complete - state IMPLEMENTATION_COMPLETE");
  });
}

function evaluatePipeline() {
  const state = readState();
  if (!state) {
    return;
  }

  if (state.state === "PLANNING") {
    if (state.editing_locked !== true) {
      log("PLANNING state is invalid: editing_locked must be true");
      return;
    }

    // If a blocked state exists for a different issue or stale research hash, clear it
    // automatically so a new issue cycle is not forced into manual intervention.
    if (!isHardeningBlockedForCurrentState(state) && fs.existsSync(CLAUDE_HARDENING_BLOCKED_FILE)) {
      clearHardeningBlockedState();
      log("Stale blocked state cleared - new issue or research detected");
    }

    if (!hasUsablePlanArtifactForState(state)) {
      runClaudePlanHardening(state);
      return;
    }

    markReadyForImplementation(state, "existing-plan-artifact");
    log("Valid plan artifact detected - state READY_FOR_IMPLEMENTATION");
    return;
  }

  if (state.state === "READY_FOR_IMPLEMENTATION") {
    if (state.editing_locked !== false) {
      log("READY_FOR_IMPLEMENTATION is invalid: editing_locked must be false");
      return;
    }

    runCodexImplementation(state);
    return;
  }

  if (state.state === "IMPLEMENTATION_COMPLETE") {
    log("Pipeline cycle complete - waiting for next issue");
    return;
  }
}

function pollPipeline() {
  const observedKey = buildObservedKey();
  if (lastObservedKey === null) {
    lastObservedKey = observedKey;
    log("Watching workflow state, research artifact, and plan artifact");
    evaluatePipeline();
    return;
  }

  if (observedKey !== lastObservedKey) {
    lastObservedKey = observedKey;
    log("Pipeline state change detected");
    evaluatePipeline();
  }
}

function checkClaudeAvailability() {
  try {
    const claudeBin = process.platform === "win32" ? "claude.cmd" : "claude";
    execSync(`"${claudeBin}" --version`, {
      shell: true,
      timeout: 10000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    log("Claude CLI health check passed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`WARNING: Claude CLI health check failed — plan hardening will be blocked on PLANNING state`);
    log(`  Reason: ${message}`);
    log(`  Fix:    npm install -g @anthropic-ai/claude-code  then  claude auth`);
  }
}

log("Pipeline watcher started");
checkClaudeAvailability();
setInterval(pollPipeline, POLL_INTERVAL_MS);
