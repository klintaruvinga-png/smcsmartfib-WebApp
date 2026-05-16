# Parity Audit Report - Phase 0 Freshness Authority

**Report Date**: 2026-05-16  
**Phase**: Phase 0 - MT5-native stabilization  
**Auditor**: Codex automation (`code-bug-fix-and-cleanup`)  
**Status**: PASS (scoped freshness-authority surfaces)

---

## Executive Summary

- Overall parity: 100% on executed freshness-authority checks
- Threshold required: 95% scoped pass rate
- Pass/Fail: PASS
- Trend: Stable
- Scope note: This audit covers freshness truth, MT5 snapshot/candle timestamp authority, and related fib-anchor parity harnesses. It is not a full historical replay of regime and signal generation.

---

## Component Parity Metrics

### Fib Engine

| Metric | Pine Value | Backend/MT5 Value | Match | Accuracy |
|---|---|---|---|---|
| Fib parity harness | Expected baseline fixtures | PHP parity harness passed | Yes | 100% |
| HTF authority anchor | Expected prior-session anchors | PHP authority-anchor harness passed | Yes | 100% |
| Session anchors | Expected F1/F2/F3 anchors | PHP session-anchor harness passed | Yes | 100% |
| Pip-value parity | Expected instrument pip values | PHP pip-value harness passed | Yes | 100% |
| **Fib Parity Score** | - | - | - | **100%** |

Observations: No fib-anchor drift was introduced by this run. No fib formulas were changed.

---

### Regime Engine

| Metric | Pine Classification | Backend/MT5 Classification | Match | Accuracy |
|---|---|---|---|---|
| Regime classification replay | Not re-executed | Not re-executed | N/A | N/A |
| Chop detection replay | Not re-executed | Not re-executed | N/A | N/A |
| Volatility gate replay | Not re-executed | Not re-executed | N/A | N/A |
| **Regime Parity Score** | - | - | - | **N/A (unchanged code path)** |

Observations: No regime-classification code was modified this run. Regime parity remains a follow-up verification item rather than a known drift.

---

### Signal Engine

| Metric | Pine/Expected Signal | Backend/MT5 Signal | Match | Accuracy |
|---|---|---|---|---|
| Stale-price blocker | `PRICE_STALE` when MT5 quote ages out | Snapshot contract harness passed | Yes | 100% |
| Non-MT5 freshness blocker | `PRICE_NOT_MT5_FRESH` for non-MT5 authority | Snapshot contract harness passed | Yes | 100% |
| Backend/live freshness agreement | Stale/offline state must remain visible to dashboard | Frontend route regression passed | Yes | 100% |
| Full signal generation replay | Not re-executed | Not re-executed | N/A | N/A |
| **Signal Parity Score** | - | - | - | **100% on freshness/blocker scope** |

Observations: This run verified signal readiness blockers tied to freshness truth, not full entry-model parity.

---

### Freshness Parity

| Metric | Expected Authority | Actual Authority | Match | Accuracy |
|---|---|---|---|---|
| MT5 tick persistence timestamp | Quote payload timestamp | Market-data service now persists normalized MT5 quote time | Yes | 100% |
| MT5 candle persistence timestamp | Candle payload timestamp | Market-data service now persists normalized MT5 candle time | Yes | 100% |
| Live Radar stale/offline display | Visible stale/offline backend truth | Pending placeholder only used for missing MT5 snapshots | Yes | 100% |
| Watchlist snapshot invalidation | Watchlist transitions invalidate cached engine snapshot | Watchlist regression harness passed | Yes | 100% |
| **Freshness Parity Score** | - | - | - | **100%** |

Observations: The prior drift was UI masking plus service timestamp corruption potential. Both are now closed on the verified path.

---

## Drift Analysis

| Surface | Previous | Current | Trend | Status | Action |
|---|---|---|---|---|---|
| Live Radar freshness truth | Drift present (`stale/offline` masked as awaiting) | No drift in tested path | Improving | PASS | Monitor staging stale-symbol cards |
| Service timestamp authority | Drift present (server receipt time persisted) | No drift in tested path | Improving | PASS | Keep timestamp normalization aligned with main plugin |
| Fib anchor parity | Stable | Stable | Stable | PASS | No action |
| Regime replay parity | Unknown this run | Unknown this run | Stable/Untested | PENDING | Run dedicated regime replay suite in next sweep |
| Full signal replay parity | Unknown this run | Unknown this run | Stable/Untested | PENDING | Run dedicated signal replay suite in next sweep |

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---|---|---|
| Live Radar stale/offline state masking | HIGH | 1 | Patched in frontend with regression test | No |
| MT5 timestamp persistence drift in service class | HIGH | 1 | Patched in backend service with regression test | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Regime replay parity | Not measured this run | No regime code changes in patch scope | Yes, temporarily |
| Full signal generation replay | Not measured this run | This run targeted freshness authority and UI/backend truth agreement | Yes, temporarily |

---

## Acceptance Criteria

- Live Radar must expose backend stale/offline MT5 states directly.
- MT5 persistence must use quote/candle timestamps, not receipt time.
- Freshness blockers must continue returning `PRICE_STALE` and `PRICE_NOT_MT5_FRESH` on the verified backend path.
- Fib-anchor parity suites must remain green after the patch.

---

## Verification Checklist

- [x] Parity computed for freshness-authority surfaces
- [x] MT5 snapshot contract validated
- [x] Fib parity harness validated
- [x] HTF/session anchor parity validated
- [x] Watchlist invalidation parity validated
- [ ] Historical replay validated for full regime engine
- [ ] Multi-pair signal generation replay completed
- [x] Drift root causes identified
- [x] Corrective actions documented

---

## Artifacts

- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-16.md`
- Frontend regression: `src/routes/-live.test.ts`
- Backend service regression: `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- Supporting contract logs: `test-mt5-snapshot-contract.php`, `test-watchlist-snapshot-regression.php`, `test-fib-parity.php`
