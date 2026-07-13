# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

### Confirmed

- `POST /ea/heartbeat` route is registered and auth-gated identically to the passing sync routes (`license-check`, `account-sync`, `symbol-sync`). The backend is ready to receive heartbeats.
- `post_ea_heartbeat()` handler is implemented and persists data via `insert_engine_heartbeat()`. The handler is not the problem.
- `SendHeartbeat()` exists in `mt5/MarketDataEngine.mqh` at lines 460–519 and constructs a correct JSON payload.
- `OnPeriodic()` in `mt5/MarketDataEngine.mqh` is confirmed live — it drives account-sync, symbol-sync, and market-stream dispatches every cycle.
- **Confirmed root cause:** `OnPeriodic()` does not contain a call to `SendHeartbeat()`. The call site was never wired. Zero heartbeat dispatches across multiple live cycles is the exact symptom produced by a missing call site, not by auth failure, payload error, or route misconfiguration.

### Likely

- The omission originated during initial scaffolding: `SendHeartbeat()` was implemented as a handler before it was wired into the dispatch loop. This is consistent with the pattern where the backend route and PHP tests were completed before the MT5 call site was added.
- `g_heartbeatIntervalTicks=48` throttle logic is dead code until the call site exists; once wired, throttle behavior will activate automatically on the first `OnPeriodic()` cycle that satisfies the tick count.

### Unconfirmed — must verify before patching

- **UC-1:** Whether `OnTimer()`, `OnInit()`, or `OnDeinit()` independently calls `SendHeartbeat()` anywhere in the EA codebase. If any such call exists outside the function definition, the root cause differs and this patch would duplicate dispatch.
- **UC-2:** Whether `baseUrl` inside `SendHeartbeat()` is correctly derived from the webhook URL passed to `Initialize()`, or whether it references `webhookUrl` or a hardcoded string. A misconfigured `baseUrl` would cause the added call to POST to the wrong endpoint, masking a configuration defect.
- **UC-3:** Whether `wpUserId` is populated correctly at the point `SendHeartbeat()` executes, ensuring the heartbeat payload carries a valid positive `user_id` matching the auth gate requirement.
- **UC-4:** Whether the 8-minute cadence (`g_heartbeatIntervalTicks=48`) is compatible with the Phase 1 validation gate's liveness threshold. If the gate expects a heartbeat within less than 8 minutes of session start, the first dispatch may arrive too late to satisfy the check.

**If UC-1 finds an existing call site, stop. Do not proceed with this plan. Re-evaluate root cause before any edit.**

---

## 2. Implementation contract

### File 1: `mt5/MarketDataEngine.mqh`

- **Exact location:** `OnPeriodic()` method body, immediately after the symbol-iteration loop and all `SendToBackend()` calls complete — before the method returns.
- **Exact change:** Add two lines:
  1. A `Print()` diagnostic log line recording that heartbeat dispatch is being attempted, including the current tick count and `g_heartbeatIntervalTicks` value, so post-patch log inspection can confirm the call site was reached.
  2. A call to `SendHeartbeat()` with no arguments (matches the existing function signature).
- **Guard rails:**
  - The symbol-iteration loop must not be altered.
  - `SendToBackend()` call frequency, argument list, and ordering must not change.
  - `SendHeartbeat()` function body (lines 460–519) must not be modified.
  - `baseUrl` derivation must not be touched.
  - No new variables, no new includes, no new conditional blocks beyond the throttle logic already inside `SendHeartbeat()`.
- **Why in scope:** This is the only periodic dispatch path confirmed active. `SendHeartbeat()` was implemented to be called from this path. The call site is the only missing link.
- **Acceptance criterion:** After the patch, live session logs must contain at least one `Print()` line confirming `SendHeartbeat()` was reached within the first full `g_heartbeatIntervalTicks` cycle after EA start, and the backend `engine_runs` table must contain a row with `status=heartbeat` and `source=explicit_heartbeat` timestamped after the patched EA version is deployed.

### File 2: No other files require changes.

