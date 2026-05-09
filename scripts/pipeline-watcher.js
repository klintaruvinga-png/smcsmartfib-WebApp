import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.join(__dirname, '..');
const PLAN_FILE = path.join(REPO_ROOT, 'reports', 'codex-plan.md');
const LOCK_FILE = path.join(REPO_ROOT, 'reports', '.pipeline-running');
const POLL_INTERVAL_MS = 5000;
const CLAUDE_TIMEOUT_MS = 300000;
const CLAUDE_PROMPT =
  'Read reports/codex-plan.md from the current repo and implement the patch exactly as specified. Create the branch named in the plan. Make all file changes. Commit each file separately using the commit messages in the plan. Open a PR when done. Do not change backend PHP. Do not change TypeScript interfaces. Output the PR URL when complete.';

let lastMtime = null;

function log(message) {
  console.log(`[pipeline-watcher] ${new Date().toISOString()} - ${message}`);
}

function ensureReportsDir() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
}

function triggerClaudeCode() {
  ensureReportsDir();

  if (fs.existsSync(LOCK_FILE)) {
    log('Pipeline already running - skipping trigger');
    return;
  }

  try {
    fs.writeFileSync(LOCK_FILE, new Date().toISOString(), 'utf8');
    log('codex-plan.md changed - triggering Claude Code');

    execSync(`claude --print "${CLAUDE_PROMPT}"`, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: CLAUDE_TIMEOUT_MS,
    });

    log('Claude Code run complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Claude Code error: ${message}`);
  } finally {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  }
}

function checkFile() {
  try {
    const stat = fs.statSync(PLAN_FILE);
    const mtime = stat.mtimeMs;

    if (lastMtime === null) {
      lastMtime = mtime;
      log('Watching reports/codex-plan.md');
      return;
    }

    if (mtime !== lastMtime) {
      lastMtime = mtime;
      log('Change detected');
      triggerClaudeCode();
    }
  } catch {
    // reports/codex-plan.md does not exist yet. Keep polling.
  }
}

log('Pipeline watcher started');
setInterval(checkFile, POLL_INTERVAL_MS);
