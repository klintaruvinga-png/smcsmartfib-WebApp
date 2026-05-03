# Parity Audit Report - Phase 6

**Report Date**: 2026-05-03  
**Phase**: 6 (Signal engine dual-run)  
**Auditor**: Code Bug Fix And Cleanup automation  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100% on covered backend pip-value conversion cases
- **Threshold Required**: 100% for the patched helper scope
- **Pass/Fail**: PASS
- **Trend**: Improving

Scope note: this audit covers the backend trade-plan pip-value conversion path touched in this run. It is not a full Pine vs MT5 signal replay.

---

## Component Parity Metrics

### Fib Engine (Phase 4)

| Metric | Pine Value | MT5 Value | Match | Accuracy |
|--------|-----------|----------|-------|----------|
| No fib code delta in this run | N/A | N/A | N/A | N/A |
| **Fib Parity Score** | - | - | - | **N/A** |

**Observations**: No fib-path code changed. A dedicated replay audit is still required before Phase 4 governance can advance.

---

### Regime Engine (Phase 5)

| Metric | Pine Classification | MT5 Classification | Match | Accuracy |
|--------|-------------------|------------------|-------|----------|
| No regime code delta in this run | N/A | N/A | N/A | N/A |
| **Regime Parity Score** | - | - | - | **N/A** |

**Observations**: No regime-path code changed. A dedicated replay audit is still required before Phase 5 governance can advance.

---

### Signal Engine (Phase 6)

| Metric | Pine Signal | MT5 Signal | Match | Accuracy |
|--------|------------|-----------|-------|----------|
| USDJPY pip value / lot | 6.392431 | 6.392431 | Yes | 100% |
| EURJPY pip value / lot | 6.392431 | 6.392431 | Yes | 100% |
| EURGBP pip value / lot | 12.675000 | 12.675000 | Yes | 100% |
| AUDCHF pip value / lot | 11.348162 | 11.348162 | Yes | 100% |
| USDCAD pip value / lot | 7.314219 | 7.314219 | Yes | 100% |
| EURCAD pip value / lot | 7.314219 | 7.314219 | Yes | 100% |
| Missing-reference fallback | 10.000000 | 10.000000 | Yes | 100% |
| **Signal Parity Score** | - | - | - | **100%** |

**Observations**: The backend now converts quote-currency pip value into USD using live/cached reference mids when available, then falls back to the static metadata value only when reference pricing is unavailable.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| Static `$10/pip` assumption on non-USD quoted forex pairs | HIGH | 1 | Fixed in backend trade-plan sizing helpers | No after patch |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Fib/regime sections not re-run | N/A | No code delta in this automation run | Yes |

---

## Recommendations

1. Run an end-to-end signal replay against Pine/MT5 for at least one JPY pair and one CAD/CHF quote pair.
2. Verify staging lot sizes after a forced engine batch so the corrected helper is exercised against real snapshots.
3. Keep the fallback path but treat it as degraded confidence when reference conversion prices are unavailable.

---

## Verification Checklist

- [x] Parity computed across covered regression cases
- [ ] Historical replay validated
- [ ] Multi-pair live staging verification completed
- [x] Edge cases analyzed for inverse and direct USD conversions
- [x] Drift root cause identified
- [x] Corrective actions documented

---

## Artifacts

- Test logs: `.github/migration/test-logs/phase-0-risk-sizing-2026-05-03.log`
- Comparison output: `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- Error logs: None in this run
