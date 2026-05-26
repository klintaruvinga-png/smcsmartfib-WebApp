# Bug Sweep Report — 2026-05-26 — Pipeline Stale Artifacts

## Overview

- Scope: local automation pipeline stale-artifact handling at `RESEARCHING` entry and during `pipeline:reset`.
- Confirmed defect: prior-cycle `reports/codex-plan.md` and related artifacts could remain in `reports/` and block the next issue with a contract conflict.
- Fix status: patched in `scripts/pipeline-watcher.js` and `scripts/reset-pipeline.js`; guard documentation added in `.github/copilot-instructions.md` and `reports/automation-update-log.md`.
- Parity impact: none. This patch changes pipeline artifact governance only.

## Findings

### Confirmed fixed

1. Stale prior-issue plan artifacts are now archived before `RESEARCHING -> PLANNING`.
   Evidence:

- Validation scenario with `reports/codex-plan.meta.json.issue = "validation prior issue"` and workflow issue `"validation current issue"` moved `reports/codex-plan.md` into `reports/archive/stale-validation-prior-issue-*/` before the watcher advanced to `PLANNING`.

2. Matching current-cycle artifacts are preserved on watcher restart.
   Evidence:

- Repeated watcher-start simulation with matching `reports/codex-plan.meta.json.issue` left `reports/codex-plan.md` in place across both runs.

3. `pipeline:reset` now archives plan and implementation artifacts even without depending solely on a live watcher.
   Evidence:

- Validation scenario moved `reports/codex-plan.md` and `reports/codex-implementation.md` into `reports/archive/manual-reset-*/` and rewrote `.smc-workflow-state.json` to `IDLE`.

### Residual risk

1. The repo’s reset architecture is still dual-path.
   Details:

- `scripts/reset-pipeline.js` now resets state locally and still writes the sentinel so a running watcher converges on the same result.
- This is the smallest safe interpretation of the contract because the existing repo does not actually “stop the watcher” inside `pipeline:reset`.

2. End-of-cycle archive flow was not replayed with a full live Claude/Codex/PR merge cycle.
   Details:

- `archiveCycleArtifacts()` was intentionally left in place and untouched functionally.
- The patch validated the new entry/reset paths and the existing implementation-artifact guard script, but not a full remote cycle through `IMPLEMENTATION_COMPLETE` and merge polling.

## Recommendations

1. Keep the new RESEARCHING-entry stale cleanup narrow: issue-mismatch or missing plan metadata only.
2. Preserve the manual-reset archive path in both the reset script and watcher sentinel flow until the reset architecture is consolidated.
3. Run one live end-to-end issue cycle after merge to confirm the new reset path does not race a continuously running watcher.
