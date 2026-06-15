# Issue Research: SMC Intake - Test the local automation loop

## 1. Issue classification
- **Severity**: MEDIUM
- **Category**: workflow / automation-governance / integration-test
- **Layer(s) affected**: Workflow / Pipeline / Codex / Local automation / CI-adjacent
- **Phase impact**: Cross-phase (affects all research-and-plan cycles)

---

## 2. Confirmed evidence

### Automation Architecture
- **Pipeline runner**: `scripts/start-pipeline-runner.js` spawns a detached `pipeline-watcher.js` process
- **Workflow state machine**: `.smc-workflow-state.json` tracks state transitions (IDLE → RESEARCHING → PLANNING → READY_FOR_IMPLEMENTATION → IMPLEMENTATION_COMPLETE)
- **State management CLI**: `scripts/workflow-state.js` provides commands:
  - `research-start --issue "..."` — creates state file with RESEARCHING state and editing_locked=true
  - `planning-start --issue "..."` — advances to PLANNING state and editing_locked=true
  - `print` — displays current state

### Pipeline Watcher Behavior (Confirmed in `scripts/pipeline-watcher.js`)
1. Monitors `.smc-workflow-state.json` state field and workflow artifacts
2. **RESEARCHING → PLANNING transition**: 
   - Waits for `reports/copilot-research.md` to exist
   - Calls Codex with plan hardening prompt (`.github/prompts/codex-plan-prompt.md`)
   - Times out after 15 minutes (PLAN_TIMEOUT_MS = 900000)
   - Produces `reports/codex-plan.md` and `reports/codex-plan.meta.json`
3. **PLANNING → READY_FOR_IMPLEMENTATION transition**:
   - Validates plan metadata matches current issue slug
   - Archives stale plans if they belong to a different issue
4. **READY_FOR_IMPLEMENTATION state**:
   - Pipeline calls Codex to implement (`.github/prompts/codex-implement-prompt.md`)
   - Produces `reports/codex-implementation.md` and branch + PR on GitHub
5. **IMPLEMENTATION_COMPLETE state**:
   - Polls GitHub for PR merge (~60s poll interval)
   - Archives cycle artifacts to `reports/archive/` when merged
   - Resets state to IDLE

### Test Coverage
- Confirmed unit tests in `scripts/pipeline-watcher.test.mjs`:
  - Validates Codex command construction
  - Tests plan extraction from Codex output
  - Verifies non-draft PR selection
  - Tests migration archive path logic
- Tests are included in `npm run test:focused` command
- **Gap**: No end-to-end integration test of full research-plan-implement cycle

### Current Pipeline State (as of 2026-06-15 13:31:24 UTC)
- State file: `.smc-workflow-state.json` → RESEARCHING for "SMC Intake - Test the local automation loop"
- Pipeline runner PID: 16992 (active)
- Stale hardening block: `.claude-hardening-blocked.json` exists from previous issue (dated 2026-05-27)
  - **Root cause**: Claude CLI command failed during plan hardening attempt
  - **Issue**: Previous attempt was for "Fix admin Health page issue: TypeError reading 'feedStatus'"
  - **Status**: Marked permanent after 3 retry attempts

### Integration Points
- **GitHub workflow automation**: `.github/workflows/02-implementation.yml` is intentionally manual-only; states that local pipeline is authoritative
- **Codex integration**: Pipeline spawns Codex using shell commands with stdin redirection:
  - Plan hardening: `codex exec --json --dangerously-bypass-approvals-and-sandbox -C <repo> -o <output> - < <prompt-file>`
  - Implementation: Same command structure
- **PR creation**: Pipeline expects `gh` (GitHub CLI) to be available for `gh pr create --fill` and `gh pr ready`
- **Lock mechanism**: `.pipeline-lock.json` uses write-only JSON approach to avoid OneDrive sync conflicts

### Automation Loop Contract
- Research phase produces: `reports/copilot-research.md`
- Plan hardening produces: `reports/codex-plan.md` + `reports/codex-plan.meta.json`
- Implementation produces: `reports/codex-implementation.md` + branch + PR
- Metadata files must include issue slug matching `.smc-workflow-state.json` issue field
- Pipeline resets to IDLE only when artifacts are archived after PR merge

---

## 3. Root cause hypothesis

