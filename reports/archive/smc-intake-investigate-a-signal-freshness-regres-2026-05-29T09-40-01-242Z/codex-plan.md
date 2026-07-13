## 1. Issue validation
The reported root cause is partially rejected. The confirmed defect is an incomplete freshness contract on `/live-signals`. The report does not prove that backend snapshot reuse is wrong. `ensure_engine_snapshot()` is confirmed backend-authority behavior and must remain the gate for signal computation and reuse.

Confirmed
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php:get_live_signals()` reads live signals from `ensure_engine_snapshot($user_id)` and returns `signals` from that snapshot.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php:ensure_engine_snapshot()` can reuse a current stored snapshot instead of recomputing on every request.
- `src/lib/api/sniperClient.ts:apiClient.getLiveSignals()` calls `/live-signals` without `cacheBust: true`, even though the shared `call()` helper already supports GET cache busting and `cache: "no-store"`.
- `src/hooks/useSniperData.ts:useLiveSignals()` does not override the global query `staleTime: 10_000` defined in `src/router.tsx`.
- The active plugin code does not emit explicit anti-cache headers on the live-signals REST response path.

Likely
- The regression is caused by missing end-to-end no-cache behavior on the live-signals transport path: the origin response is not explicitly marked non-cacheable, the browser request is not `no-store`, and the live-signals query can briefly reuse fresh-marked cached data on remount or poll re-enable.
- A query-local `staleTime: 0` override is justified as a hardening step for the live-signals hook, even though interval polling itself remains intact.

Unconfirmed
- LiteSpeed or any other intermediary is definitively caching `/wp-json/sniper/v1/live-signals`.
- `ensure_engine_snapshot()` freshness rules are incorrect or need recomputation changes.
- `src/router.tsx` global query defaults should be changed.
- The archived plugin file is part of the implementation surface.

## 2. Implementation contract
### `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Exact target: `get_live_signals()`.
- Exact change required: keep `ensure_engine_snapshot($user_id)` as the source of truth, but return the live-signals REST response with explicit anti-cache headers for this route only. The response must carry `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` on successful authenticated reads.
- Guard rails: do not change `ensure_engine_snapshot()`, `is_engine_snapshot_current()`, `save_engine_snapshot()`, auth checks, response body shape, watchlist handling, refresh interval handling, stale threshold handling, or any other route.
- Why this file is in scope: it is the active origin response path for `/live-signals`, and it currently lacks an explicit anti-cache contract.
- Acceptance criterion tied to the failure path: authenticated `GET /wp-json/sniper/v1/live-signals` still returns the same signal array contract, still uses backend snapshot authority, and now includes the anti-cache headers on each successful response.

### `src/lib/api/sniperClient.ts`
- Exact target: `apiClient.getLiveSignals()`.
- Exact change required: call `/live-signals` with `cacheBust: true` so the existing shared GET behavior appends a unique query token and uses fetch `cache: "no-store"`.
- Guard rails: do not change endpoint paths, credentials behavior, auth header logic, mock-mode behavior, response typing, or the shared `call()` semantics for unrelated endpoints.
- Why this file is in scope: the active live-signals client omits the repo's existing no-store transport hardening.
- Acceptance criterion tied to the failure path: each live-signals fetch is issued as a GET to `/sniper/v1/live-signals` with a unique cache-bust query parameter and fetch init `cache: "no-store"`.

### `src/hooks/useSniperData.ts`
- Exact target: `useLiveSignals()`.
- Exact change required: set `staleTime: 0` on the `["live-signals"]` query only.
- Guard rails: keep `queryKey`, `enabled` logic, `refetchOnWindowFocus: false`, `refetchInterval: enabled ? pollMs : false`, and backend-owned poll cadence unchanged. Do not touch `useSnapshot()`, `useEngineHealth()`, or global router defaults.
- Why this file is in scope: the live-signals hook currently inherits the global 10 second stale window and has no local freshness override.
- Acceptance criterion tied to the failure path: the live-signals query no longer inherits the global stale window, while still polling on the existing settings cadence and remaining backend-authoritative.

### `src/lib/api/sniperClient.test.ts`
- Exact target: the transport behavior tests for `apiClient`.
- Exact change required: add or update a unit test that exercises `apiClient.getLiveSignals(false)` and asserts the request URL includes the live-signals path plus a cache-bust token, and the fetch init includes `method: "GET"` and `cache: "no-store"`.
- Guard rails: do not broaden the test to unrelated endpoints, and do not change current mock-mode expectations.
- Why this file is in scope: the live-signals transport contract is currently untested.
- Acceptance criterion tied to the failure path: the test fails if cache busting or `no-store` behavior is removed from live-signals reads.

### `src/hooks/useSniperData.test.tsx`
- Exact target: the query configuration tests for polling hooks.
- Exact change required: add or update a `useLiveSignals()` test that asserts `queryKey: ["live-signals"]`, `enabled: true`, `staleTime: 0`, and the resolved `refetchInterval`.
- Guard rails: do not rewrite the test harness, and do not alter the existing `useEngineHealth()` or `useUserProgress()` coverage except as needed to keep the suite coherent.
- Why this file is in scope: live-signals currently has no direct regression coverage for query-cache configuration.
- Acceptance criterion tied to the failure path: the test fails if `useLiveSignals()` re-inherits the global stale window or loses the existing polling cadence.

