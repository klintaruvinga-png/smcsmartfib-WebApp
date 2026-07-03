import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_PIPELINE_CONFIG, resolvePipelineContext } from "./pipeline-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const args = process.argv.slice(2);
const COMMAND_OPTIONS_WITH_VALUES = new Set(["--repo"]);

function readCommand(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (COMMAND_OPTIONS_WITH_VALUES.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return "status";
}

const command = readCommand(args);
const context = resolvePipelineContext(args);

function printUsage() {
  console.log(
    [
      "Usage: node scripts/agent-pipeline.js <command> [--repo <path>]",
      "",
      "Commands:",
      "  init    Create .agent-pipeline/config.json if missing",
      "  check   Validate required pipeline prompt files for the target repo",
      "  start   Start detached watcher for the target repo",
      "  watch   Run watcher in the foreground for the target repo",
      "  status  Print target repo, state, pid, and config status",
      "  reset   Archive current artifacts and request watcher reset",
    ].join("\n"),
  );
}

function runNodeScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--repo", context.repoRoot, ...extraArgs],
    {
      cwd: context.repoRoot,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.status !== null) {
    process.exitCode = result.status;
  } else if (result.signal) {
    // Process terminated by signal: map to exit code 128 + signal number (Unix convention)
    const signalNumber = os.constants.signals[result.signal] || 1;
    process.exitCode = 128 + signalNumber;
  } else {
    process.exitCode = 1;
  }
}

function readPid() {
  try {
    const value = Number.parseInt(fs.readFileSync(context.paths.runnerPidFile, "utf8").trim(), 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function isRunning(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStateSummary() {
  try {
    const state = JSON.parse(
      fs.readFileSync(context.paths.stateFile, "utf8").replace(/^\uFEFF/, ""),
    );
    return `${state.state ?? "UNKNOWN"}${state.issue ? ` (${state.issue})` : ""}`;
  } catch {
    return "missing";
  }
}

function initConfig() {
  const configDir = path.join(context.repoRoot, ".agent-pipeline");
  const configPath = path.join(configDir, "config.json");
  if (fs.existsSync(configPath) && !args.includes("--force")) {
    console.log(`Config already exists: ${configPath}`);
    return;
  }

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        profile: "copilot-claude-codex",
        ...DEFAULT_PIPELINE_CONFIG,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Wrote ${configPath}`);
}

function printStatus() {
  const pid = readPid();
  console.log(`Repo: ${context.repoRoot}`);
  console.log(
    `Config: ${fs.existsSync(path.join(context.repoRoot, ".agent-pipeline", "config.json")) ? ".agent-pipeline/config.json" : "defaults"}`,
  );
  console.log(`State: ${readStateSummary()}`);
  console.log(`Runner PID: ${pid ?? "none"}`);
  console.log(`Runner active: ${isRunning(pid) ? "yes" : "no"}`);
  console.log(`Reports: ${context.paths.reportsDir}`);
}

function checkRequiredFiles() {
  const required = [context.paths.planPromptFile, context.paths.implementationPromptFile];
  const missing = required.filter((filePath) => !fs.existsSync(filePath));

  console.log(`Repo: ${context.repoRoot}`);
  console.log(
    `Config: ${fs.existsSync(path.join(context.repoRoot, ".agent-pipeline", "config.json")) ? ".agent-pipeline/config.json" : "defaults"}`,
  );

  if (missing.length) {
    console.log("Missing:");
    for (const filePath of missing) {
      console.log(`- ${path.relative(context.repoRoot, filePath)}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Check: ok");
}

switch (command) {
  case "help":
  case "--help":
  case "-h":
    printUsage();
    break;
  case "init":
    initConfig();
    break;
  case "check":
    checkRequiredFiles();
    break;
  case "start":
    runNodeScript("start-pipeline-runner.js");
    break;
  case "watch":
    runNodeScript("pipeline-watcher.js");
    break;
  case "reset":
    runNodeScript("reset-pipeline.js");
    break;
  case "status":
    printStatus();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
}