### The automation loop design intent (Confirmed):
1. **Copilot intake phase** → writes research to `reports/copilot-research.md` and calls `npm run pipeline:start`
2. **Pipeline watcher detects RESEARCHING state** → waits for research file
3. **Copilot calls `planning-start` CLI** → advances workflow to PLANNING with editing_locked=true
4. **Watcher detects PLANNING state** → calls Codex to harden plan from research
5. **Codex produces plan** → watcher advances to READY_FOR_IMPLEMENTATION, then immediately calls Codex for implementation
6. **Codex implementation creates branch + PR** → watcher detects PR and advances to IMPLEMENTATION_COMPLETE
7. **Watcher polls GitHub** → when PR is merged, archives artifacts and resets to IDLE

### Current Loop Status (Hypothesis):
- **Design appears sound** (Confirmed from codebase inspection)
- **Implementation barriers exist** (Confirmed):
  1. **Stale hardening block**: Previous issue left `.claude-hardening-blocked.json` in permanent state
     - Must be manually deleted or the pipeline must detect it's from a different issue
     - Current watcher does NOT auto-clear cross-issue blocks (Hypothesis)
  2. **Codex CLI availability**: Previous failure was "Claude CLI command failed"
     - Requires `codex` binary to be installed and authenticated
     - No health check before entering PLANNING state (Hypothesis)
  3. **GitHub CLI requirement**: Pipeline assumes `gh` is available
     - No pre-flight check or graceful degradation (Hypothesis)
  4. **No mock/test mode**: Difficult to test without live Codex and GitHub CLI
     - Unit tests exist but no end-to-end harness (Confirmed gap)

### What Likely Triggered This Intake Request
- Previous automation cycle left blocking artifacts (`.claude-hardening-blocked.json`, `.pipeline-lock.json`)
- User wants to verify the loop can recover and handle a clean issue
- Need to validate that state transitions work correctly
- Establish baseline for future issue automation tracking

---

## 4. Blast radius

### Direct impact surface:
- `scripts/workflow-state.js` — controls all state transitions
- `scripts/pipeline-watcher.js` — orchestrates all automation polling
- `scripts/start-pipeline-runner.js` — spawns the background watcher
- `.smc-workflow-state.json` — single source of truth for workflow state
- `reports/` directory — all automation artifacts stored here
- `.github/prompts/codex-*.md` — templates consumed by Codex
- `.github/workflows/02-implementation.yml` — intentionally disabled (defer to local runner)

### Systems reading/writing workflow state:
1. **Copilot intake** → writes research, calls `workflow-state.js planning-start`
2. **Pipeline watcher** → reads state, advances state on artifact detection
3. **Codex execution** → reads prompts, writes metadata in implementation report
4. **GitHub API** → (via `gh` CLI) for PR creation and merge detection
5. **Manual intervention** → (via `npm run pipeline:reset`) to escape IMPLEMENTATION_FAILED

### Parity surfaces at risk:
- **None directly** — this is a workflow/meta-automation layer, not a trading signal system
- **Indirect risk**: If automation breaks, fixes to parity/signal systems cannot be deployed via automated plan-implement cycle
- **Authority boundary**: Local pipeline runner is authoritative; GitHub CI workflows are intentionally dormant

### Stale-state and sequencing risks:
1. **State lock timeout** (30 min = 1800000 ms) — if Codex hangs, watcher must detect and fail gracefully
2. **Plan metadata mismatch** — if plan.meta.json issue slug differs from current workflow state issue, plan is archived (safe)
3. **Corrupt state file** — `workflow-state.js` includes auto-repair logic that recovers from partial writes
4. **Multiple runners** — `start-pipeline-runner.js` prevents duplicate processes via PID file; but OneDrive sync could corrupt file

---

## 5. Regression surface

### Currently working behavior that must not break:
1. **State file integrity** — RESEARCHING state with editing_locked=true prevents edits during research phase (Confirmed guard)
2. **Plan archival** — stale plans from different issues are archived, not reused (Confirmed in watcher logic)
3. **Lock mechanism** — write-only JSON lock prevents concurrent Codex invocations (Confirmed)
4. **PID-based runner deduplication** — only one pipeline watcher runs at a time (Confirmed)
5. **Manual reset path** — `npm run pipeline:reset` is the escape hatch from IMPLEMENTATION_FAILED (Confirmed)

### Existing tests covering this layer:
- `scripts/pipeline-watcher.test.mjs` — 6 unit tests for Codex command, plan extraction, PR selection
- `scripts/workflow-state.test.mjs` — tests for state validation and CLI parsing
- Tests run via `npm run test:focused` command
- **No e2e test harness** — no integration test that exercises full research-plan-implement cycle

### Audit/validation paths that exist:
- `.smc-workflow-state.json` can be inspected at any time via `node scripts/workflow-state.js print`
- `reports/pipeline-runner.log` logs all watcher state transitions and Codex invocations
- `reports/.pipeline-lock.json` shows current lock holder and status
- PR metadata in GitHub can be correlated with `reports/codex-implementation.meta.json`

