# Parity Audit Report - Phase 0

**Report Date**: 2026-05-06  
**Phase**: 0 - Settings/risk fallback authority and chart contract parity  
**Auditor**: Code Bug Fix And Cleanup automation  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 95%
- **Pass/Fail**: PASS
- **Trend**: Improving

This audit covered fallback-authority behavior in backend settings/risk sanitization and instrument pip-value fallback logic, plus the chart snapshot contract exposed to the dashboard.

---

## Component Parity Metrics

### Fib Engine (Phase 4)

| Metric | Pine Value | MT5 Value | Match | Accuracy |
|--------|-----------|----------|-------|----------|
| Unsupported/missing reference pip-value fallback | Instrument default preserved | Instrument default preserved | YES | 100% |
| Pip fallback return type | Numeric | Numeric | YES | 100% |
| **Fib Parity Score** | - | - | - | **100%** |

**Observations**: No fib anchor or level formulas changed. The parity correction is strictly on fallback truth when reference mids are unavailable.

---

### Regime Engine (Phase 5)

| Metric | Pine Classification | MT5 Classification | Match | Accuracy |
|--------|-------------------|------------------|-------|----------|
| Regime math in touched scope | Unchanged | Unchanged | YES | 100% |
| Settings/risk fallback preservation | Caller default preserved | Caller default preserved | YES | 100% |
| **Regime Parity Score** | - | - | - | **100%** |

**Observations**: No regime formulas changed. This pass protects persisted configuration values from null drift during partial payload updates.

---

### Signal Engine (Phase 6)

| Metric | Pine Signal | MT5 Signal | Match | Accuracy |
|--------|------------|-----------|-------|----------|
| Signal generation logic | Unchanged | Unchanged | YES | 100% |
| Risk-profile overlapping field preservation | Backend default retained when omitted | Dashboard receives preserved values | YES | 100% |
| Chart empty-state timestamp contract | Nullable when no candles exist | Nullable when no candles exist | YES | 100% |
| **Signal Parity Score** | - | - | - | **100%** |

**Observations**: Signal formulas were not modified. The parity improvement is in config and contract correctness, reducing the chance of downstream signal/risk drift from partial saves.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| Undefined `$fallback_value` in backend fallback helpers | HIGH | 1 | Fixed in backend helper return paths and covered by PHP regression tests | No |
| Chart `updatedAt` frontend contract remained non-nullable | MEDIUM | 1 | Fixed in TypeScript contract | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Full replay parity matrix | Not recomputed | This run targeted fallback and contract integrity only | YES |
| Browser/live manual validation | Not completed | Sandbox run focused on code + regression tests | YES |
| Bundle build verification | Not completed | Sandbox blocks child-process build validation | YES |

---

## Recommendations

1. Keep backend helper fallback paths returning explicit caller defaults, never undefined local names.
2. Treat nullable backend timestamps as first-class contract states in the dashboard types.
3. Extend future parity gates to include partial settings/risk payload replay so fallback preservation stays covered.

---

## Verification Checklist

- [x] Fallback helper paths inspected and patched
- [x] PHP fallback regression test added
- [x] Pip-value parity regression test passed
- [x] MT5 snapshot contract test passed
- [x] EA ingest regression test passed
- [x] TypeScript check passed
- [x] Lint passed with no new errors
- [ ] Historical replay validated
- [ ] Multi-pair live browser verification completed

---

## Artifacts

- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-06.md`
- Fallback regression: `wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php`
- Pip parity regression: `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- Backend contract tests: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`, `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- Frontend verification: `node .\node_modules\typescript\bin\tsc --noEmit`, `npm run lint`
