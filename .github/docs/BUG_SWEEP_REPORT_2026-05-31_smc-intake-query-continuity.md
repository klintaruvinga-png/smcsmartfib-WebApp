# Bug Sweep Report - 2026-05-31 - SMC Intake Query Continuity

## Issue

SMC Intake plan cards could flicker or drop pending/blueprint cards during polling when the live-signal and ladder query observers entered a pending-without-data state.

## Runtime integrity surface

- Dashboard query synchronization layer: `src/hooks/useSniperData.ts`
- Plan-page source data: backend-owned `["live-signals"]` and `["ladders"]`
- Downstream UI path: `src/routes/-plan.page.tsx` signal-to-ladder join and top-3 ranking

## Confirmed patch

- Added TanStack Query v5 `placeholderData: keepPreviousData` to `useLiveSignals()`.
- Added TanStack Query v5 `placeholderData: keepPreviousData` to `useLadders()`.
- Preserved query keys, API calls, polling enablement, `staleTime: 0`, `structuralSharing: false`, `refetchInterval`, and existing ladder polling diagnostics.
- Did not change route ranking, join keys, execution gates, backend contracts, Pine formulas, MT5 logic, or cache invalidation behavior.

## Regression coverage

- `src/hooks/useSniperData.test.tsx` now asserts `useLiveSignals()` keeps `placeholderData: keepPreviousData` while retaining stale-time, structural-sharing, enablement, and polling cadence.
- `src/hooks/useSniperData.test.tsx` now covers `useLadders()` query key, enablement, polling cadence, and previous-data continuity option.
- Existing `src/routes/-plan.test.tsx` coverage remains unchanged and validates plan ranking/execution guards.

## Validation

- `npx vitest run src/hooks/useSniperData.test.tsx` - passed, 10 tests.
- `npx vitest run src/routes/-plan.test.tsx` - passed, 22 tests.
- `npm run validate:impl` - passed after adding the required implementation metadata file.

## Remaining risk

Manual browser verification against a real or staging backend is still required for slow-network and candle-boundary observation. This patch does not synthesize ladder truth for new signal IDs; a legitimate backend signal-ID change can still render pending or no-blueprint until the matching backend ladder arrives.

## Parity impact

No formula, MT5, Pine, backend, or schema parity changes were made. No parity audit is required for this frontend observer-option patch.
