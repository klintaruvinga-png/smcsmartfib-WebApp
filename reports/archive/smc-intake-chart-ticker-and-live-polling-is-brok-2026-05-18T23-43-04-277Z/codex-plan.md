# SMC SuperFIB - Implementation Plan: Chart Live Polling Restoration

## 1. Issue validation

### Confirmed

**Root cause A — `OnPeriodic()` never calls `SendHeartbeat()`**
The research confirms: `SendHeartbeat()` exists in `mt5/MarketDataEngine.mqh` at lines 460–519, the backend route `POST /ea/heartbeat` is registered and passes auth, PHP tests confirm the handler persists correctly, and `g_heartbeatIntervalTicks = 48` is defined. Yet `OnPeriodic()` (lines 140–142) terminates after the symbol loop with no call to `SendHeartbeat()`. Zero heartbeat dispatches across multiple confirmed live cycles is consistent only with an absent call site, not a broken route or auth failure. This is the confirmed root cause of the session-health gap.

**Root cause B — `useBackendReady()` stays false, disabling polling**
The research confirms `usePollMs()` returns `null` and polling is intentionally disabled when `useBackendReady()` is false. Backend session health tracking depends on receiving heartbeats. Without heartbeat, the backend cannot confirm a live session, which propagates to the frontend state gate that governs `refetchInterval`. This is the direct bridge between the MT5 omission and the chart live-update failure.

**Root cause C — `usePollMs()` blocks on `user-settings` load**
The research confirms `usePollMs()` returns `null` until the `user-settings` query resolves. This is a confirmed intentional guard, but it is a secondary blocking condition: even after settings load, polling remains disabled until `useBackendReady()` is satisfied. Fixing the heartbeat dispatch is the prerequisite.

### Likely

**Vite transform error on `src/routes/charts.tsx`**
The research cites `.codex-vite-dev.err.log` entries referencing the charts route. The exact error text is not provided and the file content has not been inspected for syntax correctness. This is a likely contributing failure in development environments. It cannot be scoped for patch until the exact error is known. It is likely a dev-environment-only issue that does not block the heartbeat fix.

### Unconfirmed

**`VITE_SNIPER_MOCK_MODE` is active in the live environment**
The research identifies this as a possible cause of frozen ticks. No evidence of the environment variable being set in production or staging is provided. This is a checklist item, not a root cause, until verified via `.env` files or deployment config.

**`baseUrl` misconfiguration in `SendHeartbeat()`**
The research flags this as an open unknown. The function exists and is coded correctly, but whether `baseUrl` resolves to the correct REST endpoint at runtime has not been verified from a live run log. Must be confirmed before patching.

**`backendUrl` not configured in the app (Account settings)**
If `Account → backendUrl` is empty or incorrect, `useBackendReady()` would be false independent of heartbeat. The research mentions this as a triage step, not a confirmed finding.

---

## 2. Implementation contract

### File 1: `mt5/MarketDataEngine.mqh`

- **Function to modify:** `OnPeriodic()` — the method body, immediately after the symbol loop terminates and before the function returns.
- **Exact change required:** Insert two lines:
  1. A `Print()` diagnostic log: `Print("[Heartbeat] Dispatching heartbeat via OnPeriodic");`
  2. An unconditional call: `SendHeartbeat();`
  The call is unconditional on first pass; throttle logic via `g_heartbeatIntervalTicks` is already inside `SendHeartbeat()` itself and must not be duplicated here.
- **Guard rails — what must not change:**
  - The symbol iteration loop and its order must not be altered.
  - `SendToBackend()` call sites and their arguments must not be modified.
  - `baseUrl`, `webhookUrl`, and `wpUserId` variable assignments upstream of `OnPeriodic()` must not be touched.
  - No new class members, no new timer registrations, no changes to `OnTimer()`, `OnInit()`, or `OnDeinit()`.
  - The two inserted lines are the complete scope of this change.
- **Why this file is in scope:** It is the only file with a confirmed missing call site. The function, route, auth, and payload are all proven correct. Only the invocation is absent.
- **Acceptance criterion:** After recompile and EA restart, at least one `POST /ea/heartbeat` returns HTTP 200 within the first two `OnPeriodic()` cycles. Backend `engine_runs` table gains a row with `status=heartbeat` and `source=explicit_heartbeat`. The Print log line appears in the MT5 journal.

### File 2: `mt5/SMC_MarketDataEA.mq5`

- **No change required in this file for this patch.**
- `g_heartbeatIntervalTicks = 48` is already defined. The throttling logic inside `SendHeartbeat()` consumes it. Adding the call to `OnPeriodic()` is sufficient.

### File 3: `src/routes/charts.tsx` — DEFERRED

- **Not in implementation scope for this patch.**
- The research does not provide the exact transform error text, line number, or root cause. Without that, any edit to this file is speculative.
- **Required pre-condition before this file can be scoped:** The exact Vite transform error must be extracted from `.codex-vite-dev.err.log` and diagnosed independently. If the error is a missing import, a JSX syntax issue, or a plugin misconfiguration, it requires a separate focused patch.

