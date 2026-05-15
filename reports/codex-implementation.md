# Codex Implementation Summary

## Issue summary

The dashboard/admin health surfaces could render stale `feedStatus` after the backend had already
transitioned, because the frontend `["engine-health"]` query inherited the router's global 10
second stale window. Backend authority and display fallback logic were already correct.

## Root cause implemented

Applied the smallest safe interpretation of the contract: override the `["engine-health"]` query
with `staleTime: 0` so backend health becomes eligible for refresh on every existing poll cycle.
The conditional watchlist invalidation change was not applied because the current checkout already
includes `["engine-health"]` cancel/invalidate/refetch wiring in the watchlist cascade.

## Exact files changed

- `src/hooks/useSniperData.ts`
- `src/hooks/useSniperData.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-15_dashboard-feedstatus-truth-gap.md`
- `.github/migration/audits/phase-0-dashboard-parity-2026-05-15.md`
- `reports/codex-implementation.md`

## Tests run

- `rg -n "engine-health" src/hooks/useSniperData.ts`
- `rg -n "staleTime" src/hooks/useSniperData.ts src/router.tsx`
- `rg -n "invalidateQueries" src/hooks/useSniperData.ts`
- `npx vitest run src/hooks/useSniperData.test.tsx`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `npx tsc --noEmit` — failed on pre-existing unrelated repo errors in `src/components/PlanCard.tsx`, `src/routes/-plan.test.tsx`, and `src/routes/charts.tsx`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-15_dashboard-feedstatus-truth-gap.md`
- `.github/migration/audits/phase-0-dashboard-parity-2026-05-15.md`
- `reports/codex-implementation.md`

## Remaining risks

- Live soak evidence is still required to verify admin/dashboard chips converge with backend
  `feedStatus` within <=2 seconds after a transition.
- Full repo typecheck is currently blocked by unrelated pre-existing TypeScript errors outside this
  patch.

## Any contract ambiguities resolved during implementation

- The contract's conditional watchlist invalidation fix was interpreted strictly: no invalidation
  code was added because `["engine-health"]` was already present in the existing watchlist
  cancellation, invalidation, and active-refetch cascade.
- The contract required parity re-validation, but no live soak could be executed from this local
  environment. I generated the required parity audit as pending and recorded the exact live checks
  still required.
- The migration board and soak tracker were already dirty with unrelated local edits before this
  task. To avoid silently bundling unrelated tracker changes into the PR, I left those files out
  of the staged patch and captured the patch status in the new bug-sweep/parity artifacts instead.
