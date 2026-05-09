# Phase 0 Dashboard-JS Parity Audit

Date: 2026-05-09
Surface: Watchlist authority parity between Dashboard-JS consumers and WordPress persistence

## Objective

Re-validate that the dashboard and backend consume the same canonical watchlist symbols after add/remove persistence changes, without weakening stale-data protections or moving authority to the frontend.

## Re-validated parity points

1. Canonical frontend source
   - `useUserSettings()` now normalizes `watchlist` before caching.
   - `useCanonicalWatchlist()` exposes the canonical list and set used by dashboard consumers.

2. Consumer parity
   - `src/routes/live.tsx` gates MT5 price cards from the canonical watchlist set.
   - `src/routes/signals.tsx` recomputes `watchlistOnly` filtering from the canonical watchlist set.
   - `src/routes/charts.tsx` re-clamps chart selection from the canonical watchlist set.
   - `src/components/sniper/AppShell.tsx` header ticker now uses the same canonical set.
   - `src/routes/account.tsx` keeps its draft watchlist aligned to the canonical `user-settings` cache after mutations.

3. Backend authority
   - `get_settings()` now normalizes persisted watchlists before downstream engine/snapshot reads.
   - `save_watchlist()` now persists canonical uppercase de-duplicated watchlists.
   - `/user/watchlist/add` and `/user/watchlist/remove` now normalize lowercase payload symbols correctly through shared backend normalization.

4. Snapshot invalidation protection
   - Existing `delete_engine_snapshot()` invalidation remains intact.
   - PHP regression coverage still asserts snapshot invalidation and now also asserts canonical watchlist normalization.

## Validation evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npx eslint src/hooks/useSniperData.ts src/routes/account.tsx src/routes/live.tsx src/routes/signals.tsx src/routes/charts.tsx src/components/sniper/AppShell.tsx`
- `npm run build`

## Outcome

Parity improved and re-validated for watchlist symbol identity and consumer gating. No Pine formula or signal-ranking logic was changed. Backend remains the source of truth; frontend changes are canonicalization and consumer wiring only.

## Remaining gap

Interactive parity confirmation against a live backend session and browser navigation was not executed in this environment, so runtime UI verification after add/remove and page reload remains a manual follow-up.