## 3. Patch sequence
1. Modify `wordpress/smc-superfib-sniper/smc-superfib-sniper.php:get_live_signals()` to emit route-local anti-cache headers while preserving the existing snapshot-backed response body.
2. Modify `src/lib/api/sniperClient.ts:apiClient.getLiveSignals()` to opt into the shared GET cache-busting and `no-store` request behavior.
3. Modify `src/hooks/useSniperData.ts:useLiveSignals()` to set `staleTime: 0` without touching `src/router.tsx`.
4. Add regression coverage in `src/lib/api/sniperClient.test.ts` and `src/hooks/useSniperData.test.tsx`.
5. Run targeted tests, then perform authenticated manual verification of the live-signals network path.

Dependencies between changes
- Step 2 depends on the existing `call()` helper behavior already present in `src/lib/api/sniperClient.ts`; no shared helper rewrite is permitted.
- Step 3 depends on keeping the global router default intact; the hardening is query-local by design.
- Manual verification is only meaningful after steps 1 and 2 are both present, because client-side `no-store` alone does not prove the origin response contract.

State, cache, migration, or contract sequencing risk
- No database migration, schema migration, or API body contract change is allowed in this patch.
- A previously cached intermediary response may persist until deployment propagation, cache expiry, or a one-time operational purge. That operational reality is not a reason to widen the code patch into snapshot recomputation changes.
- Do not interpret post-deploy stale observations until the response headers at origin are confirmed on the updated build.

## 4. Regression guards
- Verify `get_live_signals()` still reads through `ensure_engine_snapshot($user_id)` with the default force path and does not force recomputation.
- Verify `/live-signals` still returns only the signal array contract; no wrapper object, meta fields, or schema drift may be introduced.
- Verify the existing auth and nonce behavior for WordPress REST calls remains intact.
- Verify `src/router.tsx` global `staleTime: 10_000` remains unchanged for unrelated queries.
- Verify `useEngineHealth()` and `useUserProgress()` still retain their existing stale-time expectations after the live-signals hook change.
- Re-validate backend/frontend parity by comparing the signal set from `/snapshot` and `/live-signals` for the same user after a backend update cycle.
- Re-validate stale-data behavior by confirming the dashboard reflects a changed live signal within one configured poll interval without a hard refresh.
- Diagnostic evidence required after patching: network inspection must show a unique cache-bust query on each live-signals request and anti-cache headers on each successful live-signals response. No new persistent backend logging is required in this patch.

## 5. Non-goals
- Do not change `ensure_engine_snapshot()`, `is_engine_snapshot_current()`, `save_engine_snapshot()`, or any snapshot invalidation rules.
- Do not alter MT5 authority, backend source-of-truth rules, Pine formulas, signal math, regime logic, or stale-threshold calculations.
- Do not change `src/router.tsx` global query defaults.
- Do not patch archived plugin files under `wordpress/_archive/...`.
- Do not add frontend-derived signal truth, client-side signal recomputation, or speculative cache flush logic.
- Do not expand into infrastructure cache configuration, LiteSpeed settings, CDN rules, or server rewrites unless a later verified report proves the origin patch is insufficient.

## 6. Risk assessment
- Worst-case failure mode if patched incorrectly: the implementation bypasses snapshot authority or forces recomputation on every poll, causing backend load spikes, altered signal sequencing, or a new divergence between backend truth and dashboard state.
- User-visible failure mode: the dashboard still shows stale live signals after deploy, or signals flicker/reload incorrectly because query cadence or cache behavior was changed beyond the intended contract.
- Backend authority or stale-state risks: changing snapshot freshness logic in this patch would violate the current authority model; changing only the frontend without the REST response contract would leave intermediary stale-cache risk unresolved.
- Whether human approval should be required before merge: Yes. Human approval is required because this patch touches live-signal freshness on a trading dashboard and must be verified not to weaken backend authority.

## 7. Test requirements
- Add or update `src/lib/api/sniperClient.test.ts` to cover `apiClient.getLiveSignals(false)` request construction, including the live-signals path, cache-bust query token, and fetch `cache: "no-store"`.
- Add or update `src/hooks/useSniperData.test.tsx` to cover `useLiveSignals()` query configuration with `staleTime: 0`, preserved `queryKey`, and preserved poll cadence.
- Existing automated checks that must still pass: the current `useEngineHealth()` stale-time test, the current `useUserProgress()` stale-time test, and existing `sniperClient` transport tests.
- Manual verification that must still pass: authenticated dashboard polling continues to work, no auth/session regression appears on REST reads, and `/live-signals` remains readable only through the current authenticated path.
- Soak, replay, parity, or live-environment verification needed: keep the dashboard open for at least three poll cycles, confirm each live-signals request has a unique cache-bust token, confirm each response carries the anti-cache headers, and confirm a backend signal change becomes visible in the UI within one configured poll interval without a hard refresh. Compare `/snapshot` and `/live-signals` outputs after a backend update to confirm parity.

## 8. Implementation handoff
- Branch naming recommendation: `fix/live-signals-freshness-contract`
- Suggested commit grouping: `fix(wp): harden live-signals REST cache headers` and `test+fix(web): harden live-signals client freshness contract`
- Required reports or artifacts to generate after implementation: a short verification artifact at `reports/implementation-verification.md` containing targeted Vitest results and authenticated network evidence for `/live-signals` request URLs and response headers.
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
