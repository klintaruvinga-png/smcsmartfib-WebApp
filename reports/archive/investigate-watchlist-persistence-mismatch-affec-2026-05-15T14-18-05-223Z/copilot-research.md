# SMC SuperFIB - Watchlist Persistence Research

## 1. Issue classification
- Severity: HIGH
- Category: wiring / data-contract / stale-data
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS / MT5
- Phase impact: Phase 0 / Cross-phase

## 2. Confirmed evidence
- `src/hooks/useSniperData.ts` defines `useWatchlist()` as the canonical watchlist derived from `useUserSettings()`. All dashboard watchlist consumers rely on this single source of truth.
- `src/routes/account.tsx` uses `useWatchlistAdd()` and `useWatchlistRemove()` for watchlist mutation flow, and the account UI syncs the local draft to the mutation result on success.
- `src/routes/live.tsx` renders the Live Radar by aligning `data.prices` with the canonical `watchlist`; missing symbols in the watchlist cause them to disappear from the radar and ticker.
- `src/components/sniper/AppShell.tsx` renders the header ticker from the same canonical watchlist and `alignWatchlistItems()` so the ticker also depends on `useUserSettings()`.
- `src/routes/signals.tsx` and `src/routes/plan.tsx` filter available engine candidates by `watchlistSet`, meaning a missing watchlist symbol also removes it from signal and plan views.
- `src/lib/api/sniperClient.ts` exposes dedicated endpoints `postWatchlistAdd()` and `postWatchlistRemove()` and explicitly fails if backend responses lack a `watchlist` array.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` implements `post_watchlist_add()`, `post_watchlist_remove()`, `post_user_watchlist()`, and `post_user_settings()`, and these routes persist watchlist state and delete `smc_sf_engine_snapshot` when the watchlist changes.
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` contains regression coverage for watchlist snapshot invalidation on symbol set changes.
- `src/hooks/useSniperData.watchlist.test.tsx` contains tests that confirm removed symbols remain absent while a delayed `user-settings` refetch is pending, proving the front-end is expected to preserve optimistic watchlist state.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` confirms `AUDCAD` is a supported instrument symbol in `instrument_specs()`.

## 3. Root cause hypothesis
- Confirmed: the dashboard watchlist is a single canonical state derived from `user-settings`, and multiple UI surfaces depend on it (`Account`, `Live`, `Ticker`, `Signals`, `Plan`).
- Hypothesis: the bug is not a rendering bug in `Live` or `Ticker` alone; it is likely a watchlist persistence or stale-cache mismatch between backend `user-settings` and the front-end `user-settings` query cache.
- Hypothesis: `useWatchlistAdd()/useWatchlistRemove()` may correctly update the local canonical cache, but a subsequent `user-settings` invalidation/refetch could overwrite that cache with stale backend state if the backend persistence path is not returning the updated watchlist.
- Hypothesis: backend symbol-set mismatch is still possible because the engine health path and cached engine snapshot are separately driven by `smc_sf_engine_snapshot`; stale engine state for `AUDCAD` can survive if snapshot invalidation is inconsistent.
- Hypothesis: if `AUDCAD` were persisted in the backend engine snapshot but not returned in `user-settings`, the frontend would hide it while the health check still reports stale MT5 authority for a symbol the backend still considers part of the engine set.

## 4. Blast radius
- Files likely affected:
  - `src/hooks/useSniperData.ts`
  - `src/routes/account.tsx`
  - `src/components/sniper/AppShell.tsx`
  - `src/routes/live.tsx`
  - `src/routes/signals.tsx`
  - `src/routes/plan.tsx`
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
  - `src/hooks/useSniperData.watchlist.test.tsx`
  - `src/routes/charts.tsx`
- Systems affected:
  - dashboard watchlist management UI
  - live radar symbol visibility
  - header ticker symbol feed
  - signal engine watchlist filtering
  - plan candidate filtering
  - backend watchlist persistence storage
  - engine snapshot cache and MT5 freshness diagnostics
- Parity surfaces at risk:
  - Dashboard-JS canonical watchlist vs PHP backend persisted watchlist
  - frontend `/user-settings` cache vs backend `/user/settings` persisted state
  - backend `smc_sf_engine_snapshot` cache vs watchlist symbol-set changes
  - MT5 freshness/state reporting vs dashboard watchlist rendering
- Stale-state risks:
  - `user-settings` query cache being invalidated and refetched with stale data
  - watchlist mutation responses being overwritten by a delayed backend GET
  - engine snapshot not being invalidated consistently on watchlist symbol changes
  - symbol normalization/alias mismatch hiding supported symbols like `AUDCAD`

## 5. Regression surface
- The existing front-end mutation flow intentionally preserves optimistic `user-settings` state and delays refetch rollback until the backend response is authoritative. This guard must not be weakened.
- Existing tests in `src/hooks/useSniperData.watchlist.test.tsx` validate that a removed symbol stays absent across remounts when `user-settings` refetch is delayed.
- Existing backend regression tests in `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` cover engine snapshot invalidation on watchlist changes.
- The backend `delete_engine_snapshot()` path is an important safety mechanism; it should not be removed or bypassed accidentally during any watchlist persistence fix.
- `validate_watchlist_symbols()` and symbol normalization must remain intact to avoid dropping valid symbols.

## 6. Resolution path options
- Path A: tighten the frontend watchlist cache and query invalidation logic in `src/hooks/useSniperData.ts` so that optimistic watchlist mutations cannot be overwritten by stale `/user/settings` refetches.
- Path B: broaden the backend persistence audit to ensure every watchlist mutation API (`post_watchlist_add`, `post_watchlist_remove`, `post_user_watchlist`, `post_user_settings`) persist and return the same canonical watchlist and consistently invalidate `smc_sf_engine_snapshot`.
- Recommended: Path B, because the symptom spans both absent front-end watchlist visibility and stale backend MT5/engine health diagnostics, indicating the issue is more than a single query cache race.

## 7. Risk flags
- High-risk system involved: Yes — watchlist consistency directly affects live symbol visibility, signal filtering, and engine readiness.
- Requires parity re-validation: Yes — validate Dashboard-JS canonical watchlist vs PHP backend persisted watchlist vs MT5 engine snapshot.
- Migration-blocking: No for migration gating specifically, but yes for Phase 0 stabilization because watchlist-driven UIs and engine health must be stable for production readiness.
- Human review required before merge: Yes — the fix should be reviewed against existing watchlist persistence hardening and engine snapshot invalidation tests.

## 8. Handoff package
- Epicentre files to inspect first:
  - `src/hooks/useSniperData.ts`
  - `src/routes/account.tsx`
  - `src/components/sniper/AppShell.tsx`
  - `src/routes/live.tsx`
  - `src/routes/signals.tsx`
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
  - `src/hooks/useSniperData.watchlist.test.tsx`
- Inputs Codex must verify before planning:
  - whether `/user/settings` is the canonical watchlist source for all dashboard watchlist consumers
  - whether dedicated watchlist endpoints always return the persisted canonical watchlist array
  - whether `user-settings` query invalidation/refetch is overwriting fresh mutation state with stale backend results
  - whether engine snapshot invalidation is consistently applied on all watchlist symbol set changes
- Open unknowns:
  - whether `AUDCAD` is being dropped by normalization or alias logic in `get_settings()` / `validate_watchlist_symbols()`
  - whether the missing frontend symbol is caused by backend persistence mismatch or by a stale frontend `user-settings` query cache
  - whether any watchlist consumer still reads from a legacy non-canonical source outside `useCanonicalWatchlist()`
