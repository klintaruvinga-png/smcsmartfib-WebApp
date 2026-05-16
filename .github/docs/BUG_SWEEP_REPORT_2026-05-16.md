# Executive Summary

- Report Date: 2026-05-16
- Phase: Phase 0 - MT5-native stabilization
- Scanner: Codex automation (`code-bug-fix-and-cleanup`)
- Scope: Live Radar freshness truth, MT5 market-data timestamp authority, watchlist snapshot integrity, fib/freshness parity spot-checks
- Overall health: Stable on verified freshness and MT5 authority paths after patching
- Bugs found this run: 2 confirmed high-severity issues
- Fixes applied: 2 surgical patches with new regression coverage
- Remaining risks: full-workspace TypeScript drift outside touched files; regime/signal generation parity not fully re-executed this run
- Migration readiness: Proceed for scoped freshness-authority surfaces

## Summary

- Total Issues Found: 2
- Critical Issues: 0
- High Priority Issues: 2
- Medium Priority Issues: 0
- Low Priority Issues: 0
- Scoped verification pass rate: 100% of executed suites (7/7)

## Confirmed Problems

| Severity | Category | Issue | Root Cause | Impact | Blocker |
|---|---|---|---|---|---|
| HIGH | Dashboard truth / refresh | Live Radar rendered stale/offline MT5 symbols as `awaiting snapshot` placeholders | `src/routes/live.tsx` treated any non-`live` MT5 row as pending instead of preserving backend state | Operators could miss stale or offline backend truth and misread dead data as missing data | No after patch |
| HIGH | Backend freshness authority | `SMC_MarketData_Service` persisted server receipt time instead of MT5 payload time for ticks/candles | `wordpress/smc-superfib-sniper/class-market-data-service.php` ignored tick timestamp and partially normalized candles | Freshness age could drift from quote time and create fake-live authority reads on service consumers | No after patch |

## Root Cause / Analysis

- The Live Radar route had a UI gating bug, not a backend bug. `PriceCard` already knew how to render stale state, but `LivePage` never let stale/offline MT5 rows reach that renderer.
- The market-data service had drift from the main plugin’s timestamp hardening. The REST plugin already normalizes MT5 timestamps correctly; the service class lagged behind and could reintroduce quote-time corruption on write paths.
- No Pine formula, signal math, or backend engine flow rewrites were required.

## Surgical Fixes Applied

| File | Fix |
|---|---|
| `src/routes/live.tsx` | Replaced inline pending-card gate with a scoped helper so MT5 stale/offline rows remain visible on Live Radar |
| `src/routes/live.utils.ts` | Added a focused backend-truth helper for pending-card decisions |
| `src/routes/-live.test.ts` | Added regression coverage for stale/offline MT5 visibility and true pending fallback |
| `wordpress/smc-superfib-sniper/class-market-data-service.php` | Normalized MT5 tick/candle timestamps to UTC MySQL format before persistence; snapshot `updated_at` now preserves quote time |
| `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` | Added regression coverage for tick timestamp persistence and canonical M1 candle timestamp normalization |

## Exact Logic Hardened

- Live Radar now hides cards only when the backend has not emitted an MT5 snapshot yet.
- MT5 stale/offline prices are no longer collapsed into a generic placeholder.
- Market-data service writes now preserve MT5 event time rather than server receipt time.
- MT5 dot-format timestamps (`YYYY.MM.DD HH:MM:SS`) are normalized consistently in the service class.

## Regression Protections Added

- Frontend route regression:
  - `npx vitest run src/routes/-live.test.ts`
- Backend service regression:
  - `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`

## Parity Verification Results

- Fib parity: PASS on executed parity harnesses (`test-fib-parity.php`, `test-htf-authority-anchor.php`, `test-session-anchors.php`, `test-pip-value-parity.php`)
- Regime parity: Not re-executed end-to-end this run; no regime-calculation code changed
- Signal parity: Freshness/blocker contract PASS on executed MT5 snapshot contract harness; full signal-generation replay not re-run
- Freshness parity: PASS on executed Live Radar and MT5 snapshot/service timestamp regressions

## Verification / Acceptance Criteria

- Live Radar must show stale/offline MT5 symbols as their true backend state, not as missing data
- MT5 market-data persistence must keep quote/candle event time authoritative
- Watchlist snapshot invalidation must remain intact after the patch set
- Existing MT5 freshness guards must still degrade stale symbols to `PRICE_STALE`

## Regression Checklist

- [x] Live Radar stale/offline visibility test passed
- [x] Market-data service timestamp persistence test passed
- [x] MT5 snapshot contract test passed
- [x] Watchlist snapshot regression test passed
- [x] Fib parity test passed
- [x] HTF authority anchor parity test passed
- [x] Session anchor parity test passed
- [x] Pip-value regression test passed
- [ ] Full-workspace TypeScript check clean

## Verification Commands

```powershell
npx vitest run src/routes/-live.test.ts
php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php
php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php
php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php
php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php
php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php
php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php
php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php
```

## Remaining Risks

- `npx tsc --noEmit` still fails in untouched files:
  - `src/components/PlanCard.tsx`
  - `src/routes/-plan.test.tsx`
  - `src/routes/charts.tsx`
- Full regime-classification parity and full signal-generation parity were not replayed this run.
- `SMC_MarketData_Service` and the main plugin still duplicate timestamp normalization logic; future changes must keep them aligned.

## Safe Deployment Order

1. Deploy the backend service timestamp patch first.
2. Deploy the frontend Live Radar visibility patch.
3. Run the MT5 snapshot + watchlist regression harnesses in staging.
4. Confirm stale/offline MT5 symbols visibly degrade in the dashboard before production promotion.

## Do Not Touch List

- Pine trading formulas without a separate parity proof
- Backend signal-engine decision math in `run_engine_for_symbols` without replay evidence
- Stale/freshness thresholds in backend authority code without coordinated parity review
