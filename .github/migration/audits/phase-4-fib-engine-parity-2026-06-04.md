# Parity Audit Report - Phase 4

**Report Date**: 2026-06-04  
**Phase**: Phase 4 - Fib Engine Parity  
**Auditor**: Codex automation `code-bug-fix-and-cleanup`  
**Status**: FAIL - blocked by stale candle inputs

---

## Executive Summary

- **Overall Parity**: Not freshly computed on 2026-06-04.
- **Threshold Required**: 99%.
- **Pass/Fail**: FAIL.
- **Trend**: Degrading / blocked. Latest inspected stored gate artifact from 2026-06-03 reports 0.26% overall parity with 383 critical mismatches; today's dry run stopped earlier at the candle staleness guard.

---

## Component Parity Metrics

### Fib Engine (Phase 4)

| Metric | Pine Value | MT5 Value | Match | Accuracy |
|--------|-----------|----------|-------|----------|
| Required tuple coverage | Blocked by stale candles | 384 MT5 rows available | No | Not computed |
| Candle freshness | Stale fixture files | MT5 export timestamp 2026-06-03T17:25:05Z | No | 0% readiness |
| Validator execution | Did not run | Did not run | No | Blocked |
| **Fib Parity Score** | - | - | - | **Not fresh; latest stored artifact 0.26%** |

**Observations**: `npm run parity:dry` confirmed the Pine generator hard-fails stale candle files before validator execution. This is correct protective behavior and prevents fake parity claims.

---

### Regime Engine (Phase 5)

| Metric | Pine Classification | MT5 Classification | Match | Accuracy |
|--------|-------------------|------------------|-------|----------|
| Validator contract | Accepted keyed payloads | Accepted keyed payloads | Yes | Covered by regression |
| Missing counterpart handling | Critical mismatch | Critical mismatch | Yes | Covered by regression |
| **Regime Parity Score** | - | - | - | **No fresh market replay run** |

**Observations**: No regime-engine code changed in this run.

---

### Signal Engine (Phase 6)

| Metric | Pine Signal | MT5 Signal | Match | Accuracy |
|--------|------------|-----------|-------|----------|
| Signal payload wrappers | `signals` accepted | `candidates` accepted | Yes | Covered by regression |
| No-counterpart detection | `NO_MT5` detected | `NO_PINE` detected | Yes | Covered by regression |
| **Signal Parity Score** | - | - | - | **No fresh market replay run** |

**Observations**: No MT5 signal formula, AOV, RR, entry, SL, or TP logic changed in this run.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| Stale Phase 4 candle files block Pine reference generation | MEDIUM | 12 files warned | Export fresh MT5 candles, then rerun parity | Yes |
| Latest inspected stored Phase 4 gate artifact is failed | HIGH | 383 critical mismatches | Requires fresh candle/export alignment before root-cause parity work | Yes |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| None accepted in this run | N/A | Validator did not run on fresh inputs | No |

---

## Recommendations

1. Refresh `data/EURUSD_*`, `data/USDJPY_*`, and `data/XAUUSD_*` from MT5 before rerunning Phase 4 parity.
2. Rerun `npm run parity:dry`; if the Pine generator passes, rerun the full `npm run parity`.
3. Use the next fresh gate artifact to separate stale-fixture failure from actual fib anchor/level drift.

---

## Verification Checklist

- [x] Parity command invoked.
- [x] Staleness guard behavior confirmed.
- [ ] Fresh parity computed across required symbol/timeframe matrix.
- [ ] Drift root causes identified from a fresh validator run.
- [ ] Corrective actions documented for any remaining mismatches.

---

## Artifacts

- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-06-04.md`
- Latest inspected stored gate: `reports/phase4-parity/phase4-gate-codex-run-2026-06-03.json`
- Command evidence: `npm run parity:dry` failed during Pine reference generation due stale candles.
