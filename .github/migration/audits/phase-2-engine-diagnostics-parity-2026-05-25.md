# Parity Audit Report - Phase 2 Engine Diagnostics

**Report Date**: 2026-05-25  
**Phase**: Phase 2 / Phase 3 crossover - diagnostics and regression harness parity  
**Auditor**: Codex automation (`code-bug-fix-and-cleanup`)  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100% across covered first-party regression surfaces
- **Threshold Required**: 95%
- **Pass/Fail**: PASS
- **Trend**: Stable after restoring harness integrity

This audit did not uncover new production parity drift. The confirmed defects were in the verification harness itself: admin soak diagnostics tests were not running in a DOM, the repo-wide Vitest command was including dependency/archive suites, and Phase 2 streak fixtures no longer matched the backend-approved completed-run definition. After patching those surfaces, first-party frontend tests, PHP telemetry tests, and the broader PHP pack all returned green.

## Comparison Matrix

| Surface | Expected Contract | Before Patch | After Patch | Parity |
|---------|-------------------|--------------|-------------|--------|
| Admin soak workspace tests | DOM-backed route assertions | `document is not defined`; suite inactive | 18/18 assertions pass under jsdom | 100% |
| Repo Vitest scope | First-party tests only | Included `node_modules/**` and archive suites | Scoped to `src/**/*.test.*` and `scripts/**/*.test.*` | 100% |
| Active runner syntax | Vitest-registered suites | Two active suites used Node runner syntax | Both suites register and pass under Vitest | 100% |
| Progress streak regression | Completed engine runs define active day | Heartbeat-only fixtures contradicted backend rule | Fixtures now seed `status=complete` rows | 100% |

## Component Parity Metrics

### Freshness / Diagnostics Surface

| Metric | Expected | Actual | Match | Accuracy |
|--------|----------|--------|-------|----------|
| Admin soak report error-state coverage | Retry/error panel protected | PASS | PASS | 100% |
| Baseline/checkpoint render parity | Distinct baseline vs checkpoint surfaces | PASS | PASS | 100% |
| Manual soak-template persistence across refresh | Manual selection preserved | PASS | PASS | 100% |
| Repo regression command authority | First-party suites only | PASS | PASS | 100% |

**Observations**: The meaningful drift was in the test harness, not the diagnostics UI logic itself.

### Progress Telemetry Surface

| Metric | Expected | Actual | Match | Accuracy |
|--------|----------|--------|-------|----------|
| Streak active-day definition | Completed engine run on calendar day | PASS | PASS | 100% |
| Same-day streak | 1 day when one completed run exists today | PASS | PASS | 100% |
| Consecutive streak fixture | 3 days for 3 completed-run days | PASS | PASS | 100% |
| No-run state | `UNAVAILABLE` with streak 0 | PASS | PASS | 100% |

**Observations**: Backend authority remained correct; only the test fixtures had drifted away from the approved contract.

### Covered Fib / Signal / Regime Paths

| Metric | Result |
|--------|--------|
| Fib parity | PASS - `test-fib-parity.php`, `test-superfib-weighting.php`, `test-htf-authority-anchor.php`, `test-session-anchors.php` |
| Freshness parity | PASS - `test-ea-market-stream.php`, `test-market-data-service-source-filter.php`, `test-mt5-snapshot-contract.php` |
| Signal covered-path parity | PASS - first-party Vitest 86/86 assertions |
| Regime covered-path parity | PASS - no covered-path drift surfaced |

Inference note: Signal/regime parity here reflects covered assertions, not a new historical replay corpus.

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|------------|---------|
| Admin soak DOM suite inactive | HIGH | 1 | Fixed in `src/routes/-admin.test.tsx` | No |
| Repo Vitest scope drift | HIGH | 1 | Fixed in `vite.config.ts` plus test conversions | No |
| Streak fixture contract drift | MEDIUM | 1 | Fixed in `test-phase2-trade-telemetry.php` | No |

## Drift Analysis

- **Previous audit state**: Same-day report artifacts claimed no defects, but the active regression command was not trustworthy.
- **Current audit state**: Regression harness now matches first-party scope and backend streak semantics.
- **Trend**: Improved verification integrity with no observed runtime parity regression.

## Acceptance Criteria

- First-party Vitest command passes without dependency/archive suite pollution.
- Admin soak workspace tests execute with DOM access and protect current refresh flows.
- Progress telemetry streak tests align with `ACTIVE_DAY_DEFINITION`.
- Covered fib/freshness/signal/regime assertions remain green after harness repair.

## Migration Readiness

- **Phase readiness**: PASS for continued Phase 3 closeout work.
- **Readiness caveat**: Dedicated regime replay and multi-case signal replay suites are still future work.

## Unresolved Edge Cases

1. No dedicated historical regime replay was executed in this run.
2. No dedicated multi-case signal replay corpus was executed in this run.
3. TanStack Router route-export warnings remain informational only.

## Recommendations

1. Keep the tightened Vitest include/exclude scope as the repo baseline.
2. Add a dedicated regime replay suite to the focused automation run set.
3. Add a dedicated multi-case signal replay suite to the focused automation run set.

## Verification Checklist

- [x] First-party Vitest command passed
- [x] Admin route regression suite passed
- [x] Phase 2 telemetry PHP suite passed
- [x] Full PHP regression sweep passed
- [x] Frontend build passed
- [ ] Historical replay validation added
- [ ] Multi-pair regime/signal replay added

## Artifacts

- Frontend regression: `npx vitest run` -> 17 files / 86 assertions PASS
- PHP regression: `wordpress/smc-superfib-sniper/tests/php/*` PASS
- Build verification: `npm run build` PASS
- MQL verification: `npm run check:mql` PASS
