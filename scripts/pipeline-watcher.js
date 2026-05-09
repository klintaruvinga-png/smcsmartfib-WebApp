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
    const output = execFileSync("claude", [
      "--print",
      "--output-format", "text",
      "--tools", "",
      prompt,
    ], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: CLAUDE_TIMEOUT_MS,
    });

    const planText = output.trim();
    if (!planText) {
      throw new Error("Claude plan hardening returned an empty plan");
    }

    if (!isUsablePlan(planText)) {
      throw new Error("Claude plan hardening returned invalid plan output");
    }

    fs.writeFileSync(PLAN_FILE, `${planText}\n`, "utf8");
    writePlanMetadata(state);
    markReadyForImplementation(state, "claude");
    log("Claude plan hardening complete - state READY_FOR_IMPLEMENTATION");
  });
}

function runCodexImplementation(state) {
  if (!fs.existsSync(RESEARCH_FILE) || !fs.existsSync(PLAN_FILE)) {
    log("READY_FOR_IMPLEMENTATION requires both research and plan artifacts");
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
      // Wrap paths in quotes to handle spaces (OneDrive paths).
      const cmd = [
        `"${codexBin}"`,
        "exec",
        "--sandbox", "workspace-write",
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

    log("Codex implementation run complete");
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

log("Pipeline watcher started");
setInterval(pollPipeline, POLL_INTERVAL_MS);
