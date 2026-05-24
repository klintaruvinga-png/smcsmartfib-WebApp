# Bug Sweep Report — 2026-05-24

# Executive Summary

- overall health: stable after a focused backend freshness-truth pass on the engine snapshot path
- bugs found: 1 confirmed HIGH issue in backend diagnostics freshness reporting
- fixes applied: removed synthetic quote timestamps from missing-price engine diagnostics and added regression coverage
- remaining risks: dedicated regime replay and multi-case signal replay suites are still not in the focused daily run set
- migration readiness: conditional pass for this slice; freshness truth improved without contract drift

**Report Date**: 2026-05-24  
**Phase**: Phase 2 - Engine freshness and diagnostic parity  
**Scanner**: Codex automation (`code-bug-fix-and-cleanup`)  
**Scan Duration**: approx. 17 minutes

## Summary

- **Total Issues Found**: 1
- **Critical Issues**: 0
- **High Priority Issues**: 1
- **Medium Priority Issues**: 0
- **Low Priority Issues**: 0
- **Test Coverage**: Focused backend regression pass across 3 PHP suites

## Confirmed Problems

| Severity | Category | Component | Root Cause | Impact | Blocker |
|---|---|---|---|---|---|
| HIGH | Refresh / stale-state truth | `build_symbol_state()` backend diagnostics | Missing-price fallback synthesized `updatedAt = gmdate('c')` instead of preserving quote absence | Admin/engine diagnostics could imply recent quote movement when no authoritative quote existed, weakening stale-data governance during migration triage | No |

## Surgical Fixes Applied

| File | Change | Hardening / Regression Protection |
|---|---|---|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Missing-price placeholder now keeps `updatedAt => null` instead of fabricating a current timestamp | Prevents fake freshness in `lastPriceAt` diagnostics while preserving stale/blocked state behaviour |
| `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | Seeded candle-only `GBPUSD` case and asserted `QUOTE_UNAVAILABLE` plus explicit `lastPriceAt === null` | Locks the defect path against future regressions |

## Parity Verification Results

- fib parity: PASS on covered cases; chart snapshot still reports last candle time as `updatedAt`
- regime parity: PASS on covered cases; quote-unavailable path stays blocked/stale without synthetic timestamps
- signal parity: PASS on covered cases; missing-quote path remains `QUOTE_UNAVAILABLE` and cannot qualify a backend-confirmed signal
- freshness parity: PASS; missing quotes no longer masquerade as freshly updated diagnostics

## Test Failure Summary

| Test | Status | Result |
|---|---|---|
| `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | PASS | No syntax errors |
| `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | PASS | Snapshot contract and missing-quote freshness regression passed |
| `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` | PASS | Snapshot freshness invalidation still passed |
| `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` | PASS | MT5 source/timestamp persistence contract still passed |

## Remaining Risks

- Dedicated regime replay parity remains outside this focused run; no broader classification matrix was re-executed today.
- Multi-case signal replay parity still lacks a daily focused suite, so broader migration drift could still hide outside the freshness path patched here.
- Existing unrelated dirty worktree files under `reports/` were left untouched.

## Regression Checklist

- [x] refresh tests: snapshot freshness regression suite passed
- [x] stale detection tests: missing-quote diagnostics now assert null `lastPriceAt`
- [x] signal readiness tests: `QUOTE_UNAVAILABLE` blocker preserved
- [x] backend sync tests: market-data source filter contract passed
- [x] parity verification tests: chart `updatedAt` authority assertion still passed

## Safe Deployment Order

1. Deploy backend PHP patch for `build_symbol_state()` timestamp truth.
2. Run the focused PHP regression trio in the target environment.
3. Re-run broader regime/signal replay coverage before any migration phase gate that depends on engine parity narratives.

## Do Not Touch List

- `post_execute_signals()` backend confirmation gate without separate approval
- MT5 snapshot canonicalization contract on `/snapshot` and `/ea/market-stream`
- stale-threshold enforcement in `ensure_engine_snapshot()` and cached MT5 quote reads
