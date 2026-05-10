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
const IMPLEMENTATION_FAILED_FILE = path.join(REPO_ROOT, "reports", ".codex-implementation-failed.json");
const STATE_FILE = path.join(REPO_ROOT, ".smc-workflow-state.json");
// Write-only JSON lock — status field ("running"|"done") determines liveness.
// The file is NEVER deleted; it is overwritten on acquire and on release.
// This avoids EPERM failures from OneDrive holding a sync lock on the file.
const LOCK_FILE = path.join(REPO_ROOT, "reports", ".pipeline-lock.json");
const ARCHIVE_DIR = path.join(REPO_ROOT, "reports", "archive");
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
const CODEX_TIMEOUT_MS = 1800000; // 30 min — complex implementations regularly exceed 15 min
const LOCK_STALE_MS = 30 * 60 * 1000;

// On Windows, execSync with shell:true spawns cmd.exe which is blocked with EPERM
// in detached background processes (the job object created by start-pipeline-runner.js
// restricts child process creation for cmd.exe). This function finds the native
// claude.exe so it can be called directly via execFileSync — no shell required.
function resolveClaudeExe() {
  if (process.platform !== "win32") {
    return null; // Non-Windows uses shell-based invocation
  }

  const npmRoot = process.env.APPDATA
    ? path.join(process.env.APPDATA, "npm")
    : null;

  const candidates = [];

  if (npmRoot) {
    // Primary: the .exe bundled inside the npm global package (what claude.cmd delegates to)
    candidates.push(
      path.join(npmRoot, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    );
    // Also parse the claude.cmd shim — it embeds the delegated exe path on the last exec line.
    const cmdShim = path.join(npmRoot, "claude.cmd");
    if (fs.existsSync(cmdShim)) {
      try {
        const content = fs.readFileSync(cmdShim, "utf8");
        // Shim line: "%dp0%\node_modules\...\claude.exe"   %*
        // %dp0% is the batch file's own directory (the npm bin dir).
        const match = content.match(/"(%dp0%[^"]+claude\.exe)"/i);
        if (match) {
          const resolved = match[1].replace(/%dp0%/gi, npmRoot + path.sep);
          candidates.unshift(resolved);
        }
      } catch { /* ignore */ }
    }
  }

  // Fallback: standalone installation under the user profile
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, ".local", "bin", "claude.exe"));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

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
  // For states that wait on an external GitHub event (PR merge), inject a
  // minute-level time bucket so the poll loop re-evaluates every ~60 s even
  // when no local file changes, without requiring a separate timer.
  let timeBucket = 0;
  try {
    const s = readJson(STATE_FILE);
    if (s?.state === "IMPLEMENTATION_COMPLETE" || s?.state === "IMPLEMENTATION_FAILED") {
      timeBucket = Math.floor(Date.now() / 60000);
    }
  } catch { /* ignore */ }

  return [
    statMtime(RESEARCH_FILE),
    statMtime(PLAN_FILE),
    statMtime(PLAN_METADATA_FILE),
    statMtime(STATE_FILE),
    statMtime(IMPLEMENTATION_FILE),
    statMtime(IMPLEMENTATION_FAILED_FILE),
    statMtime(CLAUDE_HARDENING_BLOCKED_FILE),
    timeBucket,
  ].join(":");
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^ï»¿/, "");
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
  clearImplementationFailedState();
  writeJson(STATE_FILE, {
    ...state,
    state: "READY_FOR_IMPLEMENTATION",
    editing_locked: false,
    plan_hardened_at: new Date().toISOString(),
    plan_source: source,
    implementation_completed_at: undefined,
    implementation_failed_at: undefined,
    implementation_failure_reason: undefined,
  });
}

function markImplementationComplete(state) {
  clearImplementationFailedState();
  writeJson(STATE_FILE, {
    ...state,
    state: "IMPLEMENTATION_COMPLETE",
    implementation_completed_at: new Date().toISOString(),
    implementation_failed_at: undefined,
    implementation_failure_reason: undefined,
  });
}

function markImplementationFailed(state, reason) {
  writeJson(STATE_FILE, {
    ...state,
    state: "IMPLEMENTATION_FAILED",
    editing_locked: false,
    implementation_failed_at: new Date().toISOString(),
    implementation_failure_reason: reason,
    implementation_completed_at: undefined,
  });
}

function markIdle(reason) {
  writeJson(STATE_FILE, {
    state: "IDLE",
    idled_at: new Date().toISOString(),
    idle_reason: reason,
  });
  log(`Pipeline reset to IDLE: ${reason}`);
}

