# Executive Summary

- Report date: 2026-05-29
- Phase: 2 - dashboard live-signals freshness contract
- Status: CONDITIONAL PASS
- Overall parity: targeted code and regression parity passed for origin headers, client transport, and query freshness configuration.
- Threshold required: preserve backend signal authority while eliminating cache-driven frontend drift on `/live-signals`.
- Trend: improving.

# Component Parity Metrics

## Live-signals transport freshness

| Metric | Expected behavior | Result | Status |
| --- | --- | --- | --- |
| Origin anti-cache contract | Successful authenticated `/live-signals` reads must emit `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache`. | Code patched and PHP syntax validation passed; deployed traffic capture still pending. | PASS WITH MANUAL GAP |
| Client request cache busting | Each live-signals GET must include a unique `_=` token and fetch with `cache: "no-store"`. | Regression test added and passed in `src/lib/api/sniperClient.test.ts`. | PASS |
| Query stale-window override | `useLiveSignals()` must not inherit the global 10 second stale window. | Regression test added and passed in `src/hooks/useSniperData.test.tsx`. | PASS |

## Backend authority preservation

| Metric | Suite / evidence | Result | Status |
| --- | --- | --- | --- |
| Snapshot authority preserved | `get_live_signals()` still reads from `ensure_engine_snapshot($user_id)` with no recomputation changes. | Verified by targeted code inspection and unchanged response body contract. | PASS |
| Router default isolation | `src/router.tsx` global query defaults remain unchanged for unrelated queries. | Verified by targeted code inspection and existing query tests staying green. | PASS |

# Drift Analysis

- Previous risk: live signals could remain stale on the dashboard because the transport path lacked explicit no-cache guarantees and the query layer could treat cached data as fresh for 10 seconds.
- Current state: the origin response, client request, and query configuration now all explicitly harden the freshness contract while preserving backend snapshot authority.
- Residual drift: deployed intermediary behavior and real poll-cycle visibility were not observed from this workspace.

# Comparison Matrix

| Layer | Before patch | After patch | Notes |
| --- | --- | --- | --- |
| WordPress live-signals response | Bare success response with no explicit anti-cache contract. | Successful response now sets `Cache-Control` and `Pragma` no-cache headers. | Route-local only. |
| Dashboard live-signals client | Standard GET without cache-bust token. | Reuses existing `cacheBust: true` transport path. | Preserves endpoint and auth contract. |
| React Query live-signals hook | Inherited global `staleTime: 10_000`. | Forces `staleTime: 0` on `["live-signals"]` only. | Poll cadence preserved. |
| Engine snapshot authority | Snapshot reuse controlled by backend freshness gates. | Unchanged. | Source of truth preserved. |

# Acceptance Criteria

- [x] `get_live_signals()` remains snapshot-backed and does not force recomputation.
- [x] `/live-signals` response body shape remains unchanged.
- [x] Live-signals client requests now use cache-busting and fetch `cache: "no-store"`.
- [x] `useLiveSignals()` now overrides the global stale window with `staleTime: 0`.
- [x] Existing targeted frontend regression suites stayed green.
- [ ] Authenticated deployed response-header verification completed.
- [ ] `/snapshot` and `/live-signals` parity confirmed after a real backend update cycle.
- [ ] Changed live signal observed in the UI within one poll interval without hard refresh.

# Migration Readiness

- Ready to continue on the targeted dashboard freshness path.
- Not sufficient to close the issue completely until authenticated runtime verification confirms the deployed transport behavior.

# Unresolved Edge Cases

- A stale intermediary cache may still require a one-time operational purge after deployment.
- This audit does not prove that a third-party cache layer is the only source of stale observations; it only proves the code path now expresses the intended no-cache contract.

# Verification Artifacts

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx`
- `npm run validate:impl`
- `reports/implementation-verification.md`
