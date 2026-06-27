import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readWorkflowState } from "./workflow-state.js";
import { resolvePipelineContext } from "./pipeline-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PIPELINE_CONTEXT = resolvePipelineContext();
const REPO_ROOT = PIPELINE_CONTEXT.repoRoot;
const CONFIG = PIPELINE_CONTEXT.config;
const {
  reportsDir: REPORTS_DIR,
  researchFile: RESEARCH_FILE,
  planFile: PLAN_FILE,
  planMetadataFile: PLAN_METADATA_FILE,
  implementationFile: IMPLEMENTATION_FILE,
  implementationMetadataFile: IMPLEMENTATION_METADATA_FILE,
  implementationFailedFile: IMPLEMENTATION_FAILED_FILE,
  stateFile: STATE_FILE,
  lockFile: LOCK_FILE,
  archiveDir: ARCHIVE_DIR,
  planPromptFile: PLAN_PROMPT_FILE,
  implementationPromptFile: CLAUDE_IMPLEMENT_PROMPT_FILE,
  lastMessageFile: CLAUDE_OUTPUT_FILE,
  resetFile: PIPELINE_RESET_FILE,
  planHardeningBlockedFile: PLAN_HARDENING_BLOCKED_FILE,
} = PIPELINE_CONTEXT.paths;
// Write-only JSON lock -- status field ("running"|"done") determines liveness.
// The file is NEVER deleted; it is overwritten on acquire and on release.
// This avoids EPERM failures from OneDrive holding a sync lock on the file.
// Written by `npm run pipeline:reset` (or `node scripts/reset-pipeline.js`).
// The watcher detects this sentinel on its next poll, archives any current cycle
// artifacts, deletes the sentinel, and resets state to IDLE. This is the safe
// programmatic escape from IMPLEMENTATION_FAILED without direct state file edits.
// Written when Claude plan hardening fails so the watcher stops retrying until
// the research/issue changes or the file is manually deleted.
const POLL_INTERVAL_MS = 5000;
const PLAN_TIMEOUT_MS = 900000; // 15 min -- larger research reports need more time
const CLAUDE_TIMEOUT_MS = 1800000; // 30 min -- complex implementations regularly exceed 15 min
const LOCK_STALE_MS = 30 * 60 * 1000;

// The exact watcher-generated failure reason string for a missing implementation report.
// Used to distinguish "report missing but PR exists" (recoverable) from other failures.
const REASON_NO_IMPL_REPORT = `Claude implementation finished without ${path.relative(REPO_ROOT, IMPLEMENTATION_FILE)}`;

// Patterns that indicate Claude intentionally stopped before creating a branch or PR
// (contract/reality conflict). When all of these match the last Claude output the pipeline
// synthesises the implementation report locally instead of waiting for human intervention.
const STOP_BEFORE_PATCH_PATTERNS = [
  /no\s+(?:patch|files?)\s+(?:(?:was|were)\s+)?(?:applied|changed)/i,
  /no\s+branch\s+(?:was\s+)?created/i,
  /no\s+pr\s+(?:was\s+)?(?:opened|created)/i,
];
// Plan hardening retry policy: up to 3 attempts, 5 min between each.
// After MAX_HARDENING_RETRIES failures the block becomes permanent and a
// GitHub issue is filed so the human is notified without manual log review.
const MAX_HARDENING_RETRIES = 3;
const HARDENING_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 min

// Centralize the Claude executable name so the watcher health check and runtime
// invocations cannot drift. Uses spawnSync with argument arrays to avoid
// shell injection vulnerabilities from paths containing shell metacharacters.
function getClaudeBinary() {
  if (typeof CONFIG.claudeBinary === "string" && CONFIG.claudeBinary.trim()) {
    return CONFIG.claudeBinary;
  }
  return process.platform === "win32" ? "claude.cmd" : "claude";
}

function buildClaudeExecArgs(promptFile) {
  return [
    "exec",
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C",
    REPO_ROOT,
    "-o",
    CLAUDE_OUTPUT_FILE,
    promptFile,
  ];
}

function buildClaudeVersionArgs() {
  return ["--version"];
}

function buildClaudeImplementationPrompt({ issue, promptText }) {
  const issueSlug = slugifyIssue(issue || "pipeline-issue");
  const branchName = buildAgentBranchName(issueSlug);

  return `${promptText ?? fs.readFileSync(CLAUDE_IMPLEMENT_PROMPT_FILE, "utf8")}

## Runtime context
- Current issue: ${issue}
- Required branch: ${branchName}
- Implementation summary target: reports/claude-implementation.md
- PR closeout command: gh pr create --fill
- Open a normal PR, not a draft PR.
- Do not pass --draft to gh pr create.
- If an existing PR for this branch is draft, run: gh pr ready
- After PR creation, apply review fixes locally via the repository review process.
`;
}

