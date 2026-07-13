# SMC SuperFIB — Hardened Implementation Contract

## 1. Issue validation

### Issue A — Frontend Polling Gate (Phase 0 · HIGH)

**Confirmed**
- `usePollMs()` in `src/hooks/useSniperData.ts` returns `null` when user settings have not yet resolved. React-Query `refetchInterval` and `enabled` guards in `useSnapshot()` and sibling hooks are tied to `pollMs !== null && backendReady`. When either condition is false, all chart and live queries are silenced. This matches the symptom exactly: charts render but do not update.
- `.codex-vite-dev.err.log` contains `Unexpected token` transform errors referencing `src/routes/charts.tsx` and `src/routes/live.tsx`, confirming a dev-build path defect exists independently of the polling gate issue.

**Likely**
- `useUserSettings()` is slow to resolve or encounters a transient startup error, leaving `pollMs` stuck at `null` longer than intended. The correct fix is a conservative numeric fallback in `usePollMs()`, not removal of the gate.
- The transform errors in `.codex-vite-dev.err.log` are isolated to the dev/HMR path and do not block the production bundle, but they mask runtime regressions during development and must be eliminated.

**Unconfirmed**
- Persistent backend network failure (CORS, auth, misconfigured `VITE_SNIPER_BACKEND_URL`) as the reason `useUserSettings()` never resolves. The research reports no captured network traces from the failing environment. This must be ruled out during acceptance before the polling-gate fix is declared complete.
- Whether the `.codex-vite-dev.err.log` errors originate from source-file syntax problems or from a Vite/plugin configuration issue unrelated to the route files.

**Corrected root cause statement:** The primary failure is `usePollMs()` returning `null` during the user-settings load window, which disables the React-Query refetch interval across all live chart and radar surfaces. This is a frontend startup-sequencing gap, not a backend fault. The transform errors are an independent secondary defect.

---

### Issue B — MT5 Heartbeat Dispatch (Phase 1 · CRITICAL)

**Confirmed**
- `OnPeriodic()` in `mt5/MarketDataEngine.mqh` does not call `SendHeartbeat()`. The function exists (lines 460–519), the PHP route exists (`POST /ea/heartbeat`, lines 485–489 of `smc-superfib-sniper.php`), the auth contract is correct (`X-EA-API-Key` + positive `user_id`), and the PHP test validates the full happy path. Only the call site is absent.
- Zero heartbeat dispatches across multiple live EA cycles is the exact expected symptom of a missing call site.
- `g_heartbeatIntervalTicks = 48` in `mt5/SMC_MarketDataEA.mq5` defines a throttle cadence that is never exercised because the entry point is unreachable.

**Likely**
- The absent call is a scaffolding omission: `SendHeartbeat()` was authored when the backend route was added but was not wired into the dispatch path.

**Unconfirmed**
- Whether `OnTimer()`, `OnInit()`, or `OnDeinit()` independently calls `SendHeartbeat()` through a path not examined in the research. This must be confirmed by a full-text search before any patch is applied. If an independent call site is found, this plan is invalid and must be revised.
- Whether `baseUrl` inside `SendHeartbeat()` is correctly assigned or has been overwritten to a non-REST endpoint (e.g., `webhookUrl`). Must be verified before adding the call.

---

## 2. Implementation contract

### Change A-1 — Fallback poll interval in `usePollMs()`