- `mt5/SMC_MarketDataEA.mq5`: `g_heartbeatIntervalTicks=48` is correct as defined. No change.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: Route and handler are correct. No change.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php`: Existing tests cover the backend path. No new tests required in this file unless UC-4 reveals a cadence problem requiring a backend-side timing adjustment.

---

## 3. Patch sequence

1. **Pre-patch verification (blocking):** Search all MT5 source files (`mt5/MarketDataEngine.mqh`, `mt5/SMC_MarketDataEA.mq5`, and all included `.mqh` files) for any invocation of `SendHeartbeat()` outside the function definition at lines 460–519. If none found, proceed. If found, stop and re-evaluate.
2. **Pre-patch verification (blocking):** Confirm `baseUrl` inside `SendHeartbeat()` (lines 460–519) references the same variable used by `SendToBackend()`, not `webhookUrl` or a hardcoded literal. If misconfigured, do not add the call site — file a separate defect for `baseUrl` misconfiguration.
3. **Pre-patch verification (blocking):** Confirm `wpUserId` is populated with a positive integer before `OnPeriodic()` can be reached. If `wpUserId` can be zero at dispatch time, the heartbeat POST will fail the auth gate even after the call site is added.
4. **Single edit:** Add the two lines (diagnostic log + `SendHeartbeat()` call) to `OnPeriodic()` in `mt5/MarketDataEngine.mqh` after the symbol loop.
5. **Recompile:** Compile the EA in MetaEditor. The patch must produce zero errors and zero warnings before deployment.
6. **Deploy and verify:** Deploy the recompiled EA, monitor live session logs for the `Print()` diagnostic, and confirm the backend `engine_runs` table receives a heartbeat row within the first `g_heartbeatIntervalTicks` cycle.

**Dependencies:**
- Steps 1–3 must complete before step 4. If any verification fails, step 4 must not proceed.
- Step 5 must complete before step 6. A compile error in step 5 blocks deployment.

**Sequencing risks:**
- No cache invalidation or database migration is required.
- No contract changes between EA and backend: the heartbeat payload schema (`user_id`, `account_id`, `terminal_id`, `broker`, `broker_server`, `ea_version`, `terminal_build`, `connected`, `timestamp`) is already implemented in `SendHeartbeat()` and expected by `post_ea_heartbeat()`. No schema drift risk.
- The 8-minute cadence means the first heartbeat will not appear in logs immediately after deploy. The verifier must wait at least one full `g_heartbeatIntervalTicks` cycle (~8 minutes at the OnTimer period) before declaring success or failure.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. Recompile the EA in MetaEditor. Zero errors, zero warnings required. Do not deploy if the compiler reports any diagnostic.
2. Run the full PHP test suite: `test-ea-heartbeat.php`, `test-ea-account-sync.php`, `test-ea-symbol-sync.php`, and `test-ea-bridge-bootstrap.php`. All must pass. These tests do not test MT5 directly but confirm the backend contract has not been disturbed.
3. Deploy the patched EA in a live session. Confirm via `Print()` log output that `OnPeriodic()` reaches the `SendHeartbeat()` call site.
4. After at least one full `g_heartbeatIntervalTicks` cycle, query the backend `engine_runs` table and confirm a row exists with `status=heartbeat`, `source=explicit_heartbeat`, and a `user_id` matching the active session.
5. Confirm account-sync and symbol-sync dispatches continue firing at their existing frequency without suppression or delay.

**Existing protections that must still hold:**

- `permission_ea_bridge()` must continue to reject requests with missing or invalid `X-EA-API-Key` and must continue to reject `user_id=0`. The PHP negative-path tests in `test-ea-heartbeat.php` cover this; they must still pass.
- The symbol-iteration loop in `OnPeriodic()` must not change in ordering, frequency, or payload.

**Parity re-validations required:**

- MT5 EA ↔ Backend: Confirm the heartbeat `POST /ea/heartbeat` returns HTTP 200 for the live session and that the `engine_runs` row is correctly written.
- Dashboard ↔ Backend: Confirm the Phase 1 intake checklist transitions the heartbeat check from FAIL to PASS after the first successful heartbeat is persisted.
- EA restart detection: Confirm that a manual EA restart produces a new heartbeat record with an updated timestamp, demonstrating the backend can distinguish restarts.

**Logging and diagnostics that must exist after the patch:**

- At minimum: one `Print()` call in `OnPeriodic()` at the heartbeat dispatch site, logging tick count, interval, and dispatch attempt.
- The existing `insert_engine_heartbeat()` error logging on the backend side must continue to fire on failure — do not suppress backend error output.

---

## 5. Non-goals

**Out of scope for this patch:**

- Refactoring `OnPeriodic()` into a dedicated `OnHeartbeatTimer()` with independent timer registration (Path B from the research report). Unnecessary scope, higher regression risk.
- Modifying `g_heartbeatIntervalTicks` or the OnTimer period. The 8-minute cadence is an existing decision. If UC-4 reveals a Phase 1 gate incompatibility, that is a separate issue requiring a separate plan.
- Adding retry logic to `SendHeartbeat()`. The function already exists; adding retry is a scope addition not supported by the current evidence.
- Modifying `SendToBackend()` or the symbol dispatch logic in any way.
- Modifying the PHP heartbeat handler, route registration, or auth gate.
- Adding new fields to the heartbeat payload. The payload is already complete.
- Adding a heartbeat call to `OnInit()` or `OnDeinit()`. These are not periodic and would create a different dispatch pattern. If startup/teardown heartbeats are needed, that is a separate feature.
- Modifying dashboard display logic, session state evaluation, or any frontend component.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not adjust `baseUrl` or `webhookUrl` handling even if UC-2 finds a discrepancy. A `baseUrl` fix is a separate defect with its own blast radius.
- Do not add heartbeat acknowledgment logic to the EA (waiting for backend response code before continuing). The existing fire-and-continue pattern used by `SendToBackend()` is correct and must be matched.
- Do not change the `engine_runs` table schema or add new columns to the heartbeat record.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

- If `baseUrl` is misconfigured (UC-2 not verified), the added call posts to a wrong endpoint, heartbeats silently fail, and the Phase 1 gate remains blocked while appearing to be wired correctly. Diagnosis becomes harder because the call site now exists.
- If an existing `SendHeartbeat()` call exists elsewhere (UC-1 not verified), the added call creates duplicate heartbeat records, potentially corrupting session state tracking and EA restart detection timestamps.
- If `wpUserId` is zero at dispatch time (UC-3 not verified), every heartbeat POST fails auth, producing repeated 401 responses and backend error log noise without any successful heartbeat record.

**User-visible failure mode:**

- Phase 1 intake checklist heartbeat check remains in FAIL state. Dashboard session health indicator shows no live keepalive. Backend cannot distinguish a running EA from a stalled one.

**Backend authority and stale-state risks:**

- If the patch is applied but verification steps are skipped and the heartbeat fails silently, the backend may enter a state where account-sync and symbol-sync records exist but no heartbeat record exists, causing the session health evaluator to mark the EA as disconnected despite active sync activity. This is a false-stale state that is harder to diagnose after the fact.
- No stale-data bypass is introduced by this patch. The heartbeat is a keepalive signal; it does not override sync data or session state decisions made by the backend.

**Human approval required before merge:** Yes.

A human must verify:
1. The diff shows only the two-line addition in `OnPeriodic()` in `mt5/MarketDataEngine.mqh` with no unintended changes.
2. The EA recompiles with zero errors and zero warnings.
3. The PHP test suite passes in full.
4. At least one live `POST /ea/heartbeat` returns HTTP 200 and is persisted to `engine_runs` with `status=heartbeat`.
5. The Phase 1 intake checklist heartbeat row transitions to PASS.

---

## 7. Test requirements

**Tests to add:**

- `mt5/tests/` (or equivalent MT5 unit test surface if one exists): A call-site presence check confirming `OnPeriodic()` contains a reference to `SendHeartbeat()`. This is a static verification guard to prevent the call site from being silently removed in future refactors.

**Existing tests that must still pass:**

- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` — all positive and negative path cases.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — full suite, no timing regressions.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` — full suite, no timing regressions.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php` — auth helper regression checks.

