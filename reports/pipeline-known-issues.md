# Pipeline Known Issues Log

---

## [2026-05-23] RESEARCHING state silently stalls pipeline watcher

**Severity:** High — blocks every new Copilot research cycle  
**Discovered:** 2026-05-23, during crypto weekend-offline issue intake  
**Fixed:** 2026-05-23 — `scripts/pipeline-watcher.js`

### Symptom

After Copilot writes `reports/copilot-research.md` and sets workflow state to
`RESEARCHING`, the pipeline watcher detects the state change but silently does
nothing. No plan hardening runs, no error is logged, the pipeline stalls
indefinitely.

### Root cause

`evaluatePipeline()` in `scripts/pipeline-watcher.js` had handlers for:
`PLANNING`, `READY_FOR_IMPLEMENTATION`, `IDLE`, `IMPLEMENTATION_COMPLETE`,
`IMPLEMENTATION_FAILED` — but **no handler for `RESEARCHING`**. The function
fell through all branches without logging or acting.

### Impact

- Pipeline runner appeared alive (process running, lock file status `done`).
- Workflow state was `RESEARCHING` with `editing_locked: true`.
- `copilot-research.md` was complete with full research content.
- Claude plan hardening never started; Codex never received a task.
- Required manual intervention: update state to `PLANNING` by hand.

### Fix applied

Added a `RESEARCHING` handler at the top of the `evaluatePipeline()` if-chain
in `scripts/pipeline-watcher.js`:

- If `copilot-research.md` does not exist → log "waiting", return.
- If `copilot-research.md` exists but is empty → log "still waiting", return.
- If `copilot-research.md` exists and has content → log transition, write
  state `PLANNING` with `editing_locked: true`, return.

This makes the watcher self-advancing: as soon as Copilot finishes writing the
research file the next poll (≤ 5 s) transitions to `PLANNING` automatically,
no manual intervention required.

### Files changed

- `scripts/pipeline-watcher.js` — added `RESEARCHING` state handler

### How to detect recurrence

Check `reports/pipeline-runner.log`. If the last entry is
`"Pipeline state change detected"` with no follow-up action line, and
`.smc-workflow-state.json` shows `"state": "RESEARCHING"`, the pipeline is
stalled. With the fix applied this will no longer occur.
