# Executive Summary

- Overall health: stable after focused stabilization scan; one regression-suite contract drift was confirmed and patched.
- Bugs found: 1 MEDIUM frontend regression coverage drift in the live-signals board-size contract.
- Fixes applied: updated `useLiveSignals()` regression coverage to assert the current default board-size query key and mock the active display-signals client method.
- Remaining risks: live MT5 terminal replay and authenticated production REST capture are still unavailable in this workspace.
- Migration readiness: PASS for synthetic parity and focused backend/dashboard/MT5 gates; conditional on live MT5 replay for operational signoff.

# Confirmed Problems

| Category                                        | Severity | Root Cause                                                                                                                                                                                                                                                                                                                 | Impact                                                                                                                                                                                        | Blocker |
| ----------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Regression protection / dashboard signal wiring | MEDIUM   | `src/hooks/useSniperData.test.tsx` still expected the pre-board-size `["live-signals"]` query key while runtime code intentionally keys display boards as `["live-signals", boardSize]`. The test mock also only exposed the legacy `getLiveSignals` method even though `useDisplaySignals()` calls `getDisplaySignals()`. | Focused signal polling regression suite failed, reducing confidence in board-size cache isolation and broad invalidation coverage during the migration. Runtime signal logic was not changed. | No      |

# Surgical Fixes Applied

- `src/hooks/useSniperData.test.tsx`
  - Added `apiMocks.getDisplaySignals` to mirror the active hook dependency.
  - Updated the live-signals polling regression to assert `queryKey: ["live-signals", 3]`, the default display-board size used by `useLiveSignals()`.
  - Kept assertions for `enabled`, `staleTime: 0`, `structuralSharing: false`, `placeholderData: keepPreviousData`, and the settings-driven poll cadence.
  - Added a `queryFn` shape assertion so the test continues to verify an executable query contract.

# Parity Verification Results

| Area             | Result                           | Evidence                                                                                              |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Fib parity       | 100% synthetic parity            | `php scripts/parity-validator.php`; `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` |
| Regime parity    | No calculation drift detected    | `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`                          |
| Signal parity    | No signal formula drift detected | `npx vitest run ... scripts/mt5-signal-dispatch.test.mjs`; backend signal board contract test passed  |
| Freshness parity | Stable                           | Backend stale-price, live-candle, cache, and health regressions passed                                |

# Remaining Risks

- Live MetaTrader terminal replay was not available, so real broker tick, candidate, and market-stream replay remains pending.
- Authenticated production REST inspection was not available from this workspace.
- `npm run build` still reports pre-existing oversized chunk warnings; build exits successfully.

# Regression Checklist

- [x] Refresh tests: focused React Query polling tests passed.
- [x] Stale detection tests: MT5 snapshot contract checks passed.
- [x] Signal readiness tests: MT5 signal dispatch test passed inside the focused Vitest run.
- [x] Backend sync tests: MT5 snapshot contract and market data source filter checks passed.
- [x] Parity verification tests: fib parity and synthetic parity validator passed.
- [ ] Live MT5 replay: pending outside this workspace.

# Safe Deployment Order

1. Merge the regression-test correction only after CI repeats the focused signal polling suite.
2. Deploy no runtime frontend/backend changes from this patch; runtime artifacts are unchanged.
3. Run live MT5 replay for `/ea/market-stream`, `/ea/signal-candidates`, `/snapshot`, `/live-signals`, and `/ladders` before operational signoff.

# Do Not Touch List

- Pine trading formulas.
- MT5 signal entry, SL, TP, and lot-sizing formulas.
- Backend stale-data rejection and freshness authority.
- Live signal board persistence and lifecycle arbiter logic.
- Fib anchor and regime classification formulas.

# Verification Commands

| Command                                                                                                                                                                                                                                                                                         | Result                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `npx vitest run src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx src/lib/api/sniperClient.test.ts src/routes/-live.test.ts src/routes/-signals.page.test.tsx scripts/mt5-signal-dispatch.test.mjs scripts/pipeline-watcher.test.mjs scripts/workflow-state.test.mjs` | PASS, 8 files / 35 tests               |
| `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`                                                                                                                                                                                                                    | PASS                                   |
| `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`                                                                                                                                                                                                        | PASS                                   |
| `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`                                                                                                                                                                                                            | PASS                                   |
| `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`                                                                                                                                                                                                                               | PASS                                   |
| `npm run check:mql`                                                                                                                                                                                                                                                                             | PASS                                   |
| `php scripts/parity-validator.php`                                                                                                                                                                                                                                                              | PASS, 100% synthetic parity            |
| `npm run build`                                                                                                                                                                                                                                                                                 | PASS with existing chunk-size warnings |
| `node scripts/validate-implementation.mjs`                                                                                                                                                                                                                                                      | PASS                                   |