- **File:** `src/hooks/useSniperData.ts`
- **Target:** `usePollMs()` function — specifically the return path that currently yields `null` when `useUserSettings()` has not yet resolved.
- **Exact change:** Introduce a module-level constant `DEFAULT_POLL_MS = 5000`. Change `usePollMs()` to return `DEFAULT_POLL_MS` during the loading/unresolved state instead of `null`. When `useUserSettings()` has resolved and provided a configured value, that resolved value must take precedence and override the fallback. The `null` return path must be eliminated entirely from `usePollMs()`.
- **Guard rails:** The `backendReady` flag must remain as the primary `enabled` condition on every query that currently uses it. Only the `pollMs !== null` sub-condition is being addressed. `backendReady = false` must still fully suppress all queries even when `pollMs` is a non-null number. `useUserSettings()` must still call `setBackendUrl()` when settings resolve; nothing about the settings resolution chain may be bypassed.
- **Why in scope:** This is the confirmed root cause. The null return during startup is the exact mechanism that disables the refetch interval and stops charts from updating.
- **Acceptance criterion:** After patch, React-Query DevTools show `useSnapshot()` and chart-snapshot queries transitioning to `enabled: true` within the first render cycle. Charts receive at least one live refetch before `useUserSettings()` has fully resolved.

---

### Change A-2 — Resolve transform errors in dev route files

- **Files:** `src/routes/charts.tsx`, `src/routes/live.tsx`
- **Target:** The exact `Unexpected token` or syntax error identified by reading `.codex-vite-dev.err.log` before any edit is made.
- **Exact change:** Read the dev log error lines, extract the file, line number, and token. If the trace points to a source-file syntax defect, fix only that token. If the trace points to a Vite configuration issue or a plugin transform failure unrelated to these source files, do not touch the source files — file a separate finding and mark this change skipped.
- **Guard rails:** Do not refactor component structure. Do not add imports, hooks, state, or props that are not required to resolve the identified syntax token. Do not alter any polling hook call sites inside these files.
- **Why in scope:** Secondary confirmed evidence. Dev-log transform errors for these files are present and suppress HMR, hiding runtime regressions during development.
- **Acceptance criterion:** `npx vite dev` starts without transform errors for `src/routes/charts.tsx` and `src/routes/live.tsx`. HMR reloads for both files complete cleanly without `Unexpected token` entries in the log.

---

### Change B-1 — Wire `SendHeartbeat()` into `OnPeriodic()`

- **File:** `mt5/MarketDataEngine.mqh`
- **Target:** `OnPeriodic()` method body — the position immediately after the symbol loop completes and before the function returns.
- **Exact change:** Add one `Print()` diagnostic line confirming the call is being made, followed by one call to `SendHeartbeat()`. The call must be throttled using the existing `g_heartbeatIntervalTicks` counter defined in `mt5/SMC_MarketDataEA.mq5`. If the throttle counter is in scope at the `OnPeriodic()` call site, use it directly. If it is not in scope, introduce the minimum local counter required and document the scoping decision in the commit message. No other logic changes.
- **Guard rails:** The symbol iteration loop and all `SendToBackend()` calls must not be touched. Dispatch order must be preserved: symbol loop executes first, heartbeat call executes after, so a heartbeat failure cannot suppress symbol data. `baseUrl` derivation must not change. `wpUserId` assignment must not change. `SendHeartbeat()`'s payload fields must not change.
- **Why in scope:** The only confirmed missing wiring. Route, handler, auth, and payload all exist and are verified correct. Only the call site is absent.
- **Acceptance criterion:** `POST /ea/heartbeat` appears in the MT5 Experts log with HTTP 200 within the first `g_heartbeatIntervalTicks` periodic cycles after EA attach. The intake checklist transitions `ea-heartbeat` from FAIL/MISSING to PASS.

---

## 3. Patch sequence

