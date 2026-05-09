import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.join(__dirname, "..");
const RESEARCH_FILE = path.join(REPO_ROOT, "reports", "copilot-research.md");
const PLAN_FILE = path.join(REPO_ROOT, "reports", "codex-plan.md");
const IMPLEMENTATION_FILE = path.join(REPO_ROOT, "reports", "codex-implementation.md");
const STATE_FILE = path.join(REPO_ROOT, ".smc-workflow-state.json");
const LOCK_FILE = path.join(REPO_ROOT, "reports", ".pipeline-running");
const CLAUDE_PLAN_PROMPT_FILE = path.join(REPO_ROOT, ".github", "prompts", "codex-plan-prompt.md");
const CODEX_IMPLEMENT_PROMPT_FILE = path.join(
  REPO_ROOT,
  ".github",
  "prompts",
  "codex-implement-prompt.md",
);
const CODEX_OUTPUT_FILE = path.join(REPO_ROOT, "reports", "codex-last-message.txt");
const POLL_INTERVAL_MS = 5000;
const CLAUDE_TIMEOUT_MS = 300000;
const CODEX_TIMEOUT_MS = 900000;

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
  return [statMtime(RESEARCH_FILE), statMtime(PLAN_FILE), statMtime(STATE_FILE)].join(":");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function withPipelineLock(label, fn) {
  ensureReportsDir();

  if (fs.existsSync(LOCK_FILE)) {
    log("Pipeline already running - skipping trigger");
    return;
  }

  try {
    fs.writeFileSync(LOCK_FILE, `${label} ${new Date().toISOString()}\n`, "utf8");
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${label} error: ${message}`);
  } finally {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  }
}

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
- Do not implement code.
- Stop after the plan is written.
`;

  withPipelineLock("claude-plan-hardening", () => {
    log("PLANNING detected - running Claude plan hardening");
    execFileSync("claude", ["--print", prompt], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      timeout: CLAUDE_TIMEOUT_MS,
    });

    if (!fs.existsSync(PLAN_FILE)) {
      throw new Error("Claude plan hardening finished without reports/codex-plan.md");
    }

    writeJson(STATE_FILE, {
      ...state,
      state: "READY_FOR_IMPLEMENTATION",
      editing_locked: false,
      plan_hardened_at: new Date().toISOString(),
    });

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
    execFileSync(
      "codex",
      [
        "exec",
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "never",
        "--cd",
        REPO_ROOT,
        "--output-last-message",
        CODEX_OUTPUT_FILE,
        "-",
      ],
      {
        cwd: REPO_ROOT,
        input: prompt,
        stdio: ["pipe", "inherit", "inherit"],
        timeout: CODEX_TIMEOUT_MS,
      },
    );

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

    if (!fs.existsSync(PLAN_FILE) || statMtime(RESEARCH_FILE) > statMtime(PLAN_FILE)) {
      runClaudePlanHardening(state);
    }
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