### File 4: `src/hooks/useSniperData.ts` — NO CHANGE

- The `useBackendReady()` and `usePollMs()` logic is confirmed correct by design. Polling is intentionally gated. The gate will unlock once the backend receives heartbeats and reflects a live session. Do not alter the polling guards.

### File 5: `src/lib/api/sniperClient.ts` — NO CHANGE

- `MOCK_MODE` behavior is correctly implemented. The fix is to verify the environment variable, not to change the code.

---

## 3. Patch sequence

1. **Pre-patch verification (blocking — must complete before any edit):**
   - Search `mt5/MarketDataEngine.mqh`, `mt5/SMC_MarketDataEA.mq5`, and all `#include`-d `.mqh` files for any existing call to `SendHeartbeat()` outside the function definition. If a call is found, stop. The root cause differs and this plan is invalidated.
   - Confirm `SendHeartbeat()` uses `baseUrl` (not `webhookUrl` or a hardcoded string). If it uses a different variable, escalate before patching.
   - Confirm `wpUserId` is a positive integer at the point `Initialize()` is called. If zero or empty, the heartbeat will be rejected by `permission_ea_bridge()` and the fix will silently fail.

2. **Apply `mt5/MarketDataEngine.mqh` edit** — two-line addition at the tail of `OnPeriodic()`.

3. **Recompile MT5 EA** — confirm zero errors, zero warnings from the MQL5 compiler.

4. **Deploy updated EA to terminal** — restart EA on the live/staging account.

5. **Observe backend `engine_runs` table** — confirm `status=heartbeat` row appears within two `OnPeriodic()` cycles (~16 minutes at 48-tick cadence, or sooner if timer interval is shorter than assumed).

6. **Verify `useBackendReady()` transitions to true** — confirm the frontend polling interval becomes non-null and chart data refreshes.

7. **Vite transform error (separate, deferred patch)** — after the above is confirmed, extract the exact transform error from `.codex-vite-dev.err.log` and scope a second patch against `src/routes/charts.tsx` if the error is real and reproducible.

**Dependencies:**
- Step 5 depends on steps 2–4.
- Step 6 depends on step 5 and on `backendUrl` being correctly configured in the app.
- Step 7 has no dependency on steps 2–6 and can proceed in parallel if development velocity requires it.

**Sequencing risks:**
- If `g_heartbeatIntervalTicks = 48` yields an ~8-minute cadence and the acceptance criterion requires verification within two cycles, plan for up to 16 minutes of observation after EA restart.
- If the backend session-health query is cached on the frontend, the dashboard may not reflect the new heartbeat immediately. A hard refresh or cache invalidation may be required to observe the polling gate unlock.

---

## 4. Regression guards

**After patching, the implementation agent must confirm:**

1. `OnPeriodic()` continues dispatching all symbols via `SendToBackend()` at the same frequency as before. Confirm MT5 journal shows symbol dispatch logs interleaved with the new heartbeat log.
2. Account-sync and symbol-sync PHP test suites pass without modification: `test-ea-account-sync.php`, `test-ea-symbol-sync.php`.
3. Heartbeat PHP tests pass: `test-ea-heartbeat.php` — both positive path and all negative paths (missing `user_id`, zero `user_id`, missing API key).
4. `permission_ea_bridge()` auth contract is unchanged — `X-EA-API-Key` validation still enforced on the heartbeat route.
5. Backend `engine_runs` table gains exactly one `status=heartbeat` row per heartbeat cycle (no duplicate insertion, no schema corruption).
6. MT5 compiler output: zero errors, zero warnings after the two-line addition.
7. The new `Print()` log line appears in the MT5 journal and does not reveal sensitive data (API keys, account numbers).

**Existing protections that must still hold:**
- `useBackendReady()` and `usePollMs()` guards remain in place. Polling must not start unless backend signals a live session.
- `MOCK_MODE` override remains functional — if `VITE_SNIPER_MOCK_MODE=true`, static data must still be returned (do not remove this path).
- `permission_ea_bridge()` negative-path rejections must not be relaxed.

**Parity re-validation required:**
- MT5 EA → Backend: confirm `POST /ea/heartbeat` returns HTTP 200 with a valid `user_id` and expected payload fields.
- Backend → Dashboard: confirm that after heartbeat is received, the session health state propagates correctly and `useBackendReady()` reflects true within one polling cycle.

**Diagnostics that must exist after the patch:**
- MT5 journal: `[Heartbeat] Dispatching heartbeat via OnPeriodic` log line.
- Backend: heartbeat row in `engine_runs` with `status=heartbeat`, `source=explicit_heartbeat`, correct `user_id`, and a fresh `timestamp`.

---

## 5. Non-goals