**Soak and live-environment verification required:**

- Soak: Allow the patched EA to run for a minimum of 3 full `g_heartbeatIntervalTicks` cycles (~24 minutes) and confirm 3 heartbeat records appear in `engine_runs` at the expected cadence. Cadence jitter of ±1 tick is acceptable.
- Parity replay: Confirm account-sync and symbol-sync record counts are unchanged across the soak period — heartbeat dispatch must not suppress or delay other dispatches.
- Restart detection: Perform one manual EA restart during the soak period and confirm a new heartbeat record appears with an updated timestamp within the first post-restart `g_heartbeatIntervalTicks` cycle.

---

## 8. Implementation handoff

**Branch naming recommendation:**

```
codex/fix-heartbeat-dispatch-missing-call-site
```

**Suggested commit grouping:**

- Commit 1: `fix(mt5): wire SendHeartbeat() call into OnPeriodic() dispatch loop` — contains only the two-line addition in `mt5/MarketDataEngine.mqh`.
- No additional commits. This patch is a single atomic change. Do not bundle unrelated cleanup or diagnostic improvements into the same commit.

**Required reports or artifacts to generate after implementation:**

- Implementation report at `reports/codex-implementation.md` confirming: (a) which pre-patch verification steps were run and their outcomes, (b) exact diff applied, (c) compile result, (d) PHP test results, (e) live heartbeat confirmation with timestamp and `engine_runs` row ID.
- Update `reports/codex-plan.md` status section to reflect implementation complete.

**State transition:**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
