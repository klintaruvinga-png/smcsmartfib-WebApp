# Bug Scan Report - Phase 0

**Report Date**: 2026-05-11  
**Phase**: Phase 0 - Admin soak evidence contract integrity  
**Scanner**: Codex automated sweep  
**Scan Duration**: 2026-05-11 investigation session

---

## Summary

- **Total Issues Found**: 2
- **Critical Issues**: 0
- **High Priority Issues**: 1
- **Medium Priority Issues**: 1
- **Low Priority Issues**: 0
- **Test Coverage**: Source-path validation only; no live admin save replay available in this environment

---

## High Priority Issues (Slows Progress)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|---|---|---|---|---|---|
| Baseline soak save returns `smc_sf_soak_evidence_type_invalid` but the source contract already matches | Dashboard admin write path / WordPress soak evidence endpoint | The repository source uses `baseline_metadata` consistently in `buildBaselineEvidenceEntries()`, `SoakEvidenceType`, and the backend whitelist. The actual invalid runtime value was not captured in available evidence. | Baseline soak capture can fail in production while source inspection alone appears healthy. | Yes | Added a client preflight validator, a baseline payload debug log, and backend request logging so the next reproduction captures the exact failing value without weakening validation. |

---

## Medium Priority Issues

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|---|---|---|---|---|---|
| Local/generated `dist` admin bundle observed during investigation did not match the current source tree | Dashboard deployment packaging | Generated assets on disk were out of sync with the checked-in source route during inspection, which increases stale-bundle risk even though the exact live failing payload is still unconfirmed. | A deployment serving stale assets could continue reproducing behavior that no longer matches the current source. | No | Rebuilt the app locally and flagged stale-bundle redeploy verification as a required manual step after this PR. |

---

## Blocker Assessment

**Blocks Current Phase**: Yes  
**Blocks Phase N+1 Transition**: Yes  
**Timeline Impact**: Unknown until one instrumented live reproduction is completed  
**Risk Level**: HIGH

---

## Recommended Priority Order

1. Reproduce one baseline soak save attempt with this patch deployed and capture the browser console payload plus PHP error log entry.
2. Confirm whether the logged `evidence_type` is invalid at the browser boundary or only after transport/parsing.
3. If the logged value is already valid, treat the incident as a stale-bundle or stale-deploy problem and redeploy with cache busting rather than widening backend acceptance.

---

## Verification Criteria for Fix

- [x] Client preflight guard added without widening the whitelist
- [x] Backend rejection path preserved
- [x] Browser-side baseline payload debug logging added
- [x] PHP-side request logging added
- [x] TypeScript compile completed
- [x] Targeted runtime guard test passed
- [ ] Live baseline soak save replayed with diagnostics enabled
- [ ] PHP log and browser log captured from the same failing or successful attempt

---

## Attachments

- Implementation summary: `reports/codex-implementation.md`
- Parity audit: `.github/migration/audits/phase-0-dashboard-backend-soak-evidence-parity-2026-05-11.md`
- Browser/runtime guard test: `src/lib/api/soakEvidence.test.ts`
