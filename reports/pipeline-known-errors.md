# Pipeline Known Errors

---

## KE-001 — `checkMergedPR` crash: `ReferenceError: err is not defined`

**Severity:** P1 — crashes watcher process entirely  
**Status:** Fixed 2026-05-25  
**File:** `scripts/pipeline-watcher.js` — `checkMergedPR()` catch block

### What happened

The watcher process (pid 33224) crashed at `2026-05-23T09:44:01Z` with:

```
ReferenceError: err is not defined
    at checkMergedPR (scripts/pipeline-watcher.js:339:17)
    at evaluatePipeline (scripts/pipeline-watcher.js:1618:20)
    at Timeout.pollPipeline [as _onTimeout]
```

The `checkMergedPR` function had a bare `catch {}` block (no bound parameter) that referenced `err` inside the body. Node.js threw `ReferenceError: err is not defined` and the uncaught exception killed the watcher.

### Impact

- Watcher process died and was never automatically restarted.
- The Phase 3 closeout intake queued on `2026-05-25T04:27:26Z` set state to `PLANNING` but had no watcher to pick it up.
- Task was stuck in `PLANNING` for over 1 hour with zero progress or log output.
- PID file `reports/.pipeline-runner.pid` still held stale pid 33224 (dead process).

### Root cause

```js
// BROKEN — bare catch, err not bound
} catch {
    const msg = err instanceof Error ? err.message : String(err);
```

### Fix applied

```js
// FIXED — err bound in catch parameter
} catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
```

### Recovery steps taken

1. Bug fixed in `scripts/pipeline-watcher.js` line 339.
2. Watcher restarted via `npm run pipeline:start`.
3. Pipeline advanced from `PLANNING` → plan hardening → `READY_FOR_IMPLEMENTATION`.

### Prevention

- The watcher has no restart-on-crash mechanism. Any uncaught exception kills the process permanently until manually restarted.
- Consider adding a supervisor wrapper (e.g. `node --unhandled-rejections=throw` + OS service / PM2) so the watcher auto-restarts on crash.

---
