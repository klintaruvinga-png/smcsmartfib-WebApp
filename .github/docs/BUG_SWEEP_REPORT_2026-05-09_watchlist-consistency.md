# Bug Sweep Report: Watchlist Consistency

Date: 2026-05-09

## Scope

Cross-section watchlist consistency for Account, Live Radar, Signal Engine, Charts, and the header ticker, with backend authority preserved.

## Confirmed findings

1. Frontend canonicalization gap
   - `src/hooks/useSniperData.ts` normalized watchlists by trimming only.
   - Snapshot prices and live signals are keyed by uppercase symbols.
   - Mixed-case `user-settings.watchlist` entries could therefore gate out valid uppercase snapshot and signal symbols in downstream sections.

2. Backend lowercase symbol corruption
   - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` sanitized symbols with `preg_replace('/[^A-Z0-9]/', ...)` before `strtoupper(...)`.
   - Lowercase letters were removed instead of normalized.
   - Legacy persisted watchlists or lowercase `/user/watchlist/*` payloads could collapse symbols, producing partial or missing watchlists and stale downstream authority lookups.

3. Draft-state divergence risk in Account
   - `src/routes/account.tsx` updated the local draft from raw mutation results instead of the canonical query cache snapshot.
   - If the backend returned a non-canonical array, the local draft could drift from the canonical watchlist used by other sections.

## Fixes applied

- Canonicalized `user-settings.watchlist` at fetch time in `src/hooks/useSniperData.ts`.
- Added `useCanonicalWatchlist()` so consumers share the same canonical list and set.
- Rewired `live`, `signals`, `charts`, and the header ticker to the shared selector.
- Synced the Account draft watchlist from the canonical `user-settings` cache after add/remove mutations.
- Added `normalize_symbol_token()` in the backend and applied it to watchlist mutation paths and watchlist-adjacent symbol helpers.
- Normalized backend watchlists on `get_settings()` read and `save_watchlist()` write.
- Extended PHP regression coverage for watchlist snapshot invalidation plus watchlist normalization on read/write.

## Validation

- `npx eslint src/hooks/useSniperData.ts src/routes/account.tsx src/routes/live.tsx src/routes/signals.tsx src/routes/charts.tsx src/components/sniper/AppShell.tsx`
- `npm run build`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`

## Residual risks

- No live interactive backend session was available here to replay Account add/remove end-to-end through UI navigation and reload.
- Existing non-watchlist mojibake text remains in some route copy and should be handled separately if copy cleanup is desired.