// Returns { number } if an open (not yet merged) PR for the branch exists, else null.
// Used to detect when Codex created a PR but the execSync wrapper timed out before
// the watcher could record IMPLEMENTATION_COMPLETE.
function checkOpenPR(issueSlug) {
  try {
    const raw = execSync(
      `gh pr list --head "codex/${issueSlug}" --state open --json number --limit 1`,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 15000,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const prs = JSON.parse(raw.trim() || "[]");
    return prs.length ? prs[0] : null;
  } catch {
    return null;
  }
}

// Returns { number, mergedAt } if a merged PR for the current cycle exists, else null.
function checkMergedPR(issueSlug, cycleStartedAt) {
  try {
    const raw = execSync(
      `gh pr list --head "codex/${issueSlug}" --state merged --json number,mergedAt --limit 20`,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 15000,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const prs = JSON.parse(raw.trim() || "[]");
    if (!prs.length) return null;

    if (!cycleStartedAt) {
      return prs[0];
    }

    const cycleStartMs = Date.parse(cycleStartedAt);
    if (!Number.isFinite(cycleStartMs)) {
      return prs[0];
    }

    return prs.find((pr) => Number.isFinite(Date.parse(pr.mergedAt)) && Date.parse(pr.mergedAt) >= cycleStartMs) || null;
  } catch {
    return null;
  }
}

// Copies completed cycle artifacts to reports/archive/<slug>-<ts>/ then removes
// the originals so the next cycle starts with a clean slate.
function archiveCycleArtifacts(issueSlug) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(ARCHIVE_DIR, `${issueSlug}-${ts}`);
  fs.mkdirSync(dest, { recursive: true });

  const artifacts = [
    [RESEARCH_FILE, "copilot-research.md"],
    [PLAN_FILE, "codex-plan.md"],
    [PLAN_METADATA_FILE, "codex-plan.meta.json"],
    [IMPLEMENTATION_FILE, "codex-implementation.md"],
    [IMPLEMENTATION_METADATA_FILE, "codex-implementation.meta.json"],
  ];

  for (const [src, name] of artifacts) {
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, path.join(dest, name));
        fs.unlinkSync(src);
      } catch { /* ignore individual file errors */ }
    }
  }

  log(`Cycle artifacts archived to reports/archive/${issueSlug}-${ts}/`);
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

function isUsableImplementation(text) {
  if (!text || isPermissionStub(text)) {
    return false;
  }

  const requiredSections = [
    "Issue summary",
    "Root cause implemented",
    "Exact files changed",
    "Tests run",
    "Reports generated",
    "Remaining risks",
    "Any contract ambiguities resolved during implementation",
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

function writeImplementationFailedState(state, reason, details = {}) {
  writeJson(IMPLEMENTATION_FAILED_FILE, {
    failed_at: new Date().toISOString(),
    issue: state.issue ?? "",
    plan_hash: (() => {
      try {
        return hashFile(PLAN_FILE);
      } catch {
        return null;
      }
    })(),
    reason,
    ...details,
  });
}

function clearImplementationFailedState() {
  try { fs.unlinkSync(IMPLEMENTATION_FAILED_FILE); } catch { /* ignore */ }
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

    return isUsablePlan(readTextFile(PLAN_FILE));
  } catch {
    return false;
  }
}

function summarizeCodexStopReason(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^\*\*Stopped\*\*$/i.test(line) || /^Stopped$/i.test(line)) {
      continue;
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      continue;
    }
    return line.replace(/\*\*/g, "");
  }

  return "Codex stopped without applying the patch";
}

function detectCodexStopReason(text) {
  const normalized = text.trim();
  if (!normalized) {
    return "Codex exited without writing a final status message";
  }

  if (/^\*\*Stopped\*\*$/im.test(normalized) || /^Stopped$/im.test(normalized)) {
    return summarizeCodexStopReason(normalized);
  }

  if (/did not patch, switch branches, commit, or open a PR/i.test(normalized)) {
    return "Codex stopped before patching, branching, committing, or opening a PR";
  }

  return null;
}

