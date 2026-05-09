# Phase 0 Watchlist Parity Audit

Date: 2026-05-09
Scope: Dashboard-JS watchlist consumers vs WordPress persisted watchlist authority

## Parity contract

- Backend persisted watchlist remains the source of truth.
- Frontend may optimistically update the `user-settings` cache, but only backend watchlist mutation responses or persisted settings reads can author the canonical symbol set.
- Snapshot-backed sections must not continue rendering symbols removed from the canonical watchlist.

## Paths re-validated

1. Account write path
   - `src/routes/account.tsx`
   - `src/hooks/useSniperData.ts`
   - Result: duplicate prevention, optimistic updates, rollback, and post-success canonical cache writes remain intact.

2. Live Radar
   - `src/routes/live.tsx`
   - Result: visible price cards are now ordered and filtered from the same canonical watchlist helper.

3. Header ticker
   - `src/components/sniper/AppShell.tsx`
   - Result: header symbols now follow the same canonical watchlist order and membership gate as Live Radar.

4. Charts
   - `src/routes/charts.tsx`
   - Result: selected symbol is deterministically clamped to the current watchlist or safe empty state.

5. Signals
   - `src/routes/signals.tsx`
   - Result: `watchlistOnly` candidates recompute directly from the current canonical watchlist set.

6. Backend persisted settings save
   - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
   - `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
   - Result: watchlist changes saved through `POST /user/settings` now invalidate `smc_sf_engine_snapshot`.

## Validation evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npx eslint src/hooks/useSniperData.ts src/routes/account.tsx src/routes/live.tsx src/routes/signals.tsx src/routes/charts.tsx src/components/sniper/AppShell.tsx`
- `npm run build`

## Outcome

Parity restored for the audited watchlist paths. No Pine formulas, signal math, or backend authority rules were changed.

## Remaining gaps

- Live backend-session manual verification remains pending.
- Full repository lint still has unrelated pre-existing failures outside this patch.