1. **[Pre-patch — blocker for B-1]** Full-text search `mt5/MarketDataEngine.mqh`, `mt5/SMC_MarketDataEA.mq5`, and all `.mqh` files included by the EA for any invocation of `SendHeartbeat()` outside its definition. If any call site is found, halt Change B-1 and re-evaluate root cause. Do not proceed with B-1 until this search returns zero results.
2. **[Pre-patch — blocker for B-1]** Confirm that `baseUrl` inside `SendHeartbeat()` references the same variable populated by `Initialize()` and used by `SendToBackend()` — not `webhookUrl`, not a hardcoded string, not an uninitialized variable. If `baseUrl` is incorrect in `SendHeartbeat()`, adding the call will silently POST to the wrong endpoint. That defect must be fixed as part of Change B-1 if found.
3. **[Pre-patch — required for A-2]** Read `.codex-vite-dev.err.log` and extract the exact error lines, file references, and token positions before touching any route file. Do not speculate about the cause before reading the log.
4. **[Change A-1]** Patch `usePollMs()` in `src/hooks/useSniperData.ts` to return `DEFAULT_POLL_MS` during the unresolved state. This change is independent of all other changes and may proceed immediately once the confirmed root cause is accepted.
5. **[Change A-2]** If and only if the dev log confirms source-file syntax errors: fix the identified token in `src/routes/charts.tsx` and/or `src/routes/live.tsx`. If the errors are Vite-config related, skip this change and file a separate report.
6. **[Change B-1]** Add `SendHeartbeat()` call to `OnPeriodic()` only after pre-patch steps 1 and 2 confirm the call site is absent and `baseUrl` is correct.

**Dependencies:**
- Change A-1 has no dependency on A-2 or B-1. It may be committed to its branch first.
- Change A-2 is blocked on step 3 (log read). It must not be applied speculatively.
- Change B-1 is blocked on pre-patch steps 1 and 2. It must not be applied before both pass.
- A-1 and B-1 may be developed in parallel branches once their respective pre-patch checks pass.

**Sequencing risks:**
- If `useUserSettings()` is persistently failing due to network or auth error, Change A-1 alone will not fully restore live updates — `backendReady` will remain false and queries will remain disabled. This must be actively tested during acceptance. If `backendReady` is confirmed stuck false after A-1, a separate backend-auth investigation is required before declaring Phase 0 resolved.
- The MT5 change requires EA recompile and clean reattach. Do not test against a live trading terminal without detaching the EA first.

---

## 4. Regression guards

**Frontend (Changes A-1, A-2):**
- `backendReady = false` must still suppress all queries even after Change A-1. Verify with a test environment where `VITE_SNIPER_BACKEND_URL` is intentionally misconfigured: no queries may fire regardless of `pollMs`.
- Watchlist add/remove optimistic update flows (`useWatchlistAdd()`, `invalidateWatchlistQueries()`) must behave identically before and after the patch. These flows do not depend on `pollMs` and must not be disturbed.
- `useEngineBatch()` forced-refresh invalidation must still fire on demand and not be suppressed by the fallback poll interval.
- `useUserSettings()` must still call `setBackendUrl()` upon resolution, ensuring production backend URL propagation is not bypassed by the fallback.
- A console warning must be emitted when `usePollMs()` falls back to `DEFAULT_POLL_MS` so that developers can detect the fallback state. The warning must not appear in production when settings have resolved.
- HMR reload of `charts.tsx` and `live.tsx` must complete without transform errors in the dev log after Change A-2.

**MT5 EA (Change B-1):**
- `OnPeriodic()` symbol dispatch timing and order must not change. Account-sync and symbol-sync must continue at the same cadence as before.
- EA must recompile with zero errors and zero warnings in MetaEditor.
- PHP test suite (`test-ea-heartbeat.php`, `test-ea-account-sync.php`, `test-ea-symbol-sync.php`) must all pass without modification.
- `permission_ea_bridge()` auth contract must be unchanged: missing `user_id`, zero `user_id`, and missing API key must all still return the correct rejection responses.
- The `Print()` log line added to `OnPeriodic()` must include the HTTP response code returned by `SendHeartbeat()`.

**Parity re-validations:**
- After Change A-1: verify Pine-close price matches the Dashboard-displayed price on at least two consecutive live candles with confirmed timestamps.
- After Change B-1: verify the `engine_runs` table receives a new row with `status=heartbeat`, `source=explicit_heartbeat`, and a timestamp within the last 10 minutes after EA reattach.

---