function validateImplementationRun(previousImplementationMtime, previousOutputMtime) {
  const outputMtime = statMtime(CODEX_OUTPUT_FILE);
  if (outputMtime <= previousOutputMtime) {
    return {
      reason: "Codex run finished without refreshing reports/codex-last-message.txt",
    };
  }

  const outputText = readTextFile(CODEX_OUTPUT_FILE).trim();
  const stopReason = detectCodexStopReason(outputText);
  if (stopReason) {
    return {
      reason: stopReason,
      details: {
        codex_output_excerpt: outputText.slice(0, 4000),
      },
    };
  }

  if (!fs.existsSync(IMPLEMENTATION_FILE)) {
    return {
      reason: "Codex implementation finished without reports/codex-implementation.md",
    };
  }

  const implementationMtime = statMtime(IMPLEMENTATION_FILE);
  if (implementationMtime <= previousImplementationMtime) {
    return {
      reason: "Codex run finished without updating reports/codex-implementation.md",
    };
  }

  const implementationText = readTextFile(IMPLEMENTATION_FILE).trim();
  if (!implementationText) {
    return {
      reason: "Codex implementation wrote an empty reports/codex-implementation.md",
    };
  }

  if (!isUsableImplementation(implementationText)) {
    return {
      reason: "Codex implementation wrote an invalid reports/codex-implementation.md",
      details: {
        implementation_excerpt: implementationText.slice(0, 4000),
      },
    };
  }

  return null;
}

