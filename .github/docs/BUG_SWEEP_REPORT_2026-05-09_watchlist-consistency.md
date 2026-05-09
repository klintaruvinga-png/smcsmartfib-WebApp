# Bug Sweep Report: Watchlist Consistency

Date: 2026-05-09

## Scope

Watchlist state consistency across Account, Live Radar, Signal Engine, Charts, and the header ticker, plus backend cache invalidation on persisted watchlist changes.

## Confirmed findings

1. `POST /user/settings` persisted `watchlist` changes without invalidating `smc_sf_engine_snapshot`.
   - File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
   - Impact: a saved watchlist change could leave snapshot-backed dashboard sections reading the old symbol universe until the next engine refresh.

2. The dashboard was not using one shared watchlist clamp/order helper across all user-visible consumers.
   - Files: `src/hooks/useSniperData.ts`, `src/routes/live.tsx`, `src/routes/charts.tsx`, `src/components/sniper/AppShell.tsx`
   - Impact: Live, Charts, and the header ticker could reconcile symbol membership independently instead of through one canonical clamp/order path.

3. Account watchlist rendering and duplicate checks were not both anchored to the canonical watchlist selector.
   - File: `src/routes/account.tsx`
   - Impact: the Account write path could diverge from the canonical read path during in-flight cache updates.

## Fixes applied

- Added shared frontend helpers in `src/hooks/useSniperData.ts`:
  - `clampSymbolToWatchlist()`
  - `filterItemsByWatchlist()`
- Rewired `src/routes/live.tsx` and `src/components/sniper/AppShell.tsx` to derive watchlist-gated price tiles from the same canonical helper.
- Rewired `src/routes/charts.tsx` to clamp route-local selection through the shared helper whenever watchlist membership changes.
- Rewired `src/routes/account.tsx` to use the canonical watchlist selector for duplicate prevention and watchlist rendering.
- Memoized the `watchlistOnly` signals path in `src/routes/signals.tsx` so recomputation stays tied to the current canonical watchlist set.
- Hardened `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` so `post_user_settings()` invalidates `smc_sf_engine_snapshot` whenever the persisted watchlist changes.
- Extended `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` to cover the settings-save invalidation branch.

## Validation run

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npx eslint src/hooks/useSniperData.ts src/routes/account.tsx src/routes/live.tsx src/routes/signals.tsx src/routes/charts.tsx src/components/sniper/AppShell.tsx`
- `npm run build`
- `npm run lint`
  - Fails on unrelated pre-existing repo issues, including `scripts/pipeline-watcher.js`

## Residual risks

- Interactive add/remove verification against a live authenticated backend session was not available in this environment.
- `Signal Engine` still depends on backend-ranked candidate ordering by design; this patch only normalized watchlist membership, not signal ordering.
