# Parity Audit Report - Phase 6

**Report Date**: 2026-05-29  
**Phase**: 6 (MT5 signal-candidate ingest lifecycle suppression)  
**Auditor**: Codex  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: PASS
- **Backend Authority**: Preserved
- **Pass/Fail**: PASS
- **Trend**: Improved MT5 candidate lifecycle parity without widening architecture

The backend remains the authority for whether a prior MT5 candidate is still active. Same-range duplicates are now suppressed only when backend snapshot or trade telemetry proves the earlier candidate is still active, while stale or missing authority preserves the previous fail-open ingest behavior.

---

## Component Parity Metrics

| Surface | Backend Source | Consumer / Path | Result |
|---------|----------------|-----------------|--------|
| Same-range lookup | Stored MT5 candidate tuple + one-pip `fib_level` tolerance | `post_ea_signal_candidates()` ingest gate | PASS |
| Pre-entry validity | Live MT5 snapshot from `get_cached_price()` | Duplicate suppression before entry cross | PASS |
| Filled/live trade validity | Live `read_trade_positions()` telemetry | Duplicate suppression after entry cross | PASS |
| Pending-order validity | Live `read_trade_orders()` telemetry | Duplicate suppression after entry cross | PASS |
| Fail-open protection | Snapshot or telemetry unresolved state | Candidate write preserved with diagnostics | PASS |
| Pine drift diagnostics | Existing `classify_signal_drift()` semantics | Stored candidates only | PASS |
| MT5 dispatch contract | Existing MQL source contract and RR/AOV guards | `scripts/mt5-signal-dispatch.test.mjs` | PASS |

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|------------|---------|
| Duplicate same-range MT5 candidates stayed writable while the prior candidate was still active | HIGH | 1 | Fixed in this patch | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|------------|--------|----------|
| Unresolved stale-snapshot case | Candidate still writes instead of suppressing | Contract requires fail-open when authority is stale or missing | Yes |
| Explicit historical closure state on prior candidates | Not added | Contract forbids schema widening and row mutation in this patch | Yes |

---

## Recommendations

1. Preserve backend-only lifecycle authority for MT5 candidate suppression unless a later contract explicitly redesigns the lifecycle model.
2. Keep suppression dependent on fresh snapshot or trade telemetry only; do not convert unresolved states into silent suppression.
3. Re-run the PHP MT5 ingest contract and MT5 dispatch Vitest guard before merging any future candidate-lifecycle or telemetry-freshness change.

---

## Verification Checklist

- [x] PHP MT5 snapshot/candidate contract test passed
- [x] Pre-entry duplicate suppression covered
- [x] Open-position duplicate suppression covered
- [x] Pending-order duplicate suppression covered
- [x] Post-entry replacement path covered
- [x] Existing Pine drift assertions preserved
- [x] MT5 dispatch parity guard passed
- [ ] Live 120-second MT5 dual-run soak in a connected environment

---

## Artifacts

- PHP contract: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- MT5 dispatch regression: `scripts/mt5-signal-dispatch.test.mjs`
- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-29_mt5-signal-lifecycle-suppression.md`
- Implementation summary: `reports/codex-implementation.md`