function isActivePhaseUpdatePath(filePath) {
  const resolvedPath = path.normalize(
    path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath),
  );
  const activePhaseUpdateDir = path.normalize(
    path.join(REPO_ROOT, ".github", "migration", "phase-updates") + path.sep,
  );

  return resolvedPath.startsWith(activePhaseUpdateDir);
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
    } else if (s?.state === "PLANNING") {
      // Timed hardening retry gates depend on wall-clock time. Re-check every
      // minute while a non-permanent retry block exists so retries fire without
      // requiring unrelated file changes.
      try {
        const blocked = readJson(PLAN_HARDENING_BLOCKED_FILE);
        if (!blocked?.permanent && blocked?.next_retry_at) {
          timeBucket = Math.floor(Date.now() / 60000);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  return [
    statMtime(RESEARCH_FILE),
    statMtime(PLAN_FILE),
    statMtime(PLAN_METADATA_FILE),
    statMtime(STATE_FILE),
    statMtime(IMPLEMENTATION_FILE),
    statMtime(IMPLEMENTATION_FAILED_FILE),
    statMtime(PLAN_HARDENING_BLOCKED_FILE),
    statMtime(PIPELINE_RESET_FILE),
    timeBucket,
  ].join(":");
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  // PowerShell's Set-Content -Encoding UTF8 writes a UTF-8 BOM on Windows.
  // Strip it before parsing so the watcher never fails on Copilot-written files.
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
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

function selectOpenReadyPR(prs) {
  if (!Array.isArray(prs)) {
    return null;
  }

  return prs.find((pr) => Number.isFinite(Number(pr?.number)) && pr.isDraft === false) ?? null;
}

// Returns { number, isDraft } if an open, non-draft PR for the branch exists, else null.
// Used to detect when Claude created a PR but the execSync wrapper timed out before
// the watcher could record IMPLEMENTATION_COMPLETE.
function checkOpenPR(issueSlug) {
  const branchName = buildAgentBranchName(issueSlug);
  try {
    const raw = execSync(
      `gh pr list --head "${branchName}" --state open --json number,isDraft --limit 20`,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 15000,
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const prs = JSON.parse(raw.trim() || "[]");
    const readyPr = selectOpenReadyPR(prs);
    if (!readyPr && prs.some((pr) => pr?.isDraft === true)) {
      log(`Draft PR found for ${branchName}; waiting for a normal open PR`);
    }
    return readyPr;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`checkOpenPR error: ${msg}`);
    return null;
  }
}

// Returns { number, mergedAt } if a merged PR for the current cycle exists, else null.
function checkMergedPR(issueSlug, cycleStartedAt) {
  const branchName = buildAgentBranchName(issueSlug);
  try {
    const raw = execSync(
      `gh pr list --head "${branchName}" --state merged --json number,mergedAt --limit 20`,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 15000,
        shell: true,
        windowsHide: true,
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

    return (
      prs.find(
        (pr) => Number.isFinite(Date.parse(pr.mergedAt)) && Date.parse(pr.mergedAt) >= cycleStartMs,
      ) || null
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`checkMergedPR error: ${msg}`);
    return null;
  }
}

function buildArchiveTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function archiveFileWithCopyDelete(src, destDir, name, warningPrefix) {
  if (!fs.existsSync(src)) {
    return false;
  }

  fs.mkdirSync(destDir, { recursive: true });

  try {
    fs.copyFileSync(src, path.join(destDir, name));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${warningPrefix}: failed to archive reports/${name} (${message})`);
    return false;
  }

  try {
    fs.unlinkSync(src);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      `${warningPrefix}: archived copy created for reports/${name} but source removal failed (${message})`,
    );
  }

  return true;
}

function isCurrentCycleResearchArtifact(state) {
  if (!fs.existsSync(RESEARCH_FILE)) {
    return false;
  }

  const cycleStartedAt = Date.parse(state?.started_at ?? "");
  if (!Number.isFinite(cycleStartedAt)) {
    return true;
  }

  try {
    return fs.statSync(RESEARCH_FILE).mtimeMs >= cycleStartedAt;
  } catch {
    return false;
  }
}

function shouldArchiveResearchOnManualReset(state) {
  if (!fs.existsSync(RESEARCH_FILE)) {
    return false;
  }

  const cycleStartedAt = Date.parse(state?.started_at ?? "");
  if (!Number.isFinite(cycleStartedAt)) {
    return false;
  }

  try {
    return fs.statSync(RESEARCH_FILE).mtimeMs >= cycleStartedAt;
  } catch {
    return false;
  }
}

function archiveArtifactsToDirectory(artifacts, destDir, warningPrefix, onArchived) {
  let archivedAny = false;

  for (const [src, name] of artifacts) {
    if (!fs.existsSync(src)) {
      continue;
    }

    if (archiveFileWithCopyDelete(src, destDir, name, warningPrefix)) {
      archivedAny = true;
      onArchived?.(name);
    }
  }

  return archivedAny;
}

function archiveStaleArtifactGroup(priorIssue, currentIssue, artifacts) {
  const priorSlug = slugifyIssue(priorIssue || "unknown-issue") || "unknown-issue";
  const dest = path.join(ARCHIVE_DIR, `stale-${priorSlug}-${buildArchiveTimestamp()}`);

  return archiveArtifactsToDirectory(artifacts, dest, "Stale artifact cleanup warning", (name) => {
    log(
      `Stale artifact archived: reports/${name} (prior issue: ${priorIssue || "unknown"}, current issue: ${currentIssue || "unknown"})`,
    );
  });
}

function archiveStaleCycleArtifacts(state) {
  const currentIssue = state.issue ?? "";

  const planMetadata = readPlanMetadata();
  const planIssue = planMetadata?.issue ?? "";
  const shouldArchivePlan =
    fs.existsSync(PLAN_FILE) && (!planMetadata || planIssue !== currentIssue);

  if (
    shouldArchivePlan ||
    (!fs.existsSync(PLAN_FILE) && fs.existsSync(PLAN_METADATA_FILE) && planIssue !== currentIssue)
  ) {
    archiveStaleArtifactGroup(planIssue, currentIssue, [
      [PLAN_FILE, "claude-plan.md"],
      [PLAN_METADATA_FILE, "claude-plan.meta.json"],
    ]);
  }

  const implementationMetadata = readImplementationMetadata();
  const implementationIssue = implementationMetadata?.issue ?? "";
  const shouldArchiveImplementation =
    fs.existsSync(IMPLEMENTATION_FILE) &&
    (!implementationMetadata || implementationIssue !== currentIssue);

  if (
    shouldArchiveImplementation ||
    (!fs.existsSync(IMPLEMENTATION_FILE) &&
      fs.existsSync(IMPLEMENTATION_METADATA_FILE) &&
      implementationIssue !== currentIssue)
  ) {
    archiveStaleArtifactGroup(implementationIssue, currentIssue, [
      [IMPLEMENTATION_FILE, "claude-implementation.md"],
      [IMPLEMENTATION_METADATA_FILE, "claude-implementation.meta.json"],
    ]);
  }
}

function archiveArtifactsForManualReset(state) {
  const dest = path.join(ARCHIVE_DIR, `manual-reset-${buildArchiveTimestamp()}`);
  const artifacts = [
    ...(shouldArchiveResearchOnManualReset(state) ? [[RESEARCH_FILE, "copilot-research.md"]] : []),
    [PLAN_FILE, "claude-plan.md"],
    [PLAN_METADATA_FILE, "claude-plan.meta.json"],
    [IMPLEMENTATION_FILE, "claude-implementation.md"],
    [IMPLEMENTATION_METADATA_FILE, "claude-implementation.meta.json"],
  ];

  return archiveArtifactsToDirectory(artifacts, dest, "Manual reset archive warning", (name) => {
    log(`Manual reset archived: reports/${name}`);
  });
}

// Copies completed cycle artifacts to reports/archive/<slug>-<ts>/ then removes
// the originals so the next cycle starts with a clean slate.
function archiveCycleArtifacts(issueSlug, options = {}) {
  const { includeResearch = true } = options;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(ARCHIVE_DIR, `${issueSlug}-${ts}`);
  fs.mkdirSync(dest, { recursive: true });

  const artifacts = [
    ...(includeResearch ? [[RESEARCH_FILE, "copilot-research.md"]] : []),
    [PLAN_FILE, "claude-plan.md"],
    [PLAN_METADATA_FILE, "claude-plan.meta.json"],
    [IMPLEMENTATION_FILE, "claude-implementation.md"],
    [IMPLEMENTATION_METADATA_FILE, "claude-implementation.meta.json"],
    [CLAUDE_OUTPUT_FILE, "claude-last-message.txt"],
  ];

  for (const [src, name] of artifacts) {
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, path.join(dest, name));
        fs.unlinkSync(src);
      } catch {
        /* ignore individual file errors */
      }
    }
  }

  log(`Cycle artifacts archived to reports/archive/${issueSlug}-${ts}/`);
}

function isPermissionStub(text) {
  return (
    /Waiting for permission to write/i.test(text) ||
    /Please approve the file write above/i.test(text)
  );
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

function extractUsablePlanFromClaudeOutput(outputText) {
  const planText = outputText.trim();
  return isUsablePlan(planText) ? planText : null;
}

function persistPlanArtifact(planText) {
  fs.writeFileSync(PLAN_FILE, `${planText.trim()}\n`, "utf8");
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

// Returns true when the implementation report's "Exact files changed" section
// contains only "None" -- indicating Claude stopped before making any code changes.
function isNoCodeChangeReport() {
  if (!fs.existsSync(IMPLEMENTATION_FILE)) return false;
  try {
    const text = readTextFile(IMPLEMENTATION_FILE);
    const match = text.match(/##\s+Exact files changed\s*\n([\s\S]*?)(?=\n##|$)/i);
    return match ? /\bNone\b/i.test(match[1]) : false;
  } catch {
    return false;
  }
}

// Returns true only when every file changed on the configured agent branch relative to main is
// under the reports/ directory. This is an objective git-state guard used before
// the no-PR auto-reset so that real implementation work is never silently discarded
// based solely on the (model-authored, potentially stale) implementation report.
// Tries the local branch first, then the remote-tracking ref. Returns false -- i.e.
// refuses cleanup -- whenever the branch cannot be resolved or the diff command fails.
function isReportOnlyBranch(issueSlug) {
  const branchName = buildAgentBranchName(issueSlug);
  const candidates = [branchName, `origin/${branchName}`];

  for (const ref of candidates) {
    let output;
    try {
      output = execSync(`git diff --name-only "main...${ref}"`, {
        cwd: REPO_ROOT,
        timeout: 10000,
        shell: true,
        windowsHide: true,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      continue; // ref not found or git error -- try next candidate
    }

    const changedFiles = output.trim().split(/\r?\n/).filter(Boolean);
    if (changedFiles.length === 0) return true; // branch identical to main

    const nonReportFiles = changedFiles.filter((f) => !f.startsWith("reports/"));
    if (nonReportFiles.length > 0) {
      log(
        `isReportOnlyBranch: ${ref} has non-report changes (${nonReportFiles.slice(0, 5).join(", ")}) -- skipping auto-reset`,
      );
      return false;
    }
    return true; // every changed file is under reports/
  }

  // Neither local nor remote branch resolved -- refuse cleanup to be safe.
  log(
    `isReportOnlyBranch: branch ${branchName} not found locally or on remote -- skipping auto-reset`,
  );
  return false;
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

function writeHardeningBlockedState(state, reason, retryCount = 0) {
  const permanent = retryCount >= MAX_HARDENING_RETRIES;
  const nextRetryAt = permanent
    ? null
    : new Date(Date.now() + HARDENING_RETRY_INTERVAL_MS).toISOString();

  writeJson(PLAN_HARDENING_BLOCKED_FILE, {
    blocked_at: new Date().toISOString(),
    reason,
    issue: state.issue ?? "",
    research_hash: (() => {
      try {
        return hashFile(RESEARCH_FILE);
      } catch {
        return null;
      }
    })(),
    retry_count: retryCount,
    ...(permanent ? { permanent: true } : { next_retry_at: nextRetryAt }),
    resolution: permanent
      ? [
          "All automatic retries exhausted. Manual intervention required.",
          "Option A: run Claude plan hardening manually by writing reports/claude-plan.md.",
          "Option B: fix the Claude CLI installation or PATH and delete this file.",
        ]
      : [
          `Retry ${retryCount}/${MAX_HARDENING_RETRIES} scheduled at ${nextRetryAt}.`,
          "Option A (automatic): the pipeline will retry automatically -- no action needed.",
          "Option B (fix now): ensure 'claude' CLI is installed and available on PATH.",
          "  then delete this file to skip the wait.",
        ],
  });
}

function clearHardeningBlockedState() {
  try {
    fs.unlinkSync(PLAN_HARDENING_BLOCKED_FILE);
  } catch {
    /* ignore */
  }
}

function isHardeningBlockedForCurrentState(state) {
  let blocked;
  try {
    blocked = readJson(PLAN_HARDENING_BLOCKED_FILE);
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

  // Permanent block (all retries exhausted) -- stay blocked until manual fix.
  if (blocked.permanent) {
    return true;
  }

  // Timed retry: unblock once the scheduled window has passed.
  if (blocked.next_retry_at) {
    const due = Date.parse(blocked.next_retry_at);
    if (Number.isFinite(due) && Date.now() >= due) {
      return false; // retry window reached -- allow the run
    }
    const secsRemaining = Math.max(0, Math.round((due - Date.now()) / 1000));
    log(
      `Claude plan hardening retry in ${secsRemaining}s (attempt ${(blocked.retry_count ?? 0) + 1}/${MAX_HARDENING_RETRIES})`,
    );
    return true;
  }

  // Legacy block file with no retry metadata -- treat as blocked.
  return true;
}

function readHardeningRetryCount() {
  try {
    const blocked = readJson(PLAN_HARDENING_BLOCKED_FILE);
    return typeof blocked.retry_count === "number" ? blocked.retry_count : 0;
  } catch {
    return 0;
  }
}

function sendHardeningFailureNotification(state, reason) {
  const title = `[pipeline-watcher] Claude plan hardening permanently blocked`;
  const body = [
    `All ${MAX_HARDENING_RETRIES} automatic retries for the plan-hardening step have failed.`,
    "",
    `**Issue:** ${state.issue ?? "(unknown)"}`,
    `**Last failure reason:** ${reason}`,
    "",
    "**To unblock:**",
    "1. Fix the Claude CLI: install or configure claude on PATH.",
    "2. Delete `reports/.claude-plan-hardening-blocked.json` -- the pipeline restarts automatically.",
    "   OR write `reports/claude-plan.md`; the watcher will advance state automatically when the artifact is valid.",
  ].join("\n");

  try {
    execFileSync(
      "gh",
      ["issue", "create", "--title", title, "--body", body, "--label", "pipeline-blocked"],
      {
        cwd: REPO_ROOT,
        timeout: 20000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      },
    );
    log("Hardening failure notification: GitHub issue created successfully");
  } catch (err) {
    // Notification failure must not crash the watcher -- log and continue.
    const msg = err instanceof Error ? err.message : String(err);
    log(`Hardening failure notification: GitHub issue creation failed (${msg}) -- check manually`);
  }
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

function removeFileIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function clearImplementationFailedState() {
  removeFileIfExists(IMPLEMENTATION_FAILED_FILE);
}

function clearImplementationRunArtifacts() {
  // Each run must prove it produced fresh artifacts for the current issue.
  removeFileIfExists(IMPLEMENTATION_FILE);
  removeFileIfExists(IMPLEMENTATION_METADATA_FILE);
  removeFileIfExists(CLAUDE_OUTPUT_FILE);
}

function recoverPlanArtifactFromClaudeOutput(state) {
  if (!fs.existsSync(RESEARCH_FILE) || !fs.existsSync(CLAUDE_OUTPUT_FILE)) {
    return false;
  }

  // Only trust captured plan output that is at least as new as the current
  // research artifact; this avoids rehydrating a stale plan from a prior cycle.
  if (statMtime(CLAUDE_OUTPUT_FILE) < statMtime(RESEARCH_FILE)) {
    return false;
  }

  try {
    const recoveredPlan = extractUsablePlanFromClaudeOutput(readTextFile(CLAUDE_OUTPUT_FILE));
    if (!recoveredPlan) {
      return false;
    }

    persistPlanArtifact(recoveredPlan);
    writePlanMetadata(state);
    log("Recovered reports/claude-plan.md from reports/claude-last-message.txt");
    return true;
  } catch {
    return false;
  }
}

function hasUsablePlanArtifactForState(state) {
  if (!fs.existsSync(RESEARCH_FILE)) {
    return false;
  }

  if (!fs.existsSync(PLAN_FILE) && !recoverPlanArtifactFromClaudeOutput(state)) {
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

function summarizeClaudeStopReason(text) {
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

  return "Claude stopped without applying the patch";
}

function detectClaudeStopReason(text) {
  const normalized = text.trim();
  if (!normalized) {
    return "Claude exited without writing a final status message";
  }

  if (/^\*\*Stopped\*\*$/im.test(normalized) || /^Stopped$/im.test(normalized)) {
    return summarizeClaudeStopReason(normalized);
  }

  if (/did not patch, switch branches, commit, or open a PR/i.test(normalized)) {
    return "Claude stopped before patching, branching, committing, or opening a PR";
  }

  return null;
}

function validateImplementationRun(previousImplementationMtime, previousOutputMtime, issueSlug) {
  const outputMtime = statMtime(CLAUDE_OUTPUT_FILE);
  if (outputMtime <= previousOutputMtime) {
    return {
      reason: "Claude run finished without refreshing reports/claude-last-message.txt",
    };
  }

  const outputText = readTextFile(CLAUDE_OUTPUT_FILE).trim();
  const stopReason = detectClaudeStopReason(outputText);
  if (stopReason) {
    return {
      reason: stopReason,
      details: {
        claude_output_excerpt: outputText.slice(0, 4000),
      },
    };
  }

  if (!fs.existsSync(IMPLEMENTATION_FILE)) {
    return {
      reason: "Claude implementation finished without reports/claude-implementation.md",
    };
  }

  const implementationMtime = statMtime(IMPLEMENTATION_FILE);
  if (implementationMtime <= previousImplementationMtime) {
    return {
      reason: "Claude run finished without updating reports/claude-implementation.md",
    };
  }

  const implementationText = readTextFile(IMPLEMENTATION_FILE).trim();
  if (!implementationText) {
    return {
      reason: "Claude implementation wrote an empty reports/claude-implementation.md",
    };
  }

  if (!isUsableImplementation(implementationText)) {
    return {
      reason: "Claude implementation wrote an invalid reports/claude-implementation.md",
      details: {
        implementation_excerpt: implementationText.slice(0, 4000),
      },
    };
  }

  if (issueSlug && !checkOpenPR(issueSlug)) {
    return {
      reason: `Claude implementation finished without an open non-draft PR for ${buildAgentBranchName(issueSlug)}`,
    };
  }

  return null;
}

function failImplementation(state, reason, details = {}) {
  writeImplementationFailedState(state, reason, details);
  markImplementationFailed(state, reason);
  log("Claude implementation failed - state IMPLEMENTATION_FAILED");
  log(`  Reason: ${reason}`);
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  try {
    return readWorkflowState(STATE_FILE, {
      autoRepair: true,
      logger: log,
      snapshotDir: ARCHIVE_DIR,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Invalid workflow state file: ${message}`);
    log("Workflow state file is unrecoverable - manual intervention required");
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

function buildAgentBranchName(issueSlug) {
  const prefix =
    typeof CONFIG.branchPrefix === "string" && CONFIG.branchPrefix.trim()
      ? CONFIG.branchPrefix.trim().replace(/^\/+|\/+$/g, "")
      : "claude";
  return `${prefix}/${issueSlug}`;
}

function canSignalPid(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---- Write-only lock primitives ------------------------------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------------------------------------------------------------------------------------

function runClaudePlanHardening(state) {
  if (!fs.existsSync(RESEARCH_FILE)) {
    log("State is PLANNING but reports/copilot-research.md is missing");
    return;
  }

  if (isHardeningBlockedForCurrentState(state)) {
    log(
      "Claude plan hardening blocked - see reports/.claude-plan-hardening-blocked.json for resolution steps",
    );
    return;
  }

  withPipelineLock("claude-plan-hardening", () => {
    log("PLANNING detected - running Claude plan hardening");

    const prompt = [
      "Produce a hardened implementation contract. Follow all instructions in the TEMPLATE section exactly. Return only the plan markdown; no preamble and no prose outside the numbered sections.",
      "",
      "# TEMPLATE",
      "",
      fs.readFileSync(PLAN_PROMPT_FILE, "utf8").trim(),
      "",
      "# RUNTIME CONTEXT",
      "",
      `Issue: ${state.issue}`,
      "Input artifact: reports/copilot-research.md",
      "Output artifact: reports/claude-plan.md",
      "Write the exact artifact file reports/claude-plan.md.",
      "Do not attempt to edit any other files.",
      "Do not implement code.",
      "Stop after writing reports/claude-plan.md.",
      "",
      "# RESEARCH REPORT",
      "",
      fs.readFileSync(RESEARCH_FILE, "utf8").trim(),
    ].join("\n");

    const currentRetryCount = readHardeningRetryCount();
    const nextRetryCount = currentRetryCount + 1;

    const promptFile = path.join(REPORTS_DIR, "claude-plan-prompt.tmp.md");
    fs.writeFileSync(promptFile, prompt, "utf8");

    try {
      const result = spawnSync(getClaudeBinary(), buildClaudeExecArgs(promptFile), {
        cwd: REPO_ROOT,
        windowsHide: true,
        timeout: PLAN_TIMEOUT_MS,
        stdio: ["ignore", "inherit", "inherit"],
        shell: process.platform === "win32",
      });

      if (result.error || (result.status !== null && result.status !== 0)) {
        throw result.error || new Error(`Claude exited with status ${result.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeHardeningBlockedState(state, message, nextRetryCount);
      if (nextRetryCount >= MAX_HARDENING_RETRIES) {
        log(
          `Claude plan hardening failed after ${MAX_HARDENING_RETRIES} attempts - permanent block. Sending notification.`,
        );
        sendHardeningFailureNotification(state, message);
      } else {
        log(
          `Claude plan hardening failed (attempt ${nextRetryCount}/${MAX_HARDENING_RETRIES}) - retry in 5 min. See reports/.claude-plan-hardening-blocked.json`,
        );
      }
      throw err;
    } finally {
      removeFileIfExists(promptFile);
    }

    if (!fs.existsSync(PLAN_FILE)) {
      writeHardeningBlockedState(
        state,
        "Claude failed to produce reports/claude-plan.md",
        nextRetryCount,
      );
      if (nextRetryCount >= MAX_HARDENING_RETRIES) {
        sendHardeningFailureNotification(state, "Claude failed to produce reports/claude-plan.md");
      }
      throw new Error("Claude plan hardening failed to write reports/claude-plan.md");
    }

    const planText = readTextFile(PLAN_FILE).trim();
    if (!planText) {
      writeHardeningBlockedState(state, "Claude wrote an empty plan", nextRetryCount);
      if (nextRetryCount >= MAX_HARDENING_RETRIES) {
        sendHardeningFailureNotification(state, "Claude wrote an empty plan");
      }
      throw new Error("Claude plan hardening returned an empty plan");
    }

    if (!isUsablePlan(planText)) {
      writeHardeningBlockedState(
        state,
        "Claude returned a plan missing required plan sections",
        nextRetryCount,
      );
      if (nextRetryCount >= MAX_HARDENING_RETRIES) {
        sendHardeningFailureNotification(
          state,
          "Claude returned a plan missing required plan sections",
        );
      }
      throw new Error("Claude plan hardening returned invalid plan output");
    }

    clearHardeningBlockedState();
    writePlanMetadata(state);
    markReadyForImplementation(state, "claude");
    log("Claude plan hardening complete - state READY_FOR_IMPLEMENTATION");
  });
}

function isImplementationAlreadyDone(state) {
  if (!fs.existsSync(IMPLEMENTATION_FILE)) {
    return false;
  }
  // If the implementation file is newer than when the plan was hardened, Claude already
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
    // Claude runs and duplicate PR creation on watcher restart.
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

function runClaudeImplementation(state) {
  if (!fs.existsSync(RESEARCH_FILE) || !fs.existsSync(PLAN_FILE)) {
    log("READY_FOR_IMPLEMENTATION requires both research and plan artifacts");
    return;
  }

  if (isImplementationAlreadyDone(state)) {
    log("Claude implementation already complete for this cycle - marking IMPLEMENTATION_COMPLETE");
    markImplementationComplete(state);
    return;
  }

  const issueSlug = slugifyIssue(state.issue || "pipeline-issue");
  const prompt = buildClaudeImplementationPrompt({ issue: state.issue });
  const previousImplementationMtime = statMtime(IMPLEMENTATION_FILE);
  const previousOutputMtime = statMtime(CLAUDE_OUTPUT_FILE);

  withPipelineLock("claude-implementation", () => {
    log("READY_FOR_IMPLEMENTATION detected - running Claude implementation");
    clearImplementationRunArtifacts();
    // Write the prompt to a temp file so we can feed it via stdin redirect
    // without relying on execFileSync's `input` option, which triggers EINVAL
    // on Windows when stdout/stderr are not inheritable (detached background process).
    const promptFile = path.join(REPORTS_DIR, "claude-prompt.tmp.md");
    fs.writeFileSync(promptFile, prompt, "utf8");

    try {
      // spawnSync with argument array avoids shell injection vulnerabilities.
      // --json disables the interactive TUI so claude can run in a detached
      // background process (no console attached). Without it, claude crashes
      // immediately with STATUS_CONTROL_C_EXIT (0xC000013A) on Windows.
      // --dangerously-bypass-approvals-and-sandbox already disables the sandbox,
      // so --sandbox workspace-write is redundant and removed to avoid conflict.
      // shell: true only on Windows to resolve claude.cmd via PATH.
      const result = spawnSync(getClaudeBinary(), buildClaudeExecArgs(promptFile), {
        cwd: REPO_ROOT,
        windowsHide: true,
        timeout: CLAUDE_TIMEOUT_MS,
        // stdout/stderr: "inherit" -- Claude output streams directly to the
        // watcher's inherited log file descriptors (set by start-pipeline-runner.js
        // to logFd). This avoids buffering all output in memory, which would
        // hit Node's default execSync maxBuffer limit on verbose Claude runs.
        stdio: ["ignore", "inherit", "inherit"],
        shell: process.platform === "win32",
      });

      if (result.error) {
        throw result.error;
      }
      if (result.status !== null && result.status !== 0) {
        throw new Error(`Claude exited with status ${result.status}`);
      }
    } catch (error) {
      const outputText =
        statMtime(CLAUDE_OUTPUT_FILE) > previousOutputMtime && fs.existsSync(CLAUDE_OUTPUT_FILE)
          ? readTextFile(CLAUDE_OUTPUT_FILE).trim()
          : "";
      const stopReason = outputText ? detectClaudeStopReason(outputText) : null;
      const reason =
        stopReason ??
        (error instanceof Error
          ? `Claude CLI invocation failed: ${error.message}`
          : `Claude CLI invocation failed: ${String(error)}`);

      // Before recording failure, check whether Claude already created an open PR.
      // When execSync hits the timeout (ETIMEDOUT), Claude may have finished all
      // work -- branch, commit, push, PR -- but the wrapper expired before the
      // watcher could validate. Treat an existing open PR as success only if the
      // implementation report exists and is valid, so the pipeline advances to
      // IMPLEMENTATION_COMPLETE rather than going dead-end.
      const openPr = checkOpenPR(issueSlug);
      if (openPr) {
        if (
          fs.existsSync(IMPLEMENTATION_FILE) &&
          isUsableImplementation(readTextFile(IMPLEMENTATION_FILE).trim())
        ) {
          log(
            `Claude timed out but open PR #${openPr.number} exists for ${buildAgentBranchName(issueSlug)} with valid implementation report - treating as IMPLEMENTATION_COMPLETE`,
          );
          writeImplementationMetadata(state);
          markImplementationComplete(state);
          return;
        }
        log(
          `Claude timed out and open PR #${openPr.number} exists but implementation report is missing or invalid - keeping recovery path active`,
        );
      }

      failImplementation(state, reason, {
        claude_output_excerpt: outputText.slice(0, 4000),
      });
      return;
    } finally {
      try {
        fs.unlinkSync(promptFile);
      } catch {
        /* ignore */
      }
    }

    const validationFailure = validateImplementationRun(
      previousImplementationMtime,
      previousOutputMtime,
      issueSlug,
    );
    if (validationFailure) {
      failImplementation(state, validationFailure.reason, validationFailure.details);
      return;
    }

    writeImplementationMetadata(state);

    markImplementationComplete(state);
    log("Claude implementation run complete - state IMPLEMENTATION_COMPLETE");
  });
}

// Recovery path: Claude created a branch + PR but exited before writing the report.
// Runs a targeted Claude session on the existing branch to write only the report,
// then commits and pushes it so the watcher can advance to IMPLEMENTATION_COMPLETE.
// Called from evaluatePipeline() when state is IMPLEMENTATION_FAILED with the
// specific REASON_NO_IMPL_REPORT reason and an open PR is confirmed.
function runReportRecovery(state, issueSlug, prNumber) {
  withPipelineLock("report-recovery", () => {
    const branchName = buildAgentBranchName(issueSlug);
    log(
      `Report-only recovery: PR #${prNumber} exists for ${branchName} but implementation report is missing`,
    );

    // Build a short, focused prompt -- avoids the context exhaustion that caused the original failure.
    const prompt = [
      "You are recovering from a Claude pipeline failure. The code changes are already committed",
      `on branch '${branchName}' and PR #${prNumber} is open. The only missing artifact is`,
      "'reports/claude-implementation.md'.",
      "",
      "Your ONLY task:",
      `1. Run: git checkout ${branchName}`,
      "2. Read the git diff on this branch: git diff main...HEAD -- (look at changed files)",
      "3. Read reports/claude-plan.md to understand the issue and contract",
      "4. Write reports/claude-implementation.md with ALL seven required sections:",
      "   - Issue summary",
      "   - Root cause implemented",
      "   - Exact files changed",
      "   - Tests run",
      "   - Reports generated",
      "   - Remaining risks",
      "   - Any contract ambiguities resolved during implementation",
      "5. Stage and commit the report: git add reports/claude-implementation.md && git commit -m 'docs: add missing implementation report'",
      "6. Push: git push",
      "",
      "Do NOT re-implement any code. Do NOT create a new PR. Do NOT modify any files except",
      "reports/claude-implementation.md.",
      "",
      `Current issue: ${state.issue}`,
    ].join("\n");

    const promptFile = path.join(REPORTS_DIR, "claude-report-recovery.tmp.md");
    fs.writeFileSync(promptFile, prompt, "utf8");

    const previousImplementationMtime = statMtime(IMPLEMENTATION_FILE);
    const previousOutputMtime = statMtime(CLAUDE_OUTPUT_FILE);

    try {
      const result = spawnSync(getClaudeBinary(), buildClaudeExecArgs(promptFile), {
        cwd: REPO_ROOT,
        windowsHide: true,
        timeout: 300000, // 5 min -- short task, just the report
        stdio: ["ignore", "inherit", "inherit"],
        shell: process.platform === "win32",
      });

      if (result.error) {
        throw result.error;
      }
      if (result.status !== null && result.status !== 0) {
        throw new Error(`Claude exited with status ${result.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Report recovery Claude session failed: ${message}`);
      // Do not flip to IMPLEMENTATION_FAILED again -- the PR still exists and
      // the failure is logged. The watcher will retry on the next cycle.
      return;
    } finally {
      try {
        fs.unlinkSync(promptFile);
      } catch {
        /* ignore */
      }
    }

    // Validate that the recovery actually wrote the report.
    const validationFailure = validateImplementationRun(
      previousImplementationMtime,
      previousOutputMtime,
    );
    if (validationFailure) {
      log(`Report recovery completed but validation still fails: ${validationFailure.reason}`);
      log("Manual intervention required: write reports/claude-implementation.md by hand.");
      return;
    }

    writeImplementationMetadata(state);
    clearImplementationFailedState();
    markImplementationComplete(state);
    log(`Report recovery succeeded - PR #${prNumber} now has a valid implementation report`);
  });
}

// Returns true when the Claude last-message text indicates an intentional stop-before-patch.
// Originally required all three patterns, but when Claude creates a branch solely to commit
// a stop report (no code changed), the "no branch was created" pattern never fires.
// Two-pattern match (no-files-changed + no-PR-opened) is sufficient to identify a stop.
function detectStopBeforePatch(text) {
  if (!text) return false;
  if (STOP_BEFORE_PATCH_PATTERNS.every((re) => re.test(text))) return true;
  return STOP_BEFORE_PATCH_PATTERNS[0].test(text) && STOP_BEFORE_PATCH_PATTERNS[2].test(text);
}

// Recovery for the case where Claude stopped (contract/reality conflict) before creating
// a branch, PR, or implementation report. Synthesises claude-implementation.md directly
// from the Claude stop message -- no AI invocation required -- then archives the cycle
// and resets the pipeline to IDLE so the human can revise the plan and re-queue.
function synthesizeStopReport(state, issueSlug) {
  withPipelineLock("stop-report-synthesis", () => {
    const stopMessage = fs.existsSync(CLAUDE_OUTPUT_FILE)
      ? readTextFile(CLAUDE_OUTPUT_FILE).trim()
      : "";

    log(
      "Stop-report synthesis: Claude stopped before implementation -- synthesising report, archiving cycle",
    );

    const stopExcerpt = stopMessage.slice(0, 2000);
    const now = new Date().toISOString();

    const implContent = [
      `# Implementation Report`,
      ``,
      `*Synthesised by pipeline stop-report recovery at ${now}*`,
      ``,
      `## Issue summary`,
      ``,
      `${state.issue ?? "Unknown issue"} -- Claude stopped before implementation due to a`,
      `contract/reality conflict. No code was changed.`,
      ``,
      `## Root cause implemented`,
      ``,
      `Not implemented. Claude identified a conflict between the implementation contract and`,
      `the current repository state and stopped before making any code changes.`,
      `See "Remaining risks" for the specific conflict.`,
      ``,
      `## Exact files changed`,
      ``,
      `None -- Claude stopped before code changes. No branch was created, no commit was made,`,
      `and no PR was opened.`,
      ``,
      `## Tests run`,
      ``,
      `None -- stopped before code changes.`,
      ``,
      `## Reports generated`,
      ``,
      `None -- stopped before code changes. This stop report was synthesised by the pipeline`,
      `watcher to unblock the next planning cycle.`,
      ``,
      `## Remaining risks`,
      ``,
      `The implementation contract could not be applied as written. Claude stop message:`,
      ``,
      `\`\`\``,
      stopExcerpt || "(Claude output not available)",
      `\`\`\``,
      ``,
      `The plan must be revised before the next implementation attempt to address this conflict.`,
      ``,
      `## Any contract ambiguities resolved during implementation`,
      ``,
      `The contract was not ambiguous -- it conflicted with the repository's actual execution`,
      `path. No ambiguities were resolved because implementation was halted. The conflict`,
      `should be addressed in the next planning cycle by revising the contract.`,
    ].join("\n");

    // Write the implementation report so it is preserved in the cycle archive.
    fs.writeFileSync(IMPLEMENTATION_FILE, `${implContent}\n`, "utf8");
    log("Stop-report synthesis: wrote reports/claude-implementation.md");

    archiveCycleArtifacts(issueSlug);
    clearImplementationFailedState();

    const stopSummary = stopExcerpt
      .slice(0, 300)
      .replace(/\r?\n+/g, " ")
      .trim();
    markIdle(
      `Claude stopped (contract conflict) for: ${state.issue}. Stop reason: ${stopSummary}. ` +
        `Revise the plan and re-queue a new /research-and-plan issue.`,
    );

    log(
      "Stop-report synthesis complete -- pipeline reset to IDLE. Revise the contract before re-queuing.",
    );
  });
}

// Deletes the remote and local stop-report branch so the next run for the same
// issue slug can create a fresh branch without collision.
function cleanupStopBranch(issueSlug) {
  const branchName = buildAgentBranchName(issueSlug);
  try {
    execSync(`git push origin --delete "${branchName}"`, {
      cwd: REPO_ROOT,
      timeout: 15000,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    log(`Deleted remote stop-report branch ${branchName}`);
  } catch {
    // Branch may not exist remotely -- ignore
  }
  try {
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: REPO_ROOT,
      timeout: 5000,
      shell: true,
      windowsHide: true,
      encoding: "utf8",
    }).trim();
    if (currentBranch === branchName) {
      execSync("git checkout main -f", {
        cwd: REPO_ROOT,
        timeout: 10000,
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
    }
    execSync(`git branch -D "${branchName}"`, {
      cwd: REPO_ROOT,
      timeout: 10000,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    log(`Deleted local stop-report branch ${branchName}`);
  } catch {
    // Branch may not exist locally -- ignore
  }
}

// Detects when Copilot has written a new research file while the pipeline is already
// past the planning phase (READY_FOR_IMPLEMENTATION / IMPLEMENTATION_COMPLETE /
// IMPLEMENTATION_FAILED). A changed research hash compared to what plan metadata
// recorded means a new issue cycle started -- the old cycle should be treated as
// complete. Archives old artifacts and resets state to RESEARCHING so the fresh
// research flows cleanly through plan hardening and implementation.
//
// NOT triggered for IDLE, RESEARCHING, or PLANNING states:
//   IDLE        -- the pipeline is already waiting for a new cycle.
//   RESEARCHING -- a new research write is expected and normal.
//   PLANNING    -- hasUsablePlanArtifactForState() already detects hash mismatches
//                 and re-runs Claude plan hardening automatically.
function checkForResearchCycleChange(state) {
  if (!state || !fs.existsSync(RESEARCH_FILE)) {
    return false;
  }

  if (state.state === "IDLE" || state.state === "RESEARCHING" || state.state === "PLANNING") {
    return false;
  }

  const planMeta = readPlanMetadata();
  if (!planMeta || planMeta.issue !== (state.issue ?? "")) {
    return false;
  }

  let currentResearchHash;
  try {
    currentResearchHash = hashFile(RESEARCH_FILE);
  } catch {
    return false;
  }

  if (planMeta.research_hash === currentResearchHash) {
    return false;
  }

  log(
    `New research cycle detected for issue "${state.issue}": research hash changed -- archiving old cycle and restarting from RESEARCHING`,
  );
  const issueSlug = slugifyIssue(state.issue || "pipeline-issue");
  archiveCycleArtifacts(issueSlug, { includeResearch: false });
  clearImplementationFailedState();
  const researchMtimeIso = (() => {
    try {
      return fs.statSync(RESEARCH_FILE).mtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  })();
  writeJson(STATE_FILE, {
    state: "RESEARCHING",
    issue: state.issue,
    started_at: researchMtimeIso,
  });
  return true;
}

function evaluatePipeline() {
  // Check for a manual reset request first -- this takes priority over all other
  // state handling so that a stuck IMPLEMENTATION_FAILED cycle can always be cleared.
  if (fs.existsSync(PIPELINE_RESET_FILE)) {
    removeFileIfExists(PIPELINE_RESET_FILE);
    const state = readState();
    archiveArtifactsForManualReset(state);
    clearImplementationFailedState();
    clearHardeningBlockedState();
    markIdle("Manual pipeline reset requested via reports/.pipeline-reset-requested");
    return;
  }

  const state = readState();
  if (!state) {
    return;
  }

  // If Copilot has written a new research file while we are in a post-planning state,
  // the previous cycle is implicitly complete. Archive it and restart from RESEARCHING.
  if (checkForResearchCycleChange(state)) {
    return;
  }

  // RESEARCHING is set by Copilot while it writes the research artifact. The watcher
  // has no role during that window -- but once copilot-research.md exists and is non-empty
  // it must advance the state to PLANNING so Claude plan hardening can run. Without this
  // handler the pipeline stalls silently: the watcher falls through all branches,
  // logs nothing, and never triggers hardening. (Bug surfaced 2026-05-23.)
  if (state.state === "RESEARCHING") {
    if (!fs.existsSync(RESEARCH_FILE)) {
      log("RESEARCHING - waiting for reports/copilot-research.md");
      return;
    }
    const researchContent = (() => {
      try {
        return readTextFile(RESEARCH_FILE).trim();
      } catch {
        return "";
      }
    })();
    if (!researchContent) {
      log("RESEARCHING - reports/copilot-research.md exists but is empty, still waiting");
      return;
    }

    if (!isCurrentCycleResearchArtifact(state)) {
      log(
        "RESEARCHING - research artifact predates current cycle start, waiting for fresh research write",
      );
      return;
    }

    archiveStaleCycleArtifacts(state);
    log("RESEARCHING complete - current-cycle research artifact detected, advancing to PLANNING");
    writeJson(STATE_FILE, {
      ...state,
      state: "PLANNING",
      editing_locked: true,
    });
    return;
  }

  if (state.state === "PLANNING") {
    if (state.editing_locked !== true) {
      log("PLANNING state is invalid: editing_locked must be true");
      return;
    }

    // If a blocked state exists for a different issue/research snapshot, clear
    // it automatically so a new issue cycle is not forced into manual intervention.
    // IMPORTANT: do not delete a matching timed retry block when its retry window
    // elapses; preserving retry_count allows failures to accumulate to permanent
    // block and notification after MAX_HARDENING_RETRIES.
    if (fs.existsSync(PLAN_HARDENING_BLOCKED_FILE)) {
      let shouldClearStaleBlock = false;
      try {
        const blocked = readJson(PLAN_HARDENING_BLOCKED_FILE);
        if (blocked.issue !== (state.issue ?? "")) {
          shouldClearStaleBlock = true;
        } else {
          try {
            shouldClearStaleBlock = blocked.research_hash !== hashFile(RESEARCH_FILE);
          } catch {
            shouldClearStaleBlock = true;
          }
        }
      } catch {
        shouldClearStaleBlock = true;
      }

      if (shouldClearStaleBlock) {
        clearHardeningBlockedState();
        log("Stale blocked state cleared - new issue or research detected");
      }
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

    runClaudeImplementation(state);
    return;
  }

  if (state.state === "IDLE") {
    // If a fresh research file appeared after we idled, log a hint. The pipeline cannot
    // auto-advance without a known issue title -- that requires the state file to be
    // updated externally (by Copilot or the user) with state RESEARCHING and the new issue.
    if (fs.existsSync(RESEARCH_FILE)) {
      const idledAt = Date.parse(state.idled_at ?? "");
      const researchMtime = statMtime(RESEARCH_FILE);
      if (!Number.isFinite(idledAt) || researchMtime > idledAt) {
        log(
          "IDLE -- fresh research file detected (newer than last idle timestamp); waiting for workflow state to advance to RESEARCHING",
        );
        return;
      }
    }
    log("Pipeline idle - waiting for new /research-and-plan issue");
    return;
  }

  if (state.state === "IMPLEMENTATION_COMPLETE") {
    const issueSlug = slugifyIssue(state.issue || "pipeline-issue");
    const branchName = buildAgentBranchName(issueSlug);
    const merged = checkMergedPR(issueSlug, state.plan_hardened_at);
    if (merged) {
      log(`PR #${merged.number} for ${branchName} merged at ${merged.mergedAt} - closing cycle`);
      archiveCycleArtifacts(issueSlug);
      clearImplementationFailedState();
      markIdle(`PR #${merged.number} merged for: ${state.issue}`);
      return;
    }

    // If there is no open PR and both the implementation report and the actual git
    // diff confirm no code was changed, Claude stopped before patching (contract conflict).
    // Auto-reset so the pipeline does not stall waiting for a PR merge that will never
    // arrive. isReportOnlyBranch() is the authoritative guard -- isNoCodeChangeReport()
    // is a fast pre-filter that avoids the git invocation in the common (PR exists) path.
    const openPr = checkOpenPR(issueSlug);
    if (!openPr && isNoCodeChangeReport() && isReportOnlyBranch(issueSlug)) {
      log(
        `No open or merged PR for ${branchName}, implementation report and git diff both confirm no code changes -- archiving stop-report cycle and resetting`,
      );
      archiveCycleArtifacts(issueSlug);
      cleanupStopBranch(issueSlug);
      clearImplementationFailedState();
      markIdle(
        `Claude stopped (no code changes) for: ${state.issue} -- revise the plan and re-queue`,
      );
      return;
    }

    if (!openPr) {
      log(`Pipeline cycle complete - waiting for a normal open PR for ${branchName}`);
      return;
    }

    log(`Pipeline cycle complete - PR #${openPr.number} open for ${branchName}, waiting for merge`);
    return;
  }

  if (state.state === "IMPLEMENTATION_FAILED") {
    const issueSlug = slugifyIssue(state.issue || "pipeline-issue");
    const branchName = buildAgentBranchName(issueSlug);

    // Allow a manually merged PR to close the loop even after a recorded failure.
    const merged = checkMergedPR(issueSlug, state.plan_hardened_at);
    if (merged) {
      log(`PR #${merged.number} for ${branchName} merged despite failure - closing cycle`);
      archiveCycleArtifacts(issueSlug);
      clearImplementationFailedState();
      markIdle(`PR #${merged.number} merged for: ${state.issue}`);
      return;
    }

    const openPr = checkOpenPR(issueSlug);
    if (openPr) {
      // Special case: Claude wrote the code + PR but skipped the implementation report.
      // Advancing directly to IMPLEMENTATION_COMPLETE would bypass the report requirement.
      // Instead, run a short targeted recovery session to write the report onto the branch.
      if (state.implementation_failure_reason === REASON_NO_IMPL_REPORT) {
        log(
          `PR #${openPr.number} exists but implementation report is missing - running report-only recovery`,
        );
        runReportRecovery(state, issueSlug, openPr.number);
        return;
      }

      // For any other failure reason (e.g. timeout after all work completed), an open PR
      // means Claude finished before the execSync wrapper expired -- safe to advance.
      log(
        `Open PR #${openPr.number} found for ${branchName} despite recorded failure - advancing to IMPLEMENTATION_COMPLETE`,
      );
      clearImplementationFailedState();
      markImplementationComplete(state);
      return;
    }

    // No open PR and no merged PR. Check whether Claude intentionally stopped before
    // creating a branch (contract/reality conflict). If all three stop-before-patch
    // markers are present in the last Claude output, synthesise the implementation
    // report locally and reset the pipeline to IDLE so the human can revise the plan.
    // This prevents the pipeline from stalling indefinitely on a legitimate stop.
    if (state.implementation_failure_reason === REASON_NO_IMPL_REPORT) {
      const lastMessage = fs.existsSync(CLAUDE_OUTPUT_FILE)
        ? readTextFile(CLAUDE_OUTPUT_FILE).trim()
        : "";
      if (detectStopBeforePatch(lastMessage)) {
        log(
          "Claude stopped before creating a branch or PR -- running stop-report synthesis to unblock pipeline",
        );
        synthesizeStopReport(state, issueSlug);
        return;
      }
    }

    log(
      "Pipeline implementation failed - waiting for corrected artifacts or a new issue" +
        (state.implementation_failure_reason ? ` (${state.implementation_failure_reason})` : ""),
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
  try {
    const result = spawnSync(getClaudeBinary(), buildClaudeVersionArgs(), {
      cwd: REPO_ROOT,
      windowsHide: true,
      timeout: 10000,
      encoding: "utf8",
      shell: process.platform === "win32",
    });

    if (result.error) {
      throw result.error;
    }

    const output = (result.stdout || "").trim();
    log(`Claude CLI health check passed (${output || getClaudeBinary()})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(
      `WARNING: Claude CLI health check failed - plan hardening will be blocked on PLANNING state`,
    );
    log(`  Reason: ${message}`);
    log(`  Fix: ensure 'claude' CLI is installed and available on PATH`);
  }
}

function startPipelineWatcher() {
  log("Pipeline watcher started");
  checkClaudeAvailability();
  setInterval(pollPipeline, POLL_INTERVAL_MS);
}

export {
  extractUsablePlanFromClaudeOutput,
  buildClaudeImplementationPrompt,
  buildClaudeExecArgs,
  buildClaudeVersionArgs,
  isActivePhaseUpdatePath,
  selectOpenReadyPR,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  if (process.argv.includes("--reset")) {
    // Apply the same editing_locked guard as scripts/reset-pipeline.js so this
    // path cannot bypass the lock that protects an in-flight PLANNING cycle.
    if (fs.existsSync(STATE_FILE)) {
      let currentState;
      try {
        currentState = readJson(STATE_FILE);
      } catch {
        // Corrupt state file -- allow the reset so the user can recover.
      }
      if (currentState?.editing_locked === true) {
        console.error(
          `[pipeline-watcher] ERROR: Cannot reset while editing_locked=true (state: ${currentState.state}).`,
        );
        console.error(
          "  The pipeline is actively hardening the implementation plan. Wait for it to finish.",
        );
        console.error("  Use 'npm run pipeline:reset' which enforces the same check.");
        process.exit(1);
      }
    }
    // Write the reset sentinel and exit immediately -- the running watcher will
    // pick it up on the next poll cycle (within 5 seconds).
    ensureReportsDir();
    fs.writeFileSync(
      PIPELINE_RESET_FILE,
      `${JSON.stringify({ requested_at: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
    console.log(
      "[pipeline-watcher] Reset sentinel written. The running watcher will reset to IDLE within 5 seconds.",
    );
    console.log(
      "[pipeline-watcher] If no watcher is running, start one with: npm run pipeline:start",
    );
    process.exit(0);
  }
  startPipelineWatcher();
}
