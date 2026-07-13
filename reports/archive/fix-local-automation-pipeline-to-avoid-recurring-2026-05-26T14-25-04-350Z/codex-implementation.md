# Implementation Report

## Issue summary

Local pipeline cycles could inherit stale `reports/codex-plan.md` and implementation artifacts from a prior issue, causing the next Codex run to stop on a contract conflict before new work began.

## Root cause implemented

Added an early stale-artifact archive step in the watcher's `RESEARCHING` handler and added manual-reset archiving so prior-cycle plan and implementation artifacts are moved out of `reports/` before a new cycle or reset continues.

## Exact files changed

- `scripts/pipeline-watcher.js` — added stale-artifact archive helpers, RESEARCHING-entry cleanup, and manual-reset archiving in the sentinel handler.
- `scripts/reset-pipeline.js` — added manual-reset archive logic for plan and implementation artifacts, plus direct reset-to-IDLE behavior while preserving the sentinel flow.
- `reports/automation-update-log.md` — recorded the stale-artifact failure pattern and the permanent guards installed.
- `.github/copilot-instructions.md` — documented the required issue-ownership check before PLANNING.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-26_pipeline-stale-artifacts.md` — recorded the runtime-integrity sweep for the stale-artifact failure path and the remaining reset-path risk.
- `reports/codex-implementation.md` — added the required implementation summary before validation per contract, then updated it with the final verification results.
- `reports/codex-implementation.meta.json` — added the companion implementation metadata so watcher and validation tooling can confirm artifact freshness.

## Tests run

- Scenario harness: stale prior-issue plan at `RESEARCHING` archived into `reports/archive/stale-validation-prior-issue-*/` before `PLANNING`.
- Scenario harness: matching current-cycle plan preserved across repeated watcher starts.
- Scenario harness: `node scripts/reset-pipeline.js` archived plan and implementation artifacts into `reports/archive/manual-reset-*/` and reset the workflow state to `IDLE`.
- `node scripts/validate-implementation.mjs`
- `npx eslint scripts/pipeline-watcher.js scripts/reset-pipeline.js`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-26_pipeline-stale-artifacts.md`
- No parity audit required by the contract for this pipeline-only patch.

## Remaining risks

The reset contract assumes `pipeline:reset` directly stops the watcher, but the repository currently uses a sentinel-driven reset. The patch keeps the sentinel path intact and adds local archive/reset behavior in the reset script; this needs verification against a live watcher to confirm there is no race on active manual resets.

## Any contract ambiguities resolved during implementation

The contract described `pipeline:reset` as if it performed the reset after watcher termination, but the repository actually delegates reset completion to `scripts/pipeline-watcher.js` via `reports/.pipeline-reset-requested`. I kept that architecture and added archive/reset behavior in both the reset script and the watcher's sentinel path. I also treated missing implementation metadata during a new `RESEARCHING` cycle as stale because ownership could not be proven for the current issue.
