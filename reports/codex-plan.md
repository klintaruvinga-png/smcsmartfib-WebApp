# SMC SuperFIB - Hardened Implementation Contract

## 1. Issue validation

### Confirmed

**`OnPeriodic()` does not call `SendHeartbeat()`.** Code inspection at `mt5/MarketDataEngine.mqh:139–142` confirms the function iterates symbols, dispatches each via `SendToBackend()`, and returns. No `SendHeartbeat()` invocation exists anywhere in that path. `SendHeartbeat()` exists at `mt5/MarketDataEngine.mqh:460–519`. The backend route (`POST /ea/heartbeat`, `smc-superfib-sniper.php:485–489`), the route handler (`post_ea_heartbeat()`, line 2093), and the auth gate (`permission_ea_bridge()`) are all correct and already validated by PHP tests. Zero heartbeat dispatches across multiple live cycles is exactly the symptom of a missing call site. This is the root cause.

**Backend and auth contract are correct.** `permission_ea_bridge()`, `post_ea_heartbeat()`, and `insert_engine_heartbeat()` require no changes.

### Likely

**PR #197 cadence patches are not yet compiled into the running EA binary.** Runtime context confirms the deployed EA still reflects pre-PR #197 source. Any acceptance test must target a freshly recompiled binary built from the current main-branch source tree, not the running binary. The `g_heartbeatIntervalTicks` value in the repo after PR #197 may differ from 48; the acceptance criterion interval must match the post-PR #197 value, not the old value.

### Unconfirmed — must verify before any code change

1. **No suppressed or guarded `SendHeartbeat()` call exists outside the function definition.** The research report did not search `OnTimer()`, `OnInit()`, `OnDeinit()`, or any `#include`d `.mqh` files for an existing but disabled call path. If one exists, the root cause is a suppressed call, not a missing one, and this plan must be re-evaluated before patching.
2. **`baseUrl` is correct inside `SendHeartbeat()`.** The research asserts but does not confirm that `SendHeartbeat()` references `baseUrl` and not `webhookUrl` or a hardcoded string. A misconfigured base URL means the call fires but POSTs to the wrong endpoint — a silent failure harder to diagnose than the current state.
3. **`wpUserId` is non-zero at `OnPeriodic()` call time.** If `wpUserId` is zero when `OnPeriodic()` fires, `permission_ea_bridge()` will reject every heartbeat POST regardless of this fix.
4. **Throttle guard location.** Whether the `g_heartbeatTickCount` / `g_heartbeatIntervalTicks` guard lives inside `SendHeartbeat()` or must be added at the call site. This determines the exact form of the edit.

**Rejected hypotheses:**

Path B (dedicated heartbeat timer, multi-file refactor) — Rejected. `OnPeriodic()` is confirmed working for three of four dispatch types. A parallel timer adds scheduling complexity and regression risk with no correctness benefit over a single call-site addition.

---

## 2. Implementation contract

### File: `mt5/MarketDataEngine.mqh`

**Function / section to modify:** `OnPeriodic()` — the section immediately after the symbol iteration loop closes and before any return statement or end of function body.

**Exact change required:**

Add the `SendHeartbeat()` dispatch at the end of `OnPeriodic()`. The exact form depends on throttle guard location, which must be verified in the precondition step:

*If `SendHeartbeat()` does not contain an internal throttle guard:*
```mql5
g_heartbeatTickCount++;
if(g_heartbeatTickCount >= g_heartbeatIntervalTicks)
{
    g_heartbeatTickCount = 0;
    Print("[MarketDataEngine] OnPeriodic: dispatching heartbeat");
    SendHeartbeat();
}
```

*If `SendHeartbeat()` already implements an internal throttle guard:*
```mql5
Print("[MarketDataEngine] OnPeriodic: dispatching heartbeat candidate");
SendHeartbeat();
```

The diagnostic `Print` line is required in both forms. It is the only observable confirmation of dispatch before backend receipt is verified.

**Guard rails — what must not change:**

- The symbol iteration loop body and all `SendToBackend()` calls: unmodified.
- `baseUrl`, `webhookUrl`, `wpUserId`, `g_accountId`, `g_terminalId` derivation: unmodified.
- `SendHeartbeat()` function body: unmodified.
- `OnTimer()`, `OnInit()`, `OnDeinit()`: unmodified.
- `OnPeriodic()` function signature: unmodified.
- The order and timing of existing dispatch calls: unmodified.

**Why this file is in scope:**

`mt5/MarketDataEngine.mqh` is the sole file that defines `OnPeriodic()` and the sole location where the missing call site must be added. No other file is in scope unless precondition verification step 4 reveals the throttle variables require initialization changes in `mt5/SMC_MarketDataEA.mq5`.

**Acceptance criterion tied to the failure path:**

