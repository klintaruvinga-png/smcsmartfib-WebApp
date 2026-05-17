# Pipeline Bug Sweep — codex-implementation.md missing on Codex stop

**Date**: 2026-05-17  
**Affected system**: pipeline-watcher.js / codex-implement-prompt.md  
**Severity**: High — pipeline stalls indefinitely, requires manual intervention  
**Status**: Fixed

---

## Issue summary

The Codex implementation step failed twice with the same reason:

> `Codex implementation finished without reports/codex-implementation.md`

In both cases, Codex correctly identified a contract/reality conflict and stopped before
making any code changes. However, it also skipped writing `reports/codex-implementation.md`,
which the watcher requires regardless of whether code was changed.

The watcher's `IMPLEMENTATION_FAILED` recovery logic only had two branches:
1. Merged PR → close cycle
2. Open PR → run `runReportRecovery()` (checkout branch, write report, push)

When Codex stopped before creating a branch or PR, both branches missed and the pipeline
logged "waiting for corrected artifacts" indefinitely with no automatic recovery path.

## Root cause

Two gaps, each independently sufficient to cause the stall:

**Gap 1 — Prompt**: `codex-implement-prompt.md` stop conditions said "stop and report" but
did not explicitly require writing `reports/codex-implementation.md` on a stop. Codex
interpreted "stop" as "exit immediately", bypassing the report requirement.

**Gap 2 — Watcher**: `evaluatePipeline()` had no recovery path for
`IMPLEMENTATION_FAILED + REASON_NO_IMPL_REPORT + no open PR`. The stop-before-patch case
(no branch, no PR, no files changed) was indistinguishable from a generic failure at the
watcher level, so the pipeline waited for manual intervention.

## Concrete failure sequence (2026-05-17)

```
Issue: heartbeat code path not executing despite OnPeriodic() firing
→ Codex reads plan, identifies SendHeartbeat() already exists in OnPeriodic()
→ Codex: "Adding SendHeartbeat() to OnPeriodic() would create dual dispatch"
→ Codex: "No patch applied. No files changed. No branch created. No PR opened."
→ Codex exits WITHOUT writing reports/codex-implementation.md
→ validateImplementationRun(): IMPLEMENTATION_FILE missing → REASON_NO_IMPL_REPORT
→ evaluatePipeline(): no open PR → no recovery branch matches → log and wait
→ Pipeline stalls. Manual intervention required to unblock.
```

## Fixes applied

### Fix 1 — Prompt hardening (`codex-implement-prompt.md`)

Added an explicit requirement under Stop conditions:

> When stopping for any of the above reasons you MUST still write
> `reports/codex-implementation.md` before exiting.

Provided exact section values for a stop report (all 7 required sections with stop-specific
content) and the exact git commands to stage, commit, and push the report on a stop.

### Fix 2 — Watcher: stop-report synthesis (`pipeline-watcher.js`)

Added `STOP_BEFORE_PATCH_PATTERNS` — three regexes that match the exact markers Codex
emits when it stops before patching:
- `no patch applied` / `no files changed`
- `no branch created`  
- `no pr opened` / `no pr created`

Added `detectStopBeforePatch(text)` — returns true only when ALL three patterns match the
Codex last-message output (strict AND logic to prevent false positives on timeout failures).

Added `synthesizeStopReport(state, issueSlug)` — when the stop is detected:
1. Synthesises `reports/codex-implementation.md` from the Codex stop message (all 7 sections)
2. Archives the cycle artifacts via `archiveCycleArtifacts()`
3. Clears the failure sentinel
4. Resets the pipeline to IDLE with a human-readable reason that includes the stop summary

In `evaluatePipeline()`, added a new branch in the `IMPLEMENTATION_FAILED` handler that
fires when `REASON_NO_IMPL_REPORT` and no open PR is found. Calls `detectStopBeforePatch()`
and, if confirmed, calls `synthesizeStopReport()` to self-heal.

## Recovery path for the current failure

The watcher will detect the `IMPLEMENTATION_FAILED` state on its next poll, find no open PR,
confirm the stop-before-patch pattern in `codex-last-message.txt`, and automatically:
- Synthesise the implementation report
- Archive the cycle
- Reset to IDLE with the stop reason

The human then sees the stop reason in the IDLE message and can revise the plan before
re-queuing a new `/research-and-plan` issue.

## Files changed

- `.github/prompts/codex-implement-prompt.md` — stop-report requirement added
- `scripts/pipeline-watcher.js` — `STOP_BEFORE_PATCH_PATTERNS`, `detectStopBeforePatch()`,
  `synthesizeStopReport()`, new recovery branch in `evaluatePipeline()`

## Regression protections

- `STOP_BEFORE_PATCH_PATTERNS` requires ALL three markers to be present — a timeout failure
  without explicit stop markers will NOT trigger the stop-report path
- `synthesizeStopReport()` writes the report BEFORE archiving so the archive always contains
  both the plan and the stop report for post-mortem review
- Pipeline resets to IDLE (not IMPLEMENTATION_COMPLETE) — no phantom "waiting for merged PR"
  state can result from a stop-before-patch cycle
- Prompt fix is a belt-and-suspenders defence: even if the watcher synthesis fires, future
  Codex runs will also write the report themselves, making the watcher path a fallback only

## Systems not touched

- Backend PHP auth / EA bridge routes
- MT5 EA MQL code
- Dashboard frontend signal/data layers
- Pine formulas
- validate-implementation.mjs (checks are already correct; the fix is upstream)
