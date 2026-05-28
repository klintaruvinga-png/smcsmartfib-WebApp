# Parity Audit Report - Phase 0

**Report Date**: 2026-05-28  
**Phase**: 0 (Backend-dashboard progressive lot-sizing contract)  
**Auditor**: Codex  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 100%
- **Pass/Fail**: PASS
- **Trend**: Improved test coverage, no production drift found

The repository currently preserves backend authority for progressive staged lot sizing. `build_trade_plan()` remains the only source of `lotSize.e1/e2/e3`, `post_execute_signals()` queues staged orders from the stored backend plan, and the dashboard renders those backend-authored values without recomputation. The new regression coverage proves the lot-sizing contract end-to-end for the audited backend, queue, and dashboard surfaces.

---

## Component Parity Metrics

| Surface | Backend Source | Consumer | Result |
|---------|----------------|----------|--------|
| Stage lot derivation | `build_trade_plan()` risk budget + `1:2:3` weights + stage stop distance + FX pip valuation | Stored plan `lotSize` | PASS |
| Minimum lot floor | `build_trade_plan()` `max(0.01, ...)` clamp | Stored plan `lotSize` | PASS |
| Queue staged lots | Stored `plan.lotSize[stage]` | `post_execute_signals()` queued `payload.lots` | PASS |
| Queue TP mapping | Stored `plan.tps.tp1/tp2/tp3` | `e1/e2/e3 -> tp1/tp2/tp3` | PASS |
| Queue stop mapping | Stored `plan.stops[stage]` | Queued `payload.sl` | PASS |
| Queue gating | `backend_confirmed=1` and `status=READY` | `/user/execute-signals` | PASS |
| Dashboard display | Backend `plan.lotSize.e1/e2/e3` | `PlanCandidateCard` rendered lot labels | PASS |

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| None in audited contract surface | LOW | 0 | N/A | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Non-forex broker pip economics | Not re-audited here | Contract limited this patch to the existing progressive lot-size path and existing FX pip-value parity surface | Yes |
| Live broker payload proof | Not captured in this repo-only run | Local validation proves contract behavior in the repository harness, not a live broker bridge | Yes |

---

## Recommendations

1. Treat any future staged-lot change as a parity-sensitive backend contract update and re-run these exact regressions before merge.
2. Add live-environment capture review for one real plan JSON and one resulting queue payload before operational release if broker behavior is in question.
3. Keep `src/components/PlanCard.tsx` display-only; frontend lot math would violate the current source-of-truth boundary.

---

## Verification Checklist

- [x] Backend lot derivation regression added and passed
- [x] Stored-plan to queue staged-lot regression added and passed
- [x] Existing FX pip-value parity regression re-run and passed
- [x] Dashboard stage-lot mirror regression added and passed
- [x] READY/backend-confirmed execution gates re-verified
- [x] Deterministic order ID mapping re-verified
- [ ] Live broker or MT5 queue capture from a real environment

---

## Artifacts

- PHP regressions: `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`, `wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php`, `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- Frontend regression: `src/routes/-plan.test.tsx`
- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-28_progressive-entry-lot-sizing.md`
- Implementation summary: `reports/codex-implementation.md`