## 5. Non-goals

**Explicitly out of scope for this patch:**
- Refactoring the `useUserSettings()` fetch chain, retry logic, error handling, or caching strategy beyond what is required to ensure `usePollMs()` is not permanently null.
- Adding a dedicated `OnHeartbeatTimer()` handler or independent timer registration in MT5 (research Path B — rejected as unnecessary scope with medium regression risk).
- Modifying `g_heartbeatIntervalTicks` in `mt5/SMC_MarketDataEA.mq5`.
- Altering `SendToBackend()` payload structure or the symbol iteration logic in `OnPeriodic()`.
- Changing endpoint contracts in `src/lib/api/sniperClient.ts` — `getSnapshot()` and `getChartSnapshot()` signatures must not change.
- Adding new REST routes, API fields, or backend handlers.
- Modifying `src/hooks/useStreamingTicks.ts` — the streaming tick smoother consumes the poll cadence and is not a root cause.
- CORS configuration, WP nonce logic, or backend auth handling — if those are failing they require a separate dedicated investigation.
- Pine trading formula changes.
- Any Phase 2 or later scope.

**Attractive but unsafe follow-on changes to reject in this patch:**
- Removing the `backendReady` guard to simplify polling logic — this guard prevents orphaned queries against an unconfigured backend and must remain.
- Adding offline or mock fallback data when the backend is unreachable — this would make the frontend a source of signal truth, which violates architecture constraints.
- Setting `DEFAULT_POLL_MS` aggressively below 3000ms — this risks a polling storm during the startup window before `backendReady` resolves.
- Adding `suspense: true` or global error boundaries to the React-Query layer without a full audit of all query consumers.
- Batching Changes A-1 and B-1 into a single PR — they touch different layers and require independent review.

---

## 6. Risk assessment

### Issue A — Polling Gate

- **Worst-case if patched incorrectly:** The `backendReady` guard is accidentally weakened or removed, causing queries to fire before a valid `backendUrl` is set. This produces a flood of failed requests to `undefined` or localhost, exhausts rate limits on the WP REST API, and may generate CORS errors that are misread as backend faults.
- **User-visible failure mode:** Charts poll at the fallback rate but display stale or error-state data if `backendReady` is still false, potentially surfacing incorrect prices to the user.
- **Backend authority risk:** If `DEFAULT_POLL_MS` is set too aggressively and `backendReady` is inadvertently weakened, the Dashboard becomes a polling-storm origin during EA restart windows.
- **Stale-state risk:** Low, provided `backendReady` is preserved. The fallback poll interval does not alter data authority.
- **Human approval required:** Yes, before merge to `main`. A code owner familiar with the query enable-gate architecture must confirm that `backendReady` semantics are unchanged.

### Issue B — Heartbeat Dispatch

- **Worst-case if patched incorrectly:** `baseUrl` inside `SendHeartbeat()` is misconfigured and the new call POSTs silently to the wrong endpoint. Session tracking remains broken and the incorrect POST may interfere with other webhook paths on the same server.
- **User-visible failure mode:** The intake checklist continues to show `ea-heartbeat: FAIL`; the Dashboard displays a LIVE session state asserted by account/symbol-sync but unconfirmed by heartbeat, producing a false live indicator.
- **Backend authority risk:** Backend session health tracking depends on heartbeat timestamps to distinguish live EA from stale or crashed EA. Incorrect heartbeat records in `engine_runs` corrupt the Phase 1 validation gate.
- **Stale-state risk:** Medium. Adding the call correctly resolves the stale-state problem; adding it with an incorrect `baseUrl` may worsen it silently.
- **Human approval required:** Yes, unconditionally. A code owner must verify: (a) EA recompiles with zero errors and warnings, (b) `POST /ea/heartbeat` transitions to PASS in the intake checklist, (c) PHP tests pass, (d) the diff is limited to the call site addition and nothing else.

---

## 7. Test requirements

