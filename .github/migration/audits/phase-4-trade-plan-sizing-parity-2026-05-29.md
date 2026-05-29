# Parity Audit Report — Phase 4 Trade Plan Sizing

**Report Date**: 2026-05-29  
**Phase**: Phase 4 — backend/dashboard sizing authority hardening  
**Auditor**: Codex  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100% on the targeted authority path.
- **Threshold Required**: 100% for backend telemetry equity to plan-risk sizing and backend lot values to dashboard rendering.
- **Pass/Fail**: PASS
- **Trend**: Improving

---

## Targeted Parity Metrics

| Metric | Authority Source | Observed Result | Match |
| --- | --- | --- | --- |
| `riskUSC` sizing base | Live `/account-telemetry.equity` | `50000 * 1.0% = 500.00` and sampled `/ladders` plan returned `riskUSC = 500` | PASS |
| Stage lot source of truth | Backend `plan.lotSize` | Dashboard route regression still consumes backend-authored lots with no recomputation | PASS |
| Stale telemetry handling | `/account-telemetry.freshness` | Stale telemetry sample returned `state = INVALID`, `riskUSC = 0`, and `lotSize.e1/e2/e3 = 0` | PASS |
| Legacy blob isolation | `/user/account.equityUSC` | Stale/zeroed blob no longer affects live plan sizing when telemetry is live | PASS |

**Observations**: This parity check is scoped to the confirmed authority defect only. No Pine, fib-engine, or regime formulas were changed.

---

## Sample Payload Evidence

### Live telemetry sample

```json
{
  "accountTelemetry": {
    "equity": 50000,
    "freshness": "live"
  },
  "ladders": [
    {
      "riskUSC": 500,
      "lotSize": { "e1": 0.13, "e2": 0.14, "e3": 0.24 },
      "state": "ACTIVE"
    }
  ]
}
```

### Stale telemetry sample

```json
{
  "riskUSC": 0,
  "lotSize": { "e1": 0, "e2": 0, "e3": 0 },
  "state": "INVALID"
}
```

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
| --- | --- | --- | --- | --- |
| Telemetry-to-plan authority mismatch | HIGH | 1 | Patched in backend sizing logic and covered by PHP regression tests | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
| --- | --- | --- | --- |
| None in the targeted path | 0% | Backend risk sizing and dashboard lot display remained aligned after the patch | Yes |

---

## Recommendations

1. Keep live account telemetry as the only valid equity authority for trade-plan sizing.
2. If future work touches plan caching, add a dedicated cache invalidation regression for telemetry freshness transitions.
3. Re-run the sampled `/account-telemetry` and `/ladders` checks in staging before merge if a live WordPress environment is available.

---

## Verification Checklist

- [x] Targeted backend authority path validated.
- [x] Existing dashboard lot-display contract re-validated.
- [x] Telemetry freshness failure path re-validated.
- [ ] Live staging payload capture outside the local harness.
- [ ] Multi-user live replay beyond the focused regression scope.

---

## Artifacts

- `php wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- `npx vitest run src/routes/-plan.test.tsx`
- `reports/codex-implementation.md`