function failImplementation(state, reason, details = {}) {
  writeImplementationFailedState(state, reason, details);
  markImplementationFailed(state, reason);
  log("Codex implementation failed - state IMPLEMENTATION_FAILED");
  log(`  Reason: ${reason}`);
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

  withPipelineLock("claude-plan-hardening", () => {
    log("PLANNING detected - running Claude plan hardening");

    // The entire input — instructions, runtime context, and research — is written
    // to stdin as one stream. claude --print (boolean flag, no value) reads the
    // prompt from stdin. This avoids the two failure modes seen with -p / --print:
    //   1. Non-ASCII characters (em dashes) in the argument are mangled by cmd.exe.
    //   2. When -p "value" is provided, the CLI does not read stdin as supplementary
    //      context, so the template and research content never reach the model.
    const stdinInput = [
      "Produce a hardened implementation contract. Follow all instructions in the TEMPLATE section exactly. Return only the plan markdown - no preamble, no prose outside the numbered sections.",
      "",
      "# TEMPLATE",
      "",
      fs.readFileSync(CLAUDE_PLAN_PROMPT_FILE, "utf8").trim(),
      "",
      "# RUNTIME CONTEXT",
      "",
      `Issue: ${state.issue}`,
      "Input artifact: reports/copilot-research.md",
      "Output artifact: reports/codex-plan.md",
      "Return the plan as plain markdown on stdout only.",
      "Do not attempt to edit files or use any tools.",
      "Do not implement code.",
      "Stop after the plan is written.",
      "",
      "# RESEARCH REPORT",
      "",
      fs.readFileSync(RESEARCH_FILE, "utf8").trim(),
    ].join("\n");

    // On Windows, execSync with shell:true spawns cmd.exe which fails with EPERM
    // in the detached background process spawned by start-pipeline-runner.js.
    // Fix: resolve the native claude.exe and call it directly via execFileSync —
    // no shell required, full input piped via stdin.
    const claudeExe = resolveClaudeExe();

    let planText;
    try {
      if (claudeExe) {
        log(`Claude CLI resolved to ${path.basename(path.dirname(claudeExe))}/${path.basename(claudeExe)} - using direct exe invocation`);
        planText = execFileSync(
          claudeExe,
          ["--print", "--output-format", "text", "--tools", ""],
          {
            cwd: REPO_ROOT,
            input: stdinInput,
            timeout: CLAUDE_TIMEOUT_MS,
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
          },
        );
      } else {
        // Non-Windows or exe not found: fall back to shell-based invocation.
        // Write the full input to a temp file and redirect via < so the shell
        // pipes everything (prompt + template + research) into claude's stdin.
        const contextFile = path.join(REPO_ROOT, "reports", "claude-plan-context.tmp.md");
        fs.writeFileSync(contextFile, stdinInput, "utf8");
        try {
          const cmd = ['"claude"', "--print", "--output-format", "text", "<", `"${contextFile}"`].join(" ");
          planText = execSync(cmd, {
            cwd: REPO_ROOT,
            shell: true,
            timeout: CLAUDE_TIMEOUT_MS,
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
          });
        } finally {
          try { fs.unlinkSync(contextFile); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeHardeningBlockedState(state, message);
      log(`Claude CLI invocation failed - blocked state written. Fix: see reports/.claude-hardening-blocked.json`);
      throw err;
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
  const previousImplementationMtime = statMtime(IMPLEMENTATION_FILE);
  const previousOutputMtime = statMtime(CODEX_OUTPUT_FILE);

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
    } catch (error) {
      const outputText = fs.existsSync(CODEX_OUTPUT_FILE)
        ? readTextFile(CODEX_OUTPUT_FILE).trim()
        : "";
      const stopReason = outputText ? detectCodexStopReason(outputText) : null;
      const reason = stopReason
        ?? (error instanceof Error
          ? `Codex CLI invocation failed: ${error.message}`
          : `Codex CLI invocation failed: ${String(error)}`);

      // Before recording failure, check whether Codex already created an open PR.
      // When execSync hits the timeout (ETIMEDOUT), Codex may have finished all
      // work — branch, commit, push, PR — but the wrapper expired before the
      // watcher could validate. Treat an existing open PR as success so the
      // pipeline advances to IMPLEMENTATION_COMPLETE rather than going dead-end.
      const openPr = checkOpenPR(issueSlug);
      if (openPr) {
        log(`Codex execSync timed out but open PR #${openPr.number} exists for codex/${issueSlug} - treating as IMPLEMENTATION_COMPLETE`);
        writeImplementationMetadata(state);
        markImplementationComplete(state);
        return;
      }

      failImplementation(state, reason, {
        codex_output_excerpt: outputText.slice(0, 4000),
      });
      return;
    } finally {
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
    }

    const validationFailure = validateImplementationRun(
      previousImplementationMtime,
      previousOutputMtime,
    );
    if (validationFailure) {
      failImplementation(state, validationFailure.reason, validationFailure.details);
      return;
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

  if (state.state === "IDLE") {
    log("Pipeline idle - waiting for new /research-and-plan issue");
    return;
  }

  if (state.state === "IMPLEMENTATION_COMPLETE") {
    const issueSlug = slugifyIssue(state.issue || "pipeline-issue");
    const merged = checkMergedPR(issueSlug, state.plan_hardened_at);
    if (merged) {
      log(`PR #${merged.number} for codex/${issueSlug} merged at ${merged.mergedAt} - closing cycle`);
      archiveCycleArtifacts(issueSlug);
      clearImplementationFailedState();
      markIdle(`PR #${merged.number} merged for: ${state.issue}`);
    } else {
      log(`Pipeline cycle complete - PR open for codex/${issueSlug}, waiting for merge`);
    }
    return;
  }

  if (state.state === "IMPLEMENTATION_FAILED") {
    const issueSlug = slugifyIssue(state.issue || "pipeline-issue");

    // Allow a manually merged PR to close the loop even after a recorded failure.
    const merged = checkMergedPR(issueSlug, state.plan_hardened_at);
    if (merged) {
      log(`PR #${merged.number} for codex/${issueSlug} merged despite failure - closing cycle`);
      archiveCycleArtifacts(issueSlug);
      clearImplementationFailedState();
      markIdle(`PR #${merged.number} merged for: ${state.issue}`);
      return;
    }

    // Self-heal: if an open PR exists for this issue, Codex finished its work
    // before the execSync wrapper timed out. Advance to IMPLEMENTATION_COMPLETE
    // so the watcher can wait for the PR to be merged normally.
    const openPr = checkOpenPR(issueSlug);
    if (openPr) {
      log(`Open PR #${openPr.number} found for codex/${issueSlug} despite recorded failure - advancing to IMPLEMENTATION_COMPLETE`);
      clearImplementationFailedState();
      markImplementationComplete(state);
      return;
    }

    log(
      "Pipeline implementation failed - waiting for corrected artifacts or a new issue"
      + (state.implementation_failure_reason ? ` (${state.implementation_failure_reason})` : ""),
    );
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
  const claudeExe = resolveClaudeExe();
  try {
    if (claudeExe) {
      execFileSync(claudeExe, ["--version"], {
        timeout: 10000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      log(`Claude CLI health check passed (${path.basename(claudeExe)})`);
    } else {
      execSync('"claude" --version', {
        shell: true,
        timeout: 10000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      log("Claude CLI health check passed");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`WARNING: Claude CLI health check failed - plan hardening will be blocked on PLANNING state`);
    log(`  Reason: ${message}`);
    log(`  Fix:    npm install -g @anthropic-ai/claude-code  then  claude auth`);
  }
}

log("Pipeline watcher started");
checkClaudeAvailability();
setInterval(pollPipeline, POLL_INTERVAL_MS);
