# Parity Audit Report - Phase 0

**Report Date**: 2026-05-11  
**Phase**: Phase 0 - Dashboard/backend soak evidence contract  
**Auditor**: Codex automated sweep  
**Status**: PARTIAL

---

## Executive Summary

- **Overall Parity**: Source-level contract parity confirmed; live-runtime parity still requires instrumented replay
- **Threshold Required**: 100% contract parity across dashboard source and backend whitelist
- **Pass/Fail**: PARTIAL
- **Trend**: Stable in source, unverified in live runtime

This patch does not change Pine formulas, MT5 logic, fib math, regime classification, or signal generation. The scope is limited to the Phase 0 soak evidence write contract. Repository inspection confirms the current dashboard source and PHP backend already agree on the allowed `evidence_type` values. The patch adds diagnostics and a preflight guard to capture the exact runtime value during the next reproduction attempt.

---

## Component Parity Metrics

### Dashboard Source -> Backend Whitelist

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| `SoakEvidenceType` union vs PHP whitelist | Same five values | Same five values | Yes | 100% |
| `buildBaselineEvidenceEntries()` baseline type literal | `baseline_metadata` | `baseline_metadata` | Yes | 100% |
| Manual evidence select options vs PHP whitelist | Same four manual values plus baseline type in TS source | Same | Yes | 100% |
| **Source Contract Score** | - | - | - | **100%** |

**Observations**: No source-visible contract drift exists between `src/types/sniper.ts`, `src/routes/admin.tsx`, and `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.

---

### Runtime Capture Instrumentation

| Metric | Previous Behavior | Current Behavior | Match | Accuracy |
|---|---|---|---|---|
| Client invalid `evidence_type` handling | Bad value reached backend and failed there | Bad value throws at client boundary and logs full payload | Yes | 100% |
| Baseline payload observability | No explicit baseline payload log | `console.debug` prints full baseline evidence array before save | Yes | 100% |
| Backend payload observability | Rejection returned 400 without request-body evidence | `error_log()` records sanitized payload before whitelist check | Yes | 100% |
| **Diagnostics Score** | - | - | - | **100%** |

**Observations**: The new diagnostics preserve backend authority and make the next live reproduction conclusive.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---|---|---|
| Live failing `evidence_type` value not captured in repository evidence | HIGH | 1 | Mitigated with client/server diagnostics; still needs live replay | Yes |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Live deployment/runtime state | Not directly reproducible from this workspace | Admin save requires live authenticated runtime evidence that is not available in the repo alone | Yes |
| Generated `dist` assets on local disk | Observed out of sync during investigation | Build artifacts are deployment outputs, not authority over source truth | Yes |

---

## Recommendations

1. Deploy this patch to the environment where the 400 occurs.
2. Trigger one baseline soak save and capture the browser console plus PHP log.
3. If the logged client payload already shows a valid `evidence_type`, treat the incident as transport/deploy drift rather than a source contract bug.

---

## Verification Checklist

- [x] Source contract parity validated
- [x] Backend whitelist preserved unchanged
- [x] TypeScript compile completed
- [x] Runtime guard test executed
- [x] Production build completed
- [ ] Live admin baseline save replayed
- [ ] Logged client payload reviewed
- [ ] Logged PHP payload reviewed

---

## Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-11_soak-evidence-type-invalid.md`
- Implementation summary: `reports/codex-implementation.md`
- Client guard module: `src/lib/api/soakEvidence.ts`
- Client guard test: `src/lib/api/soakEvidence.test.ts`
