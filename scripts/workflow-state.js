import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_STATES = new Set([
  "IDLE",
  "RESEARCHING",
  "PLANNING",
  "READY_FOR_IMPLEMENTATION",
  "IMPLEMENTATION_FAILED",
  "IMPLEMENTATION_COMPLETE",
]);

const TIMESTAMP_FIELDS = [
  "implementation_completed_at",
  "implementation_failed_at",
  "plan_hardened_at",
  "started_at",
  "idled_at",
];

function stripBom(raw) {
  return raw.replace(/^\uFEFF/, "");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function validateWorkflowStateShape(state) {
  if (!isPlainObject(state)) {
    throw new Error("Workflow state must be a JSON object");
  }

  if (typeof state.state !== "string" || !VALID_STATES.has(state.state)) {
    throw new Error(`Workflow state has invalid state value: ${String(state.state)}`);
  }
}

function getStateActivityMs(state) {
  let latest = Number.NEGATIVE_INFINITY;

  for (const field of TIMESTAMP_FIELDS) {
    if (typeof state[field] !== "string") {
      continue;
    }

    const ms = Date.parse(state[field]);
    if (Number.isFinite(ms) && ms > latest) {
      latest = ms;
    }
  }

  return latest;
}

function extractTopLevelJsonObjects(raw) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }

    if (char === "}") {
      if (depth === 0) {
        continue;
      }

      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(raw.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function selectBestRecoveryCandidate(candidates) {
  return candidates.reduce((best, current) => {
    if (!best) {
      return current;
    }

    if (current.activityMs !== best.activityMs) {
      return current.activityMs > best.activityMs ? current : best;
    }

    return current.index > best.index ? current : best;
  }, null);
}

function describeCandidate(candidate) {
  const timestamp =
    TIMESTAMP_FIELDS.map((field) => candidate.state[field]).find(
      (value) => typeof value === "string",
    ) ?? "no-timestamp";
  const issue = typeof candidate.state.issue === "string" ? candidate.state.issue : "no-issue";
  return `${candidate.state.state} [${issue}] @ ${timestamp}`;
}

function recoverWorkflowState(raw) {
  const objects = extractTopLevelJsonObjects(raw);
  const candidates = [];

  for (const [index, objectText] of objects.entries()) {
    try {
      const state = JSON.parse(objectText);
      validateWorkflowStateShape(state);
      candidates.push({
        index,
        state,
        activityMs: getStateActivityMs(state),
      });
    } catch {
      // Ignore invalid fragments and keep scanning.
    }
  }

  if (!candidates.length) {
    return null;
  }

  const selected = selectBestRecoveryCandidate(candidates);
  return {
    recoveredState: selected.state,
    candidateCount: candidates.length,
    selectedIndex: selected.index,
    summary: candidates.map(describeCandidate).join(" | "),
  };
}

function buildCorruptSnapshotPath(filePath, snapshotDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    snapshotDir,
    `${path.basename(filePath, path.extname(filePath))}.corrupt-${timestamp}.json`,
  );
}

export function readJsonFile(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
}

export function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
}

export function writeWorkflowState(filePath, state) {
  const normalized = compactObject(state);
  validateWorkflowStateShape(normalized);
  writeJsonFile(filePath, normalized);
  return normalized;
}

export function readWorkflowState(filePath, options = {}) {
  const { autoRepair = false, logger = () => {}, snapshotDir = null } = options;

  const raw = stripBom(fs.readFileSync(filePath, "utf8"));

  try {
    const parsed = JSON.parse(raw);
    validateWorkflowStateShape(parsed);
    return parsed;
  } catch (error) {
    if (!autoRepair) {
      throw error;
    }

    const recovered = recoverWorkflowState(raw);
    if (!recovered) {
      throw error;
    }

    if (snapshotDir) {
      fs.mkdirSync(snapshotDir, { recursive: true });
      fs.writeFileSync(buildCorruptSnapshotPath(filePath, snapshotDir), `${raw}\n`, "utf8");
    }

    logger(
      `Workflow state self-repaired: recovered candidate ${recovered.selectedIndex + 1}/${recovered.candidateCount} (${recovered.summary})`,
    );
    writeWorkflowState(filePath, recovered.recoveredState);
    return recovered.recoveredState;
  }
}

function requireArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return args[index + 1];
}

function getArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return null;
  }

  return args[index + 1];
}

function readExistingState(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readWorkflowState(filePath, { autoRepair: true });
}

function runCli() {
  const __filename = fileURLToPath(import.meta.url);
  if (!process.argv[1] || path.resolve(process.argv[1]) !== __filename) {
    return;
  }

  const repoRoot = path.join(path.dirname(__filename), "..");
  const stateFile = path.join(repoRoot, ".smc-workflow-state.json");
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    throw new Error("Usage: node scripts/workflow-state.js <research-start|planning-start|print>");
  }

  if (command === "research-start") {
    const issue = requireArg(args, "--issue");
    writeWorkflowState(stateFile, {
      workflow: "research-and-plan",
      state: "RESEARCHING",
      issue,
      editing_locked: true,
      started_at: new Date().toISOString(),
    });
    return;
  }

  if (command === "planning-start") {
    const current = readExistingState(stateFile);
    const issue = getArg(args, "--issue") ?? current?.issue;
    const startedAt = current?.started_at ?? new Date().toISOString();

    if (!issue) {
      throw new Error("Cannot enter PLANNING without an issue");
    }

    writeWorkflowState(stateFile, {
      workflow: current?.workflow ?? "research-and-plan",
      state: "PLANNING",
      issue,
      editing_locked: true,
      started_at: startedAt,
    });
    return;
  }

  if (command === "print") {
    const state = readExistingState(stateFile);
    if (!state) {
      process.stdout.write("null\n");
      return;
    }

    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

runCli();
