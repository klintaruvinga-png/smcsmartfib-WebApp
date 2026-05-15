# Phase 0 Dashboard Parity Audit

Date: 2026-05-15
Surface: backend-owned `feedStatus` health query freshness
Status: PENDING

## Parity statement

This patch does not change backend health computation, Pine formulas, or frontend display logic.
It revalidates the dashboard/backend authority boundary by removing the inherited 10 second cache
window from the `["engine-health"]` query so the UI can reflect backend `feedStatus` within the
existing poll cadence.

## Confirmed parity checks

- Backend remains the sole authority for `feedStatus`; no client-side aggregation or optimistic
  signal truth was introduced.
- `src/routes/admin.tsx` and `src/routes/signals.tsx` continue to consume the existing
  `feedStatus ?? priceFeed` fallback chain unchanged.
- The watchlist mutation cascade already included `["engine-health"]` cancellation, invalidation,
  and active refetch, so no query-key wiring drift was found.
- The router-level global `staleTime: 10_000` remains unchanged for every other query.

## Validation evidence

- `npx vitest run src/hooks/useSniperData.test.tsx` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — PASS
- `npx tsc --noEmit` — FAIL on pre-existing unrelated repo errors outside this patch

## Live verification still required

- Confirm backend `[PHASE0_SOAK] Final feed status ... RESULT=live|stale` transitions are
  reflected by the admin/dashboard chips within <=2 seconds.
- Confirm admin health and signals status chip render the same `feedStatus` after a live backend
  transition.

## Audit result

Parity is preserved at the backend/dashboard authority boundary for this patch, but the migration
gate remains pending until live soak evidence confirms the runtime convergence window.
