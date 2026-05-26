# Automation Update Log

This log records every confirmed repetitive automation failure, its root cause,
and the permanent guard installed to prevent recurrence. New entries are prepended
(newest first).

---

## [2026-05-26] Stale pipeline artifacts block new research cycles

- **Failure:** Prior-cycle `reports/codex-plan.md` (issue: crypto weekend session classification, PR #228) remained in the working directory when the "Fix EA compile errors" task was queued. Codex read the stale contract and halted with a conflict error.
- **Frequency:** Recurring — triggers on every new research-and-plan intake that encounters an artifact from a prior incomplete or completed-but-not-archived cycle.
- **Root cause:** RESEARCHING state handler does not clean up prior-cycle artifacts. `archiveCycleArtifacts()` fires only at cycle END, not at cycle START.
- **Guard installed:** Stale-artifact cleanup added to the RESEARCHING entry handler in `scripts/pipeline-watcher.js`. Archive-on-reset added to `scripts/reset-pipeline.js`. See PR #TBD.
- **Recurrence indicator:** If `reports/codex-plan.md` issue slug does not match `.smc-workflow-state.json` current issue at RESEARCHING entry, the watcher must archive it before PLANNING proceeds.

## 2026-05-16 — Codex finishes without writing `reports/codex-implementation.md`

**Failure sentinel:** `reports/.codex-implementation-failed.json`
**Reason field:** `"Codex implementation finished without reports/codex-implementation.md"`
**Frequency:** Observed on every Codex run that exits cleanly but omits step 9 (write implementation summary).
**Affected issue:** EA Side Routes Phase 1 Bridge (license-check, heartbeat, account-sync, symbol-sync)

### Root cause

Codex CLI exits with code 0 (no error), and `codex-last-message.txt` is refreshed, so the
pipeline watcher does not classify the run as a crash. However, `validateImplementationRun()`
in `scripts/pipeline-watcher.js` (line 686) checks for the existence of `codex-implementation.md`
as a distinct step _after_ verifying the exit message. When Codex finishes the code changes,
pushes the branch, and opens the PR, but does not execute step 9 of the implement prompt
("Write the implementation summary to: reports/codex-implementation.md"), the watcher records
`IMPLEMENTATION_FAILED` with the reason above.

### Pattern: why it is repetitive

The pipeline leaves the state as `IMPLEMENTATION_FAILED`. The `IMPLEMENTATION_FAILED` handler
in `evaluatePipeline()` (line 1241) checks for an open or merged PR — if one exists, it
self-heals to `IMPLEMENTATION_COMPLETE`. If Codex created the PR but the watcher hit the
30-minute timeout (`CODEX_TIMEOUT_MS = 1800000`), the PR exists but the watcher recorded
failure. The self-heal path (line 1257–1264) should catch this, but if the watcher restarted
after the timeout, the `checkOpenPR()` call may race against the pipeline lock, causing the
failure to persist.

### Guards installed (2026-05-16)

1. **`scripts/validate-implementation.mjs`** — standalone regression guard script that
   replicates the exact `isUsableImplementation()` and `validateImplementationRun()` checks
   from `pipeline-watcher.js`. Run it manually to diagnose any `IMPLEMENTATION_FAILED` state:

   ```
   node scripts/validate-implementation.mjs
   ```

   It exits 0 if all artifacts are valid, 1 with a specific diagnostic if not.

2. **Codex implement prompt section order verified** — `reports/codex-implementation.md` step
   is item 9 in `.github/prompts/codex-implement-prompt.md`, listed before the commit/push/PR
   steps. If Codex is skipping it, the most likely cause is context exhaustion near the end of
   a long session. Mitigation: keep the implement prompt explicit about the report being
   **required before committing** (not after).

3. **Self-heal path already in watcher** — `IMPLEMENTATION_FAILED` → `checkOpenPR()` →
   `IMPLEMENTATION_COMPLETE` path in `evaluatePipeline()` covers timeout-induced false failures.
   No code change needed here; documented for awareness.

### Manual recovery procedure

If the state is `IMPLEMENTATION_FAILED` and the code changes are already on a branch with an
open PR:

```bash
# 1. Check if the PR exists (it probably does)
gh pr list --head "codex/<issue-slug>" --state open

# 2. Verify the code changes are complete and correct on the branch

# 3. Write or fix reports/codex-implementation.md (all 7 sections required)

# 4. Write reports/codex-implementation.meta.json
#    (pipeline-watcher will auto-advance when it detects both files + valid meta)

# 5. Delete the failure sentinel
del reports\.codex-implementation-failed.json

# 6. Validate
node scripts/validate-implementation.mjs

# 7. Advance state manually (or let the watcher pick it up)
```

### Required sections for `codex-implementation.md`

The `isUsableImplementation()` check in `pipeline-watcher.js` requires ALL of these strings
to appear verbatim in the file:

- `Issue summary`
- `Root cause implemented`
- `Exact files changed`
- `Tests run`
- `Reports generated`
- `Remaining risks`
- `Any contract ambiguities resolved during implementation`

---

## Template for future entries

```
## YYYY-MM-DD — <one-line failure description>

**Failure sentinel / error:** <file or log message>
**Frequency:** <how often / which issues affected>
**Affected issue(s):** <issue slug or description>

### Root cause
<what actually goes wrong in the pipeline code or Codex behavior>

### Pattern: why it is repetitive
<why this same failure recurs across different issues>

### Guards installed (YYYY-MM-DD)
<numbered list of guards added: scripts, prompt changes, watcher fixes>

### Manual recovery procedure
<step-by-step to fix the stuck state>
```