---

## 6. Resolution path options

### Path A: Clear blocking artifacts and test locally (Narrowest)
**Scope**:
1. Delete `.claude-hardening-blocked.json` (allows watcher to retry Codex plan hardening)
2. Delete `.pipeline-lock.json` (clears any stale lock)
3. Start pipeline runner: `npm run pipeline:start`
4. Monitor watcher logs and observe state transitions
5. Verify that Codex is installed and authenticated (`codex --version`)
6. Confirm research file exists and plan/implementation cycle completes

**Rationale**: 
- Minimal intervention — only removes blocking artifacts, does not change code
- Tests the happy path: research → plan → implement → PR → merge
- Identifies which components are actually broken vs. just blocked
- Can be done in one session

**Validation**:
- `npm run test:focused` passes (unit tests still green)
- Watch `reports/pipeline-runner.log` for state transitions
- Observe PR creation on GitHub
- Confirm `.smc-workflow-state.json` reaches IMPLEMENTATION_COMPLETE

---

### Path B: Add health checks and e2e test harness (Broader risk mitigation)
**Scope**:
1. Add pre-flight checks to watcher:
   - Verify Codex CLI is installed and authenticated
   - Verify GitHub CLI is available
   - Verify reports directory is writable
2. Add e2e test orchestrator in `scripts/` that:
   - Simulates full research → plan → implement cycle
   - Mocks or stubs Codex and GitHub CLI to allow testing without live services
   - Validates state transitions, artifact creation, and cleanup
3. Add `.github/workflows/` check that can be manually triggered to validate the loop

**Rationale**:
- Prevents silent failures (CLI missing, auth expired)
- Allows testing on CI without live Codex/GitHub
- Catches regressions in future changes to workflow logic
- Provides diagnostic telemetry for troubleshooting

**Risk**:
- More code surface to maintain
- Mock stubs may diverge from actual Codex/GitHub behavior
- Adds 2-3 hours of development

---

## 7. Risk flags

- **High-risk system involved**: No
  - This is orchestration/meta-automation, not trading logic
  - Failures are contained to development workflow, not production trading
  
- **Requires parity re-validation**: No
  - No changes to signal engines, price data, or Fib calculations
  - No cross-layer contract changes
  
- **Migration-blocking**: No
  - This is a testing/validation of existing automation
  - Does not unblock or block any phase gates
  - Phase 0 stabilization continues independently
  
- **Human review required before merge**: Yes
  - Any code changes to watcher or state logic must be reviewed by repository maintainer
  - Clearing artifacts is safe (no code change)
  - Full test harness addition requires design review

---

## 8. Handoff package

### Epicentre files to inspect first:
1. `scripts/workflow-state.js` — state transitions logic
2. `scripts/pipeline-watcher.js` — polling and Codex orchestration
3. `scripts/start-pipeline-runner.js` — runner lifecycle
4. `.smc-workflow-state.json` — current state (check editing_locked, state, issue)
5. `reports/.claude-hardening-blocked.json` — blocker from previous cycle
6. `reports/pipeline-runner.log` (tail -n 200) — recent watcher activity

### Inputs Codex must verify before planning:
1. Is Codex CLI installed? (`codex --version`)
2. Is GitHub CLI installed? (`gh --version`)
3. Is GitHub authenticated? (`gh auth status`)
4. Are reports/ and reports/archive directories writable?
5. Does .smc-workflow-state.json match the issue in the user message?

### Open unknowns that could invalidate hypothesis:
1. **How does watcher detect the PLANNING state transition?** 
   - Hypothesis: Polls `.smc-workflow-state.json` state field every POLL_INTERVAL_MS (5s)
   - Must verify timing between `planning-start` CLI call and watcher response
   
2. **What happens if Codex plan hardening fails?**
   - Hypothesis: Enters PLAN_HARDENING_BLOCKED state, retries up to 3 times with 5min backoff
   - Must confirm whether current `.claude-hardening-blocked.json` prevents new retries
   
3. **How does the watcher know a plan is stale?**
   - Hypothesis: Compares `codex-plan.meta.json.issue_slug` with current workflow state issue
   - Must verify slug transformation and archive logic
   
4. **Does the pipeline preserve the research file or overwrite it?**
   - Hypothesis: Research file is read once and preserved; not overwritten during plan/implement phases
   - Must confirm to ensure no data loss during cycle
   
5. **What is the GitHub PR poll timeout?**
   - Hypothesis: Watcher polls for merged PR indefinitely (no timeout in IMPLEMENTATION_COMPLETE)
   - Could leave stale processes if PR is never merged
