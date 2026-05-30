# Parity Audit Report - Phase 6 MT5 Signal Freshness

**Report Date**: 2026-05-30  
**Phase**: Phase 6 - MT5 Signal Engine Dual-Run  
**Auditor**: Codex automation  
**Status**: PASS with live-replay caveat

## Executive Summary

- Overall Parity: 100% synthetic parity gate.
- Threshold Required: 99%.
- Pass/Fail: PASS for synthetic parity and source-level guard verification.
- Trend: Stable versus 2026-05-29; signal candidate contract remains intact.

## Component Parity Metrics

### Fib Engine

| Metric | Pine Value | MT5 Value | Match | Accuracy |
|---|---|---|---|---:|
| M15/H1/H4/D1 tuples | synthetic baseline | synthetic MT5 | yes | 100% |
| Tuple coverage | 384 expected | 384 present | yes | 100% |
| Critical mismatches | 0 | 0 | yes | 100% |

### Regime Engine

| Metric | Pine Classification | MT5 Classification | Match | Accuracy |
|---|---|---|---|---:|
| Phase 6 dispatch source | backend/Pine comparison | `ComputeRegimeState()` | retained | 100% source guard |
| Stale-symbol evaluation | should not evaluate | skipped unless `IsLive()` | yes | 100% source guard |

### Signal Engine

| Metric | Pine Signal | MT5 Signal | Match | Accuracy |
|---|---|---|---|---:|
| Candidate contract | existing backend contract | unchanged | yes | 100% |
| Candidate freshness gate | fresh data only | `IsLive()` before fib/regime/signal evaluation | yes | 100% source guard |
| Drift diagnostics | `pine_match` / `drift_pips` | unchanged backend persistence | yes | verified by PHP contract test |

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---:|---|---|
| MT5 Phase 6 evaluated candidate signals without a per-symbol LIVE freshness precheck. | HIGH | 1 | Guard added before fib/regime/signal evaluation. | No after patch |

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Live terminal replay absent | Workspace cannot run MetaTrader/MetaEditor. | Requires external MT5 environment. | Yes, tracked as remaining risk |
| Synthetic parity only | `parity-validator.php` ran self-test mode. | No live replay input files were provided. | Yes, pending live capture |

## Recommendations

1. Capture one live Phase 6 terminal run with mixed LIVE and stale/closed symbols.
2. Confirm stale/closed symbols log skip messages and do not reach `/ea/signal-candidates`.
3. Keep Phase 7 execution gate disabled until Phase 6 live replay evidence is attached.

## Verification Checklist

- [x] Parity computed across synthetic tuples: 384/384 exact.
- [x] Multi-pair testing represented by synthetic EURUSD, USDJPY, and XAUUSD tuples.
- [x] Signal freshness guard verified before candidate input construction.
- [x] Backend candidate contract regression suite passed.
- [ ] MetaEditor compile completed.
- [ ] Live terminal replay completed.

## Artifacts

- `reports/phase6-signal-freshness-2026-05-30.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-30.md`
- `scripts/mt5-signal-dispatch.test.mjs`

