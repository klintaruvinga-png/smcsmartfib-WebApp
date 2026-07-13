# SMC SuperFIB - Heartbeat Dispatch Issue Research

## 1. Issue classification

- **Severity:** CRITICAL
- **Category:** runtime-bug / wiring
- **Layer(s) affected:** MT5 EA / PHP-backend / REST-API
- **Phase impact:** Phase 1

---

## 2. Confirmed evidence

- **Backend route exists:** `POST /ea/heartbeat` is registered in [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L486) at lines 485–489 using the same auth gate (`permission_ea_bridge()`) as the passing syncs.
- **Route handler exists:** `post_ea_heartbeat()` is implemented at [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L2093) and persists heartbeat data via `insert_engine_heartbeat()` with proper payload unpacking and error logging.
- **Auth gate is correct:** `permission_ea_bridge()` validates `X-EA-API-Key` and requires a positive `user_id` — the same gate applied to `license-check` (PASS), `account-sync` (PASS), and `symbol-sync` (PASS).
- **MT5 SendHeartbeat() function exists:** Implemented in [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh#L460) at lines 460–519, correctly builds JSON payload with `user_id`, `account_id`, `terminal_id`, `broker`, `broker_server`, `ea_version`, `terminal_build`, `connected`, and `timestamp` fields, and POSTs to `baseUrl + "/ea/heartbeat"`.
- **g_heartbeatIntervalTicks defined:** Set to 48 in [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5#L44) (~8-minute cadence based on OnTimer period).
- **OnPeriodic() fires and calls SendToBackend():** Confirmed at [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh#L139) where the function dispatches symbol snapshots to backend every cycle. Account-sync, symbol-sync, and market-stream PASS signals confirm the timer path is healthy.
- **OnPeriodic() does NOT call SendHeartbeat():** Inspection of [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh#L140-L142) shows OnPeriodic() loops through symbols and calls `SendToBackend()` for each, then returns. No `SendHeartbeat()` invocation exists in this path.
- **PHP tests confirm auth path is correct:** [wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php](wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php) validates that a well-formed heartbeat POST with valid API key and positive `user_id` returns HTTP 200 and correctly persists to `engine_runs` table with `status=heartbeat` and `source=explicit_heartbeat`.

---

## 3. Root cause hypothesis

**Primary (Confirmed):** `OnPeriodic()` does not call `SendHeartbeat()`.
- **Why it fits:** OnPeriodic() is the only periodic dispatch mechanism confirmed working for account-sync, symbol-sync, and market-stream. The function exists, the route exists, the auth is correct, but the call site is missing. Zero heartbeat dispatches across multiple live cycles matches exactly the symptom of an absent call.
- **Likely trigger:** A refactor that extracted `SendToBackend()` into an iterator pattern or a deliberate omission during initial scaffolding of the heartbeat handler before wiring the MT5 side.

**Secondary (Hypothesis – must verify before patching):**
- Whether `OnTimer()` or `OnInit()` or `OnDeinit()` is independently responsible for heartbeat dispatch and the periodic path is intentionally unused. If so, the root cause differs and this patch would be incomplete or incorrect.
- Whether `baseUrl` in SendHeartbeat() is using the wrong variable or has been reassigned to a non-REST endpoint. If `baseUrl` is misconfigured, adding the call will POST to the wrong place, masking a configuration defect.

---

## 4. Blast radius

**EA-side files:**
- [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh) — SendHeartbeat() exists but never invoked; OnPeriodic() must call it.
- [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5) — g_heartbeatIntervalTicks defined but throttling logic not exercised because SendHeartbeat() is unreachable.

**Backend files:**
- [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php) — heartbeat route and handler are present and correct; no changes required.
- [wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php](wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php) — positive-path test exists and validates auth contract.

**Parity surfaces at risk:**
- MT5 EA ↔ Backend session health tracking: heartbeat is the keepalive signal confirming the EA terminal is alive. Without it, backend cannot distinguish a stalled/crashed EA from a live one.
- Dashboard ↔ Backend truth boundary: Phase 1 validation gate depends on heartbeat PASS to confirm live session state. False LIVE state if heartbeat never fires.
- EA restart detection: backend uses heartbeat timestamps to detect EA crashes and restarts; missing heartbeats hide restart events.

**Stale-state risks:**
- Backend may mark a session as stale (no heartbeat) shortly after account-sync and symbol-sync, creating a race condition where setup completes but heartbeat never follows.
- Dashboard may display live status incorrectly if heartbeat is missing but account/symbol sync provided stale session data.

---

## 5. Regression surface

**Currently working behavior that must not break:**
- `OnPeriodic()` must continue firing and dispatching symbols to `SendToBackend()` in the same order and frequency.
- `SendToBackend()` logic and symbol iteration must not be altered.
- `permission_ea_bridge()` auth contract must remain unchanged — `X-EA-API-Key` validation and positive `user_id` requirement must not be relaxed.
- Account-sync and symbol-sync dispatch must not be suppressed or delayed by the addition of heartbeat dispatch.
- `baseUrl` derivation and webhook URL handling must not be altered.

**Existing guards:**
- [wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php](wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php) provides the auth validation helper `permission_ea_bridge()` exercised by existing tests.
- PHP tests validate missing `user_id`, zero `user_id`, and missing API key all fail safely — these must still pass after any edits.
- MT5 compiler will catch any syntax errors in the new call site.

**Tests covering this area:**
- [wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php](wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php) — positive and negative path tests for the heartbeat route.
- [wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php) — account-sync regression checks to ensure symbol dispatch timing is not affected.
- [wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php) — symbol-sync regression checks.

---

## 6. Resolution path options

**Path A (Narrowest):** Add `SendHeartbeat()` call at the end of `OnPeriodic()` after the symbol loop completes, with an accompanying diagnostic log line.
- **Surface:** One edit in [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh), OnPeriodic() method body (2 lines: log + call).
- **Safety:** Low risk — no logic changes, no payload modifications, no auth contract alterations.
- **Why recommended:** The function exists, the route exists, the auth is correct. Only the call site is missing. Adding it unblocks the heartbeat path and allows the backend to receive keepalive signals as designed.

**Path B (Broader – unnecessary scope):** Refactor OnPeriodic() to use a dedicated `OnHeartbeatTimer()` handler with independent timer registration, using `g_heartbeatTickCount` and `g_heartbeatIntervalTicks` explicitly.
- **Surface:** Multi-file changes: MarketDataEngine.mqh + SMC_MarketDataEA.mq5.
- **Safety:** Medium risk — introduces new timer scheduling logic and potential race conditions between the periodic and heartbeat timers.
- **Why not recommended:** The existing OnPeriodic() dispatch path is already proven working for account-sync and symbol-sync. Creating a parallel timer is unnecessary scope creep with higher regression risk.

**Recommended:** Path A. The narrowest correction surface is safest and unblocks Phase 1 immediately.

---

## 7. Risk flags

- **High-risk system involved:** Yes. Session health tracking and live state determination are critical to Phase 1 validation and dashboard authority.
- **Requires parity re-validation:** Yes. MT5 EA ↔ Backend heartbeat contract must be validated post-patch: backend must correctly persist heartbeat records after the POST is dispatched.
- **Migration-blocking:** Yes. Phase 1 live validation gate is blocked until heartbeat fires.
- **Human review required before merge:** Yes. The heartbeat path affects session state tracking. A human must verify (a) the live `POST /ea/heartbeat` transitions to PASS in the intake checklist, (b) the EA recompiles with zero errors/warnings, (c) PHP tests pass, and (d) the diff shows only the expected call site addition without unintended side effects.

---

## 8. Handoff package

**Epicentre files to inspect first:**
- [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh#L139-L142) — OnPeriodic() method to see the exact location where SendHeartbeat() must be called.
- [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh#L460-L519) — SendHeartbeat() function to confirm payload and baseUrl usage.
- [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5#L44) — g_heartbeatIntervalTicks definition to understand throttling expectations.

**Inputs Codex must verify before planning:**
1. Search [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh), [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5), and all included `.mqh` files for any existing call to `SendHeartbeat()` outside the function definition itself. If found, stop and re-evaluate; the root cause differs.
2. Confirm `SendHeartbeat()` references `baseUrl` (not `webhookUrl` or a hardcoded string) and that `baseUrl` is derived correctly from the webhook URL passed to Initialize().
3. Confirm `wpUserId` is set correctly when Initialize() is called, so the heartbeat payload will contain a valid `user_id`.

**Open unknowns that could invalidate the current hypothesis:**
- Whether `OnTimer()`, `OnInit()`, or `OnDeinit()` is independently calling `SendHeartbeat()` and the periodic path is intentionally unused (must verify in step 1 above).
- Whether `baseUrl` is misconfigured or pointing to a non-REST endpoint (must verify in step 2 above).
- Whether the 8-minute cadence (g_heartbeatIntervalTicks=48) is compatible with Phase 1 validation expectations or if a faster/slower interval is required (affects acceptance criterion).
