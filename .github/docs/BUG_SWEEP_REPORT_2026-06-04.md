# Executive Summary

- Overall health: targeted stabilization pass completed across frontend polling, backend REST/service storage, MT5 dispatch, parity scripts, and migration artifacts.
- Bugs found: 1 confirmed HIGH stale-truth defect in direct MT5 service persistence helpers.
- Fixes applied: MT5 tick/candle service writers now reject missing or malformed market timestamps instead of falling back to server receipt time.
- Remaining risks: Phase 4 parity regeneration is blocked by stale candle fixture files; Vitest startup is blocked by local `spawn EPERM` before tests execute.
- Migration readiness: backend timestamp truth improved; Phase 4 parity remains not ready until fresh candles are exported.

# Confirmed Problems

## HIGH - Fake-Fresh MT5 Service Rows

- Category: Refresh/stale-state integrity
- Component: WordPress backend market data service
- Root cause: `store_tick_snapshot()` and `store_candle_m1()` passed server-time fallbacks into `normalize_market_timestamp()`. Malformed tick times, and missing or malformed candle times, could be persisted with receipt time.
- Impact: direct service callers could manufacture fresh MT5 snapshot/candle rows, weakening backend authority and downstream signal readiness gates.
- Blocker: No for current patch; yes for any migration path relying on direct service helper ingestion without REST route guards.

## MEDIUM - Phase 4 Parity Regeneration Blocked

- Category: Migration parity validation
- Component: `scripts/run-phase4-parity.ps1` / `data/*`
- Root cause: candle fixtures are stale relative to the current MT5 export timestamp.
- Impact: Pine reference generation hard-fails before the validator runs, preventing a fresh June 4 Phase 4 parity score.
- Blocker: Yes for fresh Phase 4 parity governance.

## MEDIUM - Frontend Focused Test Startup Blocked

- Category: Verification environment
- Component: Vite/Vitest startup
- Root cause: local process spawn failure while Vite loads `vite.config.ts` and esbuild.
- Impact: focused frontend/API test suite did not execute in this run.
- Blocker: No for PHP backend patch; yes for claiming frontend regression coverage.

# Surgical Fixes Applied

- `wordpress/smc-superfib-sniper/class-market-data-service.php`
  - `store_tick_snapshot()` now normalizes tick timestamps with a `null` fallback and returns `false` when parsing fails.
  - `store_candle_m1()` now requires a `timestamp`, normalizes it with a `null` fallback, and returns `false` for missing or malformed candle times.
- `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
  - Added regression checks proving malformed tick timestamps are rejected.
  - Added regression checks proving missing and malformed candle timestamps are rejected.

# Parity Verification Results

- Fib parity: Fresh run blocked. `npm run parity:dry` failed because `data/EURUSD_*`, `data/USDJPY_*`, and `data/XAUUSD_*` candles are stale. Latest inspected stored gate artifact `reports/phase4-parity/phase4-gate-codex-run-2026-06-03.json` reports 0.26% overall parity and `FAIL`, but today's run did not produce a new validator result.
- Regime parity: No code changes to regime classification. Existing validator regression coverage passed through `php scripts/test-parity-validator-regression.php`.
- Signal parity: No signal-engine logic changed. Existing signal validator wrapper/counterpart regressions passed through `php scripts/test-parity-validator-regression.php`.
- Freshness parity: Improved. Backend direct service writes no longer convert invalid or missing quote/candle timestamps into fresh server-time rows.

# Remaining Risks

- Fresh Phase 4 parity requires refreshed candle exports before the Pine generator can run.
- `post_ea_market_stream()` still has an intentional server-time fallback for route-level stream timestamp absence; this was not changed because existing endpoint tests document it as active behavior.
- Frontend Vitest coverage remains unexecuted in this sandbox due to `spawn EPERM`.

# Regression Checklist

- Refresh tests: `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` passed.
- Stale detection tests: `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` passed.
- Signal readiness tests: `php scripts/test-parity-validator-regression.php` passed for signal validator contract cases.
- Backend sync tests: `npm run check:mql` passed include verification; EA market-stream PHP harness passed.
- Parity verification tests: `npm run parity:dry` failed at stale candle guard before parity validation.

# Safe Deployment Order

1. Deploy backend service timestamp guard patch.
2. Re-run PHP market-stream and market-data-service tests in the deployment branch.
3. Export fresh MT5 candles for EURUSD, USDJPY, and XAUUSD.
4. Re-run `npm run parity:dry`, then full `npm run parity` when MT5 export is available.
5. Re-run frontend focused tests in an environment where Vite/esbuild process spawn is allowed.

# Do Not Touch List

- Pine formulas and authority fib calculations.
- MT5 signal entry/SL/TP formulas.
- REST public route names and payload contracts.
- Existing endpoint-level server-time fallback without separate approval and migration-contract update.
