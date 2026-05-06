# Parity Audit Report - Phase 0

**Report Date**: 2026-05-03  
**Phase**: 0 (Freshness / MT5 ingress contract)  
**Auditor**: Code Bug Fix And Cleanup automation  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100% on covered MT5 ingress contract cases
- **Threshold Required**: 100%
- **Pass/Fail**: PASS
- **Trend**: Improving

Scope note: this audit covers the backend MT5 snapshot/auth/freshness contract patched in this run. It is not a long-duration live soak and it is not a full MT5 market replay.

---

## Component Parity Metrics

### Freshness / Ingress Engine (Phase 0)

| Metric | Expected Truth | Backend Result | Match | Accuracy |
|--------|----------------|----------------|-------|----------|
| Snapshot route auth required | Reject unauthenticated writes | Rejected with `401` | Yes | 100% |
| MT5 quote timestamp persistence | Store MT5 quote time | Stored `2026-05-03 08:15:30` from payload | Yes | 100% |
| MT5 freshness state mapping | `LIVE -> live`, `DISCONNECTED -> offline` | Canonical state persisted | Yes | 100% |
| State-only freshness transition | Preserve last quote timestamp | `updated_at` unchanged during `DISCONNECTED` update | Yes | 100% |
| Authority watchlist enumeration | Return all watched symbols | Returned `EURUSD`, `USDJPY` | Yes | 100% |
| **Freshness Parity Score** | - | - | - | **100%** |

**Observations**: The backend no longer treats MT5 receipt time as quote truth, and it no longer silently accepts anonymous user-scoped MT5 writes.

---

### Fib Engine (Phase 4)

| Metric | Pine Value | MT5 Value | Match | Accuracy |
|--------|-----------|----------|-------|----------|
| No fib code delta in this run | N/A | N/A | N/A | N/A |
| **Fib Parity Score** | - | - | - | **N/A** |

**Observations**: No fib-path code changed in this run.

---

### Regime Engine (Phase 5)

| Metric | Pine Classification | MT5 Classification | Match | Accuracy |
|--------|-------------------|------------------|-------|----------|
| No regime code delta in this run | N/A | N/A | N/A | N/A |
| **Regime Parity Score** | - | - | - | **N/A** |

**Observations**: No regime-path code changed in this run.

---

### Signal Engine (Phase 6)

| Metric | Pine Signal | MT5 Signal | Match | Accuracy |
|--------|------------|-----------|-------|----------|
| Pip-value sizing helper coverage | Existing baseline | Existing baseline | Yes | 100% |
| **Signal Parity Score** | - | - | - | **100% on covered helper cases** |

**Observations**: The previously patched pip-value harness still passes after this run, so the ingress hardening did not regress covered sizing parity.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| Unauthenticated MT5 snapshot writes could persist under user `0` | CRITICAL | 1 | Fixed via route auth + in-handler guard | No after patch |
| MT5 snapshot state/timestamp contract lost freshness truth | HIGH | 1 | Fixed via canonical state mapping and MT5 quote-time persistence | No after patch |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Live MT5 terminal soak not executed | N/A | This run was code-level regression validation only | Yes |
| MT5 multi-symbol terminal behavior not replayed | N/A | Requires terminal-side validation, not PHP-only harnessing | Yes |

---

## Recommendations

1. Validate one authenticated MT5 snapshot on staging and confirm it lands under the expected user account.
2. Simulate a `DISCONNECTED` state-only MT5 update and verify the dashboard does not treat it as a fresh quote.
3. Run a 24h or 72h freshness soak before treating Phase 0 as migration-governance complete.

---

## Verification Checklist

- [x] Parity computed across covered MT5 ingress contract cases
- [x] Edge cases analyzed for auth, stale-state, and authority enumeration
- [x] Corrective actions documented
- [x] Existing pip-value parity harness re-run
- [ ] Historical MT5 replay validated
- [ ] Multi-pair live terminal verification completed

---

## Artifacts

- Test logs: `.github/migration/test-logs/phase-0-mt5-ingress-2026-05-03.log`
- Comparison output: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- Related signal artifact: `.github/migration/audits/phase-6-signal-parity-2026-05-03.md`