- Refactoring `OnPeriodic()` to use a dedicated `OnHeartbeatTimer()` with independent timer registration — unnecessary scope, higher regression risk, explicitly rejected by the research report as Path B.
- Changing `g_heartbeatIntervalTicks` — the 8-minute cadence is the existing design. Do not alter unless Phase 1 requirements explicitly specify a different interval (they do not at present).
- Modifying `SendHeartbeat()` payload fields — the payload is correct. Do not add, remove, or rename fields.
- Altering `useBackendReady()` or `usePollMs()` logic — the frontend polling gate is correct by design. Do not bypass or weaken it.
- Fixing the Vite transform error on `src/routes/charts.tsx` in this patch — deferred pending exact error identification.
- Adding heartbeat retry logic to the MT5 side — not in scope, no evidence of retry failures.
- Modifying the WordPress plugin PHP route or handler — confirmed correct, no changes required.
- Adding new PHP tests for edge cases not covered by the existing test suite — out of scope for this patch.
- Resolving the `VITE_SNIPER_MOCK_MODE` environment variable in deployment config — out of scope; this is an environment audit, not a code change.
- Investigating `backendUrl` configuration in the app Account settings — out of scope; this is an operational check, not a code change.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
If `baseUrl` is misconfigured at the point `SendHeartbeat()` is called, the added call will POST to a wrong or null endpoint. This will generate HTTP errors in the MT5 journal, fail silently on the backend, and leave the dashboard in the same broken state while obscuring the real configuration defect. The pre-patch verification step (confirming `baseUrl` before editing) is the primary guard against this.

**User-visible failure mode:**
If the heartbeat call is added but `wpUserId` is zero at runtime, `permission_ea_bridge()` will reject every heartbeat POST with a 401/403. Charts will remain non-live and the MT5 journal will show repeated auth failures. This is recoverable: the EA logs will surface it clearly. No data loss occurs.

**Backend authority and stale-state risks:**
The backend `engine_runs` table could receive duplicate heartbeat rows if the throttle logic inside `SendHeartbeat()` malfunctions or if the EA is restarted repeatedly during testing. This is a low risk — the table is append-only and the handler does not enforce uniqueness constraints on heartbeat rows. Spurious rows are noise, not corruption.

**Dashboard authority risk:**
Once heartbeat fires and `useBackendReady()` transitions to true, the frontend polling gate will unlock. If the backend API endpoint `/sniper/v1/charts` is not returning fresh data (separate issue), the dashboard will begin polling but display stale or empty candles. This would surface the Vite/API issue as the next failure layer, which is the correct triage sequence.

**Human approval required before merge:** Yes. The heartbeat path directly affects session health state and Phase 1 live validation gate. A human must verify:
- (a) The MT5 diff shows exactly two inserted lines and no other changes.
- (b) EA recompiles with zero errors and zero warnings.
- (c) At least one `POST /ea/heartbeat` returns HTTP 200 in a live or staging environment.
- (d) PHP test suite passes.
- (e) The Phase 1 heartbeat intake check transitions to PASS.

---

## 7. Test requirements

**Tests to add:**

None required for the two-line MT5 change. The existing PHP test suite already covers the heartbeat route's auth contract and persistence path. Adding a unit test for `OnPeriodic()` calling `SendHeartbeat()` would require MQL5 test infrastructure that does not currently exist in the repository.

**Existing tests that must still pass:**

- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` — all positive and negative path cases.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — no regression in account-sync timing or payload.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` — no regression in symbol-sync timing or payload.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php` — auth helper contract unchanged.

**Manual checks required:**

1. After EA restart on staging: observe MT5 journal for `[Heartbeat] Dispatching heartbeat via OnPeriodic` within the first two `OnPeriodic()` cycles.
2. Confirm backend `engine_runs` table row with `status=heartbeat` and `source=explicit_heartbeat`.
3. Confirm Phase 1 intake checklist heartbeat item transitions to PASS.
4. Confirm frontend `useBackendReady()` is true and `usePollMs()` returns a non-null interval after heartbeat is received.
5. Confirm charts begin live-updating price ticks after polling gate unlocks.

**Soak / parity verification:**

Run the EA for at least two full `g_heartbeatIntervalTicks` cycles (~16 minutes) and confirm at least two heartbeat rows appear in `engine_runs` with increasing timestamps and no gaps. This validates throttle logic and confirms the call site is not one-shot.

---

## 8. Implementation handoff

**Branch naming recommendation:**
`fix/heartbeat-dispatch-wiring`

**Suggested commit grouping:**

- Commit 1: `fix(mt5): wire SendHeartbeat() call into OnPeriodic() dispatch path`
  - Scope: `mt5/MarketDataEngine.mqh` only, two-line addition.

No additional commits required for this patch. The Vite transform error, if confirmed, belongs in a separate branch and commit.

**Required artifacts to generate after implementation:**

- MT5 compiler output log confirming zero errors and zero warnings.
- MT5 journal excerpt showing `[Heartbeat] Dispatching heartbeat via OnPeriodic` and the HTTP response line from `SendHeartbeat()`.
- Backend `engine_runs` table query result showing at least one row with `status=heartbeat`, `source=explicit_heartbeat`, valid `user_id`, and timestamp within the observation window.
- PHP test suite run output confirming all heartbeat and sync tests pass.
- Phase 1 intake checklist screenshot or log showing heartbeat item as PASS.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
