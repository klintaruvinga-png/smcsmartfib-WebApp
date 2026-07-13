### 1. Issue classification
- Severity: HIGH
- Category: stale-data
- Layer(s) affected: Dashboard-JS / REST-API / PHP-backend (potential) / MT5 (potential)
- Phase impact: Phase 0

### 2. Confirmed evidence
- Repo log files show transform/build errors referencing UI routes: `.codex-vite-dev.err.log` contains repeated errors transforming `src/routes/live.tsx` and `src/routes/charts.tsx` (see log lines mentioning `Unexpected token` and HMR reloads).
- Frontend routing/components: `src/routes/live.tsx` and `src/routes/charts.tsx` implement live radar and charts and directly reference polling hooks and chart snapshot queries.
- Polling and enablement logic: `src/hooks/useSniperData.ts` exports `usePollMs()`, `useSnapshot()`, and related hooks. `usePollMs()` returns `null` when user settings haven't loaded; `useSnapshot()` and other queries only enable when `backendReady && pollMs !== null`.
- Chart snapshot endpoint and API client: `src/lib/api/sniperClient.ts` exposes `apiClient.getSnapshot()` and `apiClient.getChartSnapshot(...)` used by the above hooks.
- UI streaming logic: `src/hooks/useStreamingTicks.ts` implements sub-tick streaming that depends on a regular poll cadence (`pollMsHint`) to schedule intermediate ticks.

### 3. Root cause hypothesis
- Most likely root cause: frontend polling is being gated off by `usePollMs()`/`backendReady` guards, causing no active refetch intervals when user settings or backend readiness are not present. (Confirmed: `usePollMs()` and `useSnapshot()` code in `src/hooks/useSniperData.ts`.)
- Why this fits: charts and live radar both rely on React-Query `refetchInterval` + enabled guards; if `pollMs` is `null` or `backendReady` is false, the queries are disabled and live updates stop arriving despite UI code rendering. (Confirmed: query `enabled` conditions in `useSniperData.ts`.)
- Secondary hypothesis: build-time or runtime transform errors (see `.codex-vite-dev.err.log`) for `src/routes/charts.tsx` and `src/routes/live.tsx` may be preventing the live UI from loading the updated code path, causing apparent non-updating charts. (Confirmed evidence: the dev logs contain transform errors referencing these files; Hypothesis: whether those errors occur in production or block the app at runtime must be verified.)
- Additional hypothesis: backend/user-settings failure (misconfigured `backendUrl`, CORS, or WP nonce/auth issues) prevents `useUserSettings()` from resolving, leaving `pollMs` null. (Hypothesis: code supports this flow but repository evidence of failing network calls is not present in the repo — unconfirmed.)

### 4. Blast radius
- Files likely affected (investigate first):
  - `src/hooks/useSniperData.ts`
  - `src/routes/live.tsx`
  - `src/routes/charts.tsx`
  - `src/hooks/useStreamingTicks.ts`
  - `src/lib/api/sniperClient.ts`
  - `.codex-vite-dev.err.log` / `.codex-vite-dev.log`
- Systems reading/writing the component: Dashboard-JS (frontend) reads snapshots/chart snapshots via REST API; PHP-backend (`/sniper/v1/*`) is the canonical source for snapshots and charts; MT5 and engine components provide upstream price authority.
- Parity surfaces at risk: Live Price parity (Pine <-> Backend <-> Dashboard), chart candle boundary logic (chart series replacement logic in `buildLiveChartSeries()`), and streaming tick smoothing (visual cadence) may present inconsistent UI if polling is intermittently disabled.
- Stale-state risks: cached/stale `user-settings` or missing backend URL will disable polling across `snapshot`, `chart`, `live-signals`, `engine-health`, `ladders` queries.

### 5. Regression surface
- Behaviors that could break if patched incorrectly: watchlist add/remove optimistic update flows (see `useWatchlistAdd()` / `invalidateWatchlistQueries()`), forced refresh flow (`useEngineBatch()` invalidations), and backend URL setting (`useUserSettings()` calls `setBackendUrl()`).
- Existing guards that must not be weakened: `backendReady` gate and `pollMs !== null` checks are safety measures to avoid orphaned queries; removing them without addressing root cause could cause spurious requests or double-fetches.
- Tests/audits: no explicit unit tests for poll gating were found, but HMR/dev logs and `reports/SMOKE_TEST_2026-05-11.SUCCESS.md` indicate smoke test history; verify CI/dev logs for related failures.

### 6. Resolution path options
- Path A (narrow): Add a defensive fallback so `usePollMs()` returns a conservative numeric default (e.g., `DEFAULT_POLL_MS`) instead of `null` during initial load, OR ensure `useUserSettings()` resolves quickly and surfaces errors to the UI. This restores poll-driven refetching while keeping safety guards.
- Path B (broader): Harden startup sequencing: add explicit loading/error states for `user-settings`, fail-fast diagnostics in the UI when backend settings fail, and add automated dev-time check/linters to prevent transform errors; also audit the dev/build logs to fix any syntax issues that trigger `.codex-vite-dev.err.log` entries.
- Recommended: Path A as immediate mitigation, combined with targeted investigation/fix of the dev-transform errors shown in `.codex-vite-dev.err.log` because they indicate an independent build-time issue that can block HMR and hide runtime behavior.

### 7. Risk flags
- High-risk system involved: Yes — live price and engine health surfaces are critical for trading UI; a mispatch could surface incorrect prices. Human review required before any production merge. (Yes)
- Requires parity re-validation: Yes — verify Pine <-> Backend <-> Dashboard parity after any change to polling/refresh logic. (Yes, engine and chart surfaces)
- Migration-blocking: No immediate migration block, but this impacts Phase 0 stabilization if left unfixed. (Phase 0 impact)
- Human review required before merge: Yes — approve by a code owner who understands live/feed safety and engine interactions.

### 8. Handoff package
- Epicentre files to inspect first:
  - `src/hooks/useSniperData.ts` (poll gating and `usePollMs()` behavior)
  - `src/routes/charts.tsx` and `src/routes/live.tsx` (consumer surface)
  - `src/lib/api/sniperClient.ts` (endpoint contracts and `getChartSnapshot` / `getSnapshot`)
  - `.codex-vite-dev.err.log` and `.codex-vite-dev.log` (dev/build transform failures)
- Inputs Codex must verify before planning:
  - Is `useUserSettings()` resolving in the failing environment? Capture network traces for `GET /user/settings` and its response shape.
  - Are there runtime Vite/transform errors in CI or only local dev? Correlate timestamps in `.codex-vite-dev.err.log` with dev runs.
  - Confirm whether `VITE_SNIPER_MOCK_MODE` or `VITE_SNIPER_BACKEND_URL` are set differently in the failing environment.
  - Reproduce with a real backend or explicit `mock` mode to confirm whether the UI updates when polls are active.
- Open unknowns that could invalidate the hypothesis:
  - Whether `user-settings` fails consistently (network/auth/CORS) or intermittently.
  - Whether the `.codex-vite-dev.err.log` transform errors are the root cause of the observed failure in the user's environment.
  - Any runtime console/network errors present in the user's browser at time of failure (not in repo) — need capture.
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
