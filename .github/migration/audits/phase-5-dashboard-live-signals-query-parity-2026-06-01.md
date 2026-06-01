# Parity Audit Report - Phase 5

**Report Date**: 2026-06-01  
**Phase**: Phase 5 - dashboard live-signals query parity  
**Auditor**: Codex automation `code-bug-fix-and-cleanup`  
**Status**: PASS WITH LIVE-REPLAY GAP

---

## Executive Summary

- Overall parity: 100% synthetic parity gate.
- Threshold required: 95% for signal/freshness migration confidence; 99% for synthetic fib validator.
- Pass/Fail: PASS for available automated gates.
- Trend: Stable.

---

## Component Parity Metrics

| Component              | Backend/PHP                                               | Dashboard/TypeScript                                                                                            | MT5/Pine Impact         | Accuracy |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| Live signal board size | `/live-signals?board_size=` supports 3/5/10 display caps. | `useDisplaySignals(boardSize)` keys cache as `["live-signals", boardSize]`; `useLiveSignals()` defaults to `3`. | None; display cap only. | PASS     |
| Live signal freshness  | Backend stale and board persistence regressions passed.   | Query keeps `staleTime: 0`, no structural sharing, previous-data continuity, and settings-driven polling.       | No formula change.      | PASS     |
| Broad invalidation     | Backend remains source of truth.                          | Existing partial invalidation/refetch by `["live-signals"]` still covers all board-size variants.               | None.                   | PASS     |
| Fib validator          | Synthetic Pine/MT5 tuple set: 384/384 exact matches.      | No dashboard fib rendering changes.                                                                             | No formula change.      | 100%     |

---

## Critical Issues Found

| Issue                                               | Severity | Count | Resolution                                                                       | Blocker |
| --------------------------------------------------- | -------- | ----: | -------------------------------------------------------------------------------- | ------- |
| Live-signals test expected obsolete broad query key | MEDIUM   |     1 | Updated regression to assert `["live-signals", 3]` and mock `getDisplaySignals`. | No      |

---

## Acceptable Drift Items

| Item                          | Difference                                          | Reason                                                                                       | Accepted                        |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| Query key includes board size | `["live-signals", 3]` instead of `["live-signals"]` | Required to prevent display-board size cache collisions while preserving broad invalidation. | Yes                             |
| Synthetic parity only         | No live terminal replay                             | Workspace has no MetaTrader runtime.                                                         | Yes, pending operational replay |

---

## Recommendations

1. Keep `["live-signals", boardSize]` as the display-board query contract.
2. Continue using partial invalidation on `["live-signals"]` for watchlist and engine-batch refreshes.
3. Run live replay for `WATCH -> ARMED -> READY`, stale price, stale candle, active position, and pending order cases.

---

## Verification Checklist

- [x] Parity computed by synthetic validator.
- [x] Multi-symbol fib validator completed.
- [x] Dashboard live-signals polling regression passed.
- [x] Backend stale/live signal contract regression passed.
- [x] MT5 include integrity passed.
- [ ] Live MT5 terminal replay completed.

---

## Artifacts

- `.github/docs/BUG_SWEEP_REPORT_2026-06-01.md`
- `.github/migration/audits/phase-5-dashboard-live-signals-query-parity-2026-06-01.md`
