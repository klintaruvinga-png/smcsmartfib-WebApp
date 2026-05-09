# SMC SuperFIB - Watchlist Consistency Research

## 1. Issue classification
- Severity: HIGH
- Category: wiring / data-contract / stale-data
- Layer(s) affected: Dashboard-JS / REST-API / PHP-backend / workflow
- Phase impact: Phase 0 / Cross-phase

## 2. Confirmed evidence
- `src/hooks/useSniperData.ts` defines `useWatchlist()` as the canonical watchlist source from `useUserSettings()`, and all watchlist-dependent UI routes derive from it. (lines 95-98)
- `src/lib/api/sniperClient.ts` exposes dedicated watchlist mutation endpoints `postWatchlistAdd()` and `postWatchlistRemove()` that require backend responses to include `watchlist` arrays, otherwise they fail closed. (lines 339-346, 348-363)
- `src/routes/account.tsx` uses `useWatchlistAdd()` and `useWatchlistRemove()` with optimistic `user-settings` cache updates, query cancellation, rollback on failure, and authoritative `user-settings` refetch after mutations. (account.tsx lines 120-162)
- `src/routes/live.tsx` hard-gates live MT5 price cards by the canonical watchlist snapshot (`watchlistSet`) and explicitly filters out symbols not in the current watchlist before rendering. (live.tsx lines 56-63)
- `src/routes/signals.tsx` also derives `uniqueSignals` from the canonical watchlist and supports a `watchlistOnly` toggle, so any mismatch between watchlist state and live signals immediately affects the dashboard candidate list. (signals.tsx lines 53-61)
- `.github/migration/PHASE0_SOAK_TRACKER.md` documents a 2026-05-07 watchlist persistence hardening: backend watchlist writes now invalidate `smc_sf_engine_snapshot` and frontend watchlist mutations now cancel/refetch dependent caches to prevent ghost symbols. (PHASE0_SOAK_TRACKER.md lines 208-210)
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` confirms a backend regression test exists to invalidate cached engine snapshots on watchlist changes, proving this is a known consistency risk surface in the PHP backend. (test-watchlist-snapshot-regression.php lines 82-86)

## 3. Root cause hypothesis
- Confirmed: the dashboard watchlist is intended to be a single canonical source of truth for multiple sections (`/account`, `/live`, `/signals`, `/charts`) via `useWatchlist()`. (Confirmed)
- Hypothesis: inconsistent watchlist wiring is likely caused by stale front-end cache or query timing around `/user/watchlist/add` and `/user/watchlist/remove` mutations, especially when `user-settings` data is refreshed concurrently. (Hypothesis)
- Hypothesis: the backend may still emit stale engine snapshots if watchlist persistence paths do not consistently invalidate `smc_sf_engine_snapshot` on every watchlist mutation, causing `Live` and `Signal` routes to show removed or ghost symbols. (Hypothesis)
- Confirmed: the frontend already protects against one class of mismatch by treating the mutation response as authoritative and delaying `user-settings` invalidation until after the successful backend result. (Confirmed)
- Hypothesis: residual inconsistency may remain in downstream sections that do not directly re-read `user-settings` after a watchlist mutation, meaning chart selection or other routes could still reference an old symbol snapshot. (Hypothesis)

## 4. Blast radius
- Files likely affected:
  - `src/hooks/useSniperData.ts`
  - `src/routes/account.tsx`
  - `src/routes/live.tsx`
  - `src/routes/signals.tsx`
  - `src/routes/charts.tsx`
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- Systems affected:
  - frontend watchlist management UI
  - live radar symbol gating
  - signal engine watchlist filtering
  - chart symbol selection and rendering
  - backend watchlist persistence and cached engine snapshot invalidation
- Parity surfaces at risk:
  - Dashboard-JS canonical watchlist vs backend persisted watchlist
  - Backend `/user/watchlist/*` responses vs frontend optimistic cache state
  - `smc_sf_engine_snapshot` cache validity vs watchlist symbol-set changes
- Stale-state risks:
  - in-flight query cancellation and dependent query invalidation can still leave old watchlist symbols visible if not applied consistently across all watchlist consumers
  - chart selection logic may dereference removed symbols if it only clamps selection to the watchlist snapshot in one route but not others

## 5. Regression surface
- Must preserve current watchlist mutation safety logic in `useSniperData.ts`:
  - optimistic cache writes
  - rollback on mutation failure
  - avoiding immediate `user-settings` invalidation that can overwrite fresh mutation state
- Should avoid weakening backend engine snapshot invalidation guards in `smc-superfib-sniper.php`.
- Existing regressions covered by repo evidence:
  - `PHASE0_SOAK_TRACKER.md` and `test-watchlist-snapshot-regression.php` already validate the need to delete stale engine snapshots on watchlist changes.
- At-risk behavior if patched incorrectly:
  - removed symbols reappearing in `Live Radar` or `Signals` after a refresh
  - newly added symbols not appearing immediately in watchlist-only filters
  - chart pages still showing stale symbol selection after watchlist edits

## 6. Resolution path options
- Path A: tighten frontend watchlist wiring only
  - ensure all dashboard routes use the same `useWatchlist()` canonical source
  - add any missing downstream invalidation or clamping after watchlist mutations
  - verify `/charts` and other routes cannot reference removed symbols from stale state
  - Recommended if backend snapshot invalidation is already reliable
- Path B: harden backend watchlist persistence and cache invalidation
  - audit `smc_sf_engine_snapshot` invalidation on every add/remove/save path
  - verify that backend responses always return the authoritative `watchlist` array and no stale symbols survive in the snapshot
  - Recommended if evidence points to ghost symbols after backend refreshes
- Path C: full cross-layer consistency audit
  - combine A and B with explicit regression tests for all watchlist-dependent sections
  - ensure `Live Radar`, `Signal Engine`, `Charts`, and `Account` all reflect the same persisted watchlist state immediately after mutation
  - highest confidence and best fit for production-ready stability
- Recommended: Path C, because this issue spans both frontend wiring and backend persisted watchlist snapshot consistency.

## 7. Risk flags
- High-risk system involved: Yes — watchlist consistency affects live trading symbol visibility and engine output presentation.
- Requires parity re-validation: Yes — Dashboard-JS ↔ backend watchlist contract and snapshot invalidation behavior.
- Migration-blocking: No if limited to Phase 0 stabilization, but yes for production readiness of watchlist-driven sections.
- Human review required before merge: Yes — the fix should be reviewed against existing watchlist persistence hardening and live symbol gating behavior.

## 8. Handoff package
- Epicentre files to inspect first:
  - `src/hooks/useSniperData.ts`
  - `src/routes/account.tsx`
  - `src/routes/live.tsx`
  - `src/routes/signals.tsx`
  - `src/routes/charts.tsx`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- Inputs Codex must verify before planning:
  - whether the dashboard canonical watchlist should always come from `user-settings` and never any other client-local cache
  - whether backend watchlist mutation endpoints are the only source of truth for add/remove operations
  - whether any watchlist persistence snapshot invalidation path is currently missing in the PHP backend
- Open unknowns:
  - whether some dashboard sections still depend on stale symbol state outside `useWatchlist()`
  - whether any backend routes return a stale `watchlist` array due to caching or delayed user-settings refresh
  - whether chart symbol selection and other downstream routes need explicit post-mutation clamp logic
