import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePipelineContext } from "./pipeline-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PIPELINE_CONTEXT = resolvePipelineContext();
const REPO_ROOT = PIPELINE_CONTEXT.repoRoot;
const REPORTS_DIR = PIPELINE_CONTEXT.paths.reportsDir;
const PID_FILE = PIPELINE_CONTEXT.paths.runnerPidFile;
const LOG_FILE = PIPELINE_CONTEXT.paths.runnerLogFile;
const WATCHER_FILE = path.join(__dirname, "pipeline-watcher.js");

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }

  const value = Number.parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
  return Number.isFinite(value) ? value : null;
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

function writeLog(message) {
  fs.appendFileSync(
    LOG_FILE,
    `[pipeline-runner] ${new Date().toISOString()} - ${message}\n`,
    "utf8",
  );
}

function main() {
  ensureReportsDir();

  const existingPid = readPid();
  if (isRunning(existingPid)) {
    console.log(`Pipeline runner already active (pid ${existingPid}).`);
    writeLog(`Start request ignored; runner already active (pid ${existingPid})`);
    return;
  }

  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [WATCHER_FILE, "--repo", REPO_ROOT], {
    cwd: REPO_ROOT,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();
  fs.writeFileSync(PID_FILE, `${child.pid}\n`, "utf8");
  writeLog(`Started pipeline watcher (pid ${child.pid})`);
  console.log(`Pipeline runner started (pid ${child.pid}).`);
}

main();