Within one heartbeat interval of the patched EA attaching to a chart, the backend `engine_runs` table must contain a new row with `status=heartbeat`, `source=explicit_heartbeat`, and a non-zero `user_id`. The live Phase 1 intake checklist must show `POST /ea/heartbeat` as PASS.

---

## 3. Patch sequence

**1. Precondition verification (blocking — no code change until all five pass):**

a. Search `mt5/MarketDataEngine.mqh`, `mt5/SMC_MarketDataEA.mq5`, and every `#include`d `.mqh` file for any call to `SendHeartbeat()` outside its own function definition. If found, stop and re-evaluate the root cause before proceeding.

b. Inspect `SendHeartbeat()` at `mt5/MarketDataEngine.mqh:460–519` and confirm it references `baseUrl` (not `webhookUrl` or any hardcoded string).

c. Confirm `wpUserId` is set to a positive value before `OnPeriodic()` is first invoked. Trace the initialization path from `OnInit()` through `Initialize()`.

d. Confirm the current main-branch value of `g_heartbeatIntervalTicks` after PR #197.

e. Confirm whether the throttle guard (`g_heartbeatTickCount` / `g_heartbeatIntervalTicks`) is internal to `SendHeartbeat()` or absent from the function body, to determine the exact form of the call-site addition.

**2. Single edit to `mt5/MarketDataEngine.mqh`:** Apply the call-site addition as specified in section 2, using the form dictated by precondition step 5.

**3. Recompile in MetaEditor.** Zero errors, zero warnings required before proceeding.

**4. Deploy recompiled EA to MT5 terminal.** Attach to chart and allow at least one full heartbeat interval to elapse.

**5. Verify backend receipt** via `engine_runs` table query or the live intake checklist.

**Sequencing dependencies:**