### Issue A — Frontend Polling

**Tests to add:**
- Unit test for `usePollMs()`: assert the function returns `DEFAULT_POLL_MS` when `useUserSettings()` is in the loading state (mock return: `{ isLoading: true, data: undefined }`), and returns the user-configured value when settings have resolved (mock return: `{ isLoading: false, data: { pollMs: 10000 } }`). The `null` return path must not be reachable after the patch.
- Unit test: assert that `useSnapshot()` has `enabled: false` when `backendReady = false`, regardless of `pollMs` value.

**Existing tests and checks that must still pass:**
- All React-Query cache invalidation flows for watchlist operations.
- Any existing snapshot query test that asserts `enabled: false` when `backendReady = false`.
- The `reports/SMOKE_TEST_2026-05-11.SUCCESS.md` scenario must be reproducible after the patch.

**Live / soak verification:**
- Run the Dashboard against a live backend for a minimum of 15 minutes after Change A-1. Confirm chart candles are updating with correct, incrementing timestamps. Confirm the network panel shows no duplicate or overlapping requests at the fallback interval.

### Issue B — MT5 Heartbeat

**Checks to add:**
- MT5 Experts log: confirm the `SendHeartbeat()` diagnostic `Print()` line appears within `g_heartbeatIntervalTicks` periodic cycles after EA attach.
- Intake checklist: confirm `ea-heartbeat` transitions from FAIL/MISSING to PASS after the first heartbeat cycle completes.

**Existing tests that must still pass:**
- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` — all positive and negative path cases must pass unmodified.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — confirm account-sync dispatch timing is unaffected.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` — confirm symbol-sync dispatch is unaffected.

**Parity / live verification:**
- After EA reattach: query the `engine_runs` table and confirm a row with `status=heartbeat`, `source=explicit_heartbeat`, and a timestamp within the last 10 minutes is present.
- Confirm the backend session health state transitions from stale to live after the first heartbeat is received and that no downstream surface (dashboard live indicator, engine-health query) reflects a stale state post-patch.

---

## 8. Implementation handoff

**Branch naming:**
- `fix/polling-gate-fallback` — Changes A-1 and A-2 (Phase 0 frontend polling)
- `fix/mt5-heartbeat-dispatch` — Change B-1 (Phase 1 MT5 heartbeat)

These branches must not be merged into each other. They target independent layers and require independent review.

**Suggested commit grouping:**

`fix/polling-gate-fallback`:
- Commit 1: `fix(hooks): return DEFAULT_POLL_MS fallback when user settings are loading` — contains only the `usePollMs()` change in `src/hooks/useSniperData.ts`.
- Commit 2 (conditional, only if source-file syntax errors confirmed): `fix(routes): resolve Vite transform error in charts.tsx / live.tsx`.

`fix/mt5-heartbeat-dispatch`:
- Commit 1: `fix(mt5): wire SendHeartbeat() into OnPeriodic() after symbol loop` — contains only the call site addition and diagnostic `Print()` line in `mt5/MarketDataEngine.mqh`.

**Required artifacts after implementation:**
- `.codex-vite-dev.err.log` must be clean — no transform errors for the patched route files — after Change A-2. Attach a log excerpt.
- React-Query DevTools screenshot showing `snapshot` and `chart-snapshot` queries in `fetching` state within the first render cycle, before full settings resolution.
- Intake checklist screenshot or log excerpt confirming `ea-heartbeat: PASS` after the first heartbeat cycle post Change B-1.
- PHP test run output confirming all heartbeat, account-sync, and symbol-sync tests pass with no failures.
- MT5 compiler output confirming zero errors and zero warnings after recompile.

**State transition:**

`READY_FOR_IMPLEMENTATION` · `editing_locked=false`

Both branches are independent and may be handed off to the implementation agent simultaneously. Change A-1 carries lower risk and should be reviewed and merged first. Change B-1 requires unconditional human approval before merge.
