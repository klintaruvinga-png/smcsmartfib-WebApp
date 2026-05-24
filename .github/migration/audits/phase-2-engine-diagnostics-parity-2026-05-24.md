# Executive Summary

- overall health: PASS for the focused engine-diagnostics freshness slice
- bugs found: one confirmed synthetic-timestamp defect in missing-quote diagnostics
- fixes applied: authoritative null quote timestamp preserved; regression added
- remaining risks: broader regime/signal replay parity remains a separate follow-up item
- migration readiness: guarded PASS for engine freshness truth

**Report Date**: 2026-05-24  
**Phase**: Phase 2 - Engine diagnostics parity  
**Auditor**: Codex automation (`code-bug-fix-and-cleanup`)  
**Status**: PASS

## Parity Summary

- **Overall Parity**: 100% on covered freshness/diagnostic cases
- **Threshold Required**: 95%
- **Pass/Fail**: PASS
- **Trend**: Stable

## Component Parity Metrics

### Fib Engine

| Metric | Backend / Dashboard Value | Expected Authority | Match | Accuracy |
|---|---|---|---|---|
| Chart snapshot `updatedAt` | last candle time | last candle time | Yes | 100% |
| Non-MT5 quote guard | blocked before fib-driven engine analysis | blocked before fib-driven engine analysis | Yes | 100% |
| **Fib Parity Score** | - | - | - | **100% (covered cases)** |

Observations: No fib anchor or level drift was introduced by the diagnostic timestamp patch. The covered check stayed limited to chart timestamp authority and non-MT5 engine guarding.

### Regime Engine

| Metric | Backend Classification | Expected Classification | Match | Accuracy |
|---|---|---|---|---|
| Missing quote with candle history | `QUOTE_UNAVAILABLE` / stale-blocked | `QUOTE_UNAVAILABLE` / stale-blocked | Yes | 100% |
| Missing quote `lastPriceAt` | `null` | `null` | Yes | 100% |
| **Regime Parity Score** | - | - | - | **100% (covered cases)** |

Observations: The patch removes fake freshness from regime diagnostics without altering the stale/blocking state machine.

### Signal Engine

| Metric | Backend Signal Result | Expected Result | Match | Accuracy |
|---|---|---|---|---|
| Missing quote readiness | no backend-confirmed signal path | no backend-confirmed signal path | Yes | 100% |
| Engine blocker propagation | `QUOTE_UNAVAILABLE` | `QUOTE_UNAVAILABLE` | Yes | 100% |
| **Signal Parity Score** | - | - | - | **100% (covered cases)** |

Observations: Covered signal parity stayed intact because the missing-quote path remains non-executable and no frontend-only truth was introduced.

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---|---|---|
| Synthetic quote timestamp in missing-price diagnostics | HIGH | 1 | Patched in backend and locked with regression | No |

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Daily regime replay matrix | Not re-run in this focused pass | This audit targeted freshness-truth diagnostics only | Yes |
| Multi-case signal replay suite | Not re-run in this focused pass | Existing known gap from prior automation memory | Yes |

## Recommendations

1. Keep this patch bundled with the focused PHP regression trio for any Phase 2 or Phase 3 backend deployment.
2. Add a dedicated regime replay suite to the focused automation run set before the next migration gate.
3. Add a multi-case signal replay suite so parity percentages are backed by broader daily evidence rather than focused freshness cases only.

## Verification Checklist

- [x] Parity computed for the covered freshness and diagnostic cases exercised in this run
- [ ] Historical replay validated
- [ ] Multi-pair testing completed beyond focused regression symbols
- [x] Edge case analyzed: candle history present with no authoritative quote
- [x] Drift root cause identified
- [x] Corrective actions documented

## Artifacts

- Test logs: `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- Test logs: `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- Test logs: `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- Comparison output: git diff for `build_symbol_state()` timestamp truth and regression additions