- Step 2 depends on step 1 completing without invalidating the hypothesis. If step 1a finds an existing call site, the plan is invalid and must be reissued.
- Steps 3–5 depend on step 2 producing a clean compile.
- This patch must be applied against the current main-branch source (which includes PR #197 changes), not against the pre-PR #197 source tree or the running EA binary.

**No migration, cache, or schema sequencing risk.** The backend table and route already exist. No database changes are required.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. MT5 MetaEditor compile: zero errors, zero warnings. Record the output.
2. PHP test suite: `test-ea-heartbeat.php`, `test-ea-account-sync.php`, `test-ea-symbol-sync.php`, and `test-ea-bridge-bootstrap.php` must all pass without modification to the test files.
3. Live EA attach: `account-sync`, `symbol-sync`, and `market-stream` PASS signals must continue firing at their existing cadence. Confirm no delays or gaps in symbol dispatch introduced by the heartbeat call.
4. `engine_runs` table: confirm a new row with `status=heartbeat`, `source=explicit_heartbeat`, and a non-zero `user_id` within one heartbeat interval of EA attach.
5. Phase 1 intake checklist: `POST /ea/heartbeat` must transition from FAIL to PASS.

**Existing protections that must still hold:**

- `permission_ea_bridge()` auth rejections for missing `X-EA-API-Key`, zero `user_id`, and invalid key must continue returning auth failure.
- `SendToBackend()` call count per `OnPeriodic()` cycle must be unchanged.
- Symbol dispatch order and frequency must be unchanged.

**Parity re-validations required:**

- MT5 EA ↔ Backend heartbeat contract: verify `engine_runs` persisted fields match the payload fields defined in `SendHeartbeat()` — `user_id`, `account_id`, `terminal_id`, `broker`, `broker_server`, `ea_version`, `terminal_build`, `connected`, `timestamp`.
- Dashboard ↔ Backend truth boundary: after heartbeat fires, confirm the dashboard live-session indicator reflects backend-sourced PASS state. Confirm the dashboard is not inferring session state from account-sync or symbol-sync data in the absence of a heartbeat record.

**Logging that must exist after the patch:**

The `Print("[MarketDataEngine] OnPeriodic: dispatching heartbeat")` line (or equivalent) must appear in the MT5 Experts log at each heartbeat dispatch cycle. This is the primary observable confirming the call site is reached before backend receipt is verified.

---

## 5. Non-goals

**Out of scope for this patch:**

- Any change to `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — the route, handler, and auth gate are correct.
- Any change to `mt5/SMC_MarketDataEA.mq5` unless precondition 1e reveals throttle variable initialization must be moved there.
- Any change to `SendHeartbeat()` function body.
- Any change to `OnTimer()`, `OnInit()`, or `OnDeinit()`.
- Changing `g_heartbeatIntervalTicks` — its value after PR #197 stands; this patch does not revisit the cadence decision.
- Adding a dedicated heartbeat timer or any parallel dispatch path (Path B).
- Dashboard UI changes.
- Pine Script changes.
- Backend schema migrations.
- Modifying any existing PHP test files.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- **Do not refactor `OnPeriodic()` into sub-dispatchers.** The function correctly handles three dispatch types. Refactoring working paths while adding the missing one widens the diff surface and introduces regression risk that is not justified by the fix.
- **Do not alter heartbeat payload fields.** The payload in `SendHeartbeat()` matches the backend's `insert_engine_heartbeat()` unpacking contract. Any field change would silently break persistence without a compile error.
- **Do not add retry logic or error escalation to the heartbeat call.** Fire-and-forget is consistent with the existing account-sync and symbol-sync dispatch pattern. Retry logic is a separate concern and a separate patch.
- **Do not combine this patch with any other open issue.** The diff must be atomic: one missing call site, one file, one commit.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If precondition 1b is skipped and `baseUrl` is misconfigured, `SendHeartbeat()` will begin POSTing to the wrong endpoint. MT5 may log an HTTP non-200 response silently depending on existing error handling. The heartbeat will still not reach the backend. The intake checklist will remain FAIL. This is a silent failure that is harder to diagnose than the current absent call-site state because the dispatch path will appear wired in code review but produce no backend result.

**User-visible failure mode:**

If `wpUserId` is zero at call time (precondition 1c skipped), `permission_ea_bridge()` will reject every heartbeat POST with an auth failure. The intake checklist `POST /ea/heartbeat` remains FAIL. Phase 1 validation gate remains blocked. From the user's perspective, the patch appears to have had no effect.

**Backend authority and stale-state risks:**

- If the `connected` field in the heartbeat payload is incorrectly `false` at dispatch time, the backend will persist heartbeat records but may interpret the EA as disconnected. Session health tracking behavior under `connected=false` heartbeats must be verified before declaring PASS.
- No stale-state risk introduced by the patch itself. The change adds a new dispatch that did not previously exist; it does not modify any existing dispatch path or any cached or persisted state.

**Backend authority preservation:**

The backend remains the single source of session state truth. This patch adds a dispatch call in the EA. It does not alter the frontend, does not change how the dashboard reads session state, and does not introduce any client-side session inference. The MT5 ↔ Backend authority boundary is preserved.

**Human approval required before merge:** Yes.

A human must verify: (a) the EA recompiles with zero errors and zero warnings, (b) the PHP test suite passes without test file modifications, (c) the live `POST /ea/heartbeat` intake check transitions to PASS in a real terminal session, and (d) the diff is confined to the addition of the call site in `mt5/MarketDataEngine.mqh` with no unintended side effects.

---

## 7. Test requirements

**Tests to add:**

- **MT5 Experts log manual check:** After recompile and EA attach, confirm the `[MarketDataEngine] OnPeriodic: dispatching heartbeat` print line appears in the Experts log within one heartbeat interval. Confirm the line appears at the expected interval cadence and not on every tick (throttle guard is functioning).

**Tests that must still pass without modification:**

- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` — all positive and negative path assertions, including missing API key, zero `user_id`, and malformed payload rejections.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — all assertions; confirms symbol dispatch timing is not degraded.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` — all assertions.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php` — auth contract assertions.

**Live-environment verification required:**

1. Attach the patched and recompiled EA to a chart in a live MT5 terminal.
2. Wait one full heartbeat interval (verify the interval against post-PR #197 `g_heartbeatIntervalTicks` value, not 48 if PR #197 changed it).
3. Query `engine_runs` table: confirm a row exists with `status=heartbeat`, `source=explicit_heartbeat`, a non-zero `user_id`, and a timestamp within the expected interval window.
4. Confirm `account-sync` and `symbol-sync` rows continue appearing at unchanged cadence in the same `engine_runs` table (no regression in symbol dispatch).
5. Confirm the Phase 1 intake checklist `POST /ea/heartbeat` row shows PASS.

No soak or replay testing is required for this patch. The change surface is a single call-site addition with no state machine, persistence logic, or scheduling change.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`fix/heartbeat-dispatch-missing-call-site`

**Suggested commit grouping:**

Single commit. The patch is one logical change — one call site addition in one file. Do not split across commits.

Suggested commit message:
```
fix(mt5): wire SendHeartbeat() into OnPeriodic() dispatch loop

OnPeriodic() dispatched account-sync, symbol-sync, and market-stream
but never called SendHeartbeat(). The function, backend route, and auth
gate all existed; only the call site was missing. Adds the call with a
throttle guard (if not internal to SendHeartbeat()) and a diagnostic
Print line confirming dispatch in the MT5 Experts log.
```

**Required reports or artifacts to generate after implementation:**

- MetaEditor compile output showing zero errors and zero warnings.
- MT5 Experts log snippet showing the heartbeat dispatch print line at the expected cadence.
- `engine_runs` table query result showing the first heartbeat row post-patch with all required fields populated.
- PHP test run output showing all four test files pass.
- Phase 1 intake checklist screenshot or log showing `POST /ea/heartbeat` as PASS.

**State transition required after plan handoff:**

`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
