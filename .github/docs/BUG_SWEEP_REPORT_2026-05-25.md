# Bug Sweep Report - 2026-05-25

**Report Date**: 2026-05-25  
**Phase**: Phase 3 - MT5 migration stabilization / regression hardening  
**Scanner**: Codex automation (`code-bug-fix-and-cleanup`)  
**Scan Duration**: 2026-05-25 07:53-08:12 SAST

---

## Summary

- **Total Issues Found**: 3
- **Critical Issues**: 0
- **High Priority Issues**: 2
- **Medium Priority Issues**: 1
- **Low Priority Issues**: 0
- **Test Coverage**: `npx vitest run` 17 files / 86 assertions PASS, PHP regression pack PASS, `npm run build` PASS, `npm run check:mql` PASS, `npm run lint` warning-only

## Executive Summary

- **Overall Health**: STABLE after regression-harness repair; no new production logic drift confirmed in Pine, MT5 ingest, or dashboard authority paths.
- **Bugs Found**: 3 confirmed regression-protection defects.
- **Fixes Applied**: Admin soak suite DOM restore, Vitest scope hardening, Node-style test normalization, Phase 2 streak fixture contract correction, and admin route formatting normalization.
- **Remaining Risks**: Dedicated regime replay and multi-case signal replay suites are still absent from the focused daily run set; bundle-size/code-splitting warnings remain non-blocking.
- **Migration Readiness**: READY to continue Phase 3 closeout work with reliable first-party frontend and PHP regression commands.

## Confirmed Problems

### High

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|------------------|
| Admin soak regression suite inactive | `src/routes/-admin.test.tsx` | DOM-based route tests were executed without a jsdom environment | Admin soak workspace and report-flow regressions could ship without detection | No | Added jsdom environment pragma and reconciled stale test expectations with live component behavior |
| Repo Vitest command scanned non-project tests | `vite.config.ts`, mixed `node:test` suites | Runner scope drift included `node_modules` and archived tests; two active tests were not registered as Vitest suites | Full regression command returned false failures and obscured real results | No | Scoped Vitest to first-party `src/` and `scripts/` tests, excluded archive/dependency trees, converted active Node-style suites to Vitest |

### Medium

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|------------------|
| Progress streak PHP fixture violated backend contract | `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` | Tests asserted `ACTIVE_DAY_DEFINITION=CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` while seeding heartbeat rows only | False-red backend regression on `/user/progress` streak path; weakened confidence in progress telemetry gates | No | Seeded `complete` engine-run fixtures for streak assertions and preserved backend authority rule |

## Root Cause / Analysis

- No new runtime failure was confirmed in production code paths during this run.
- The real instability was in the verification layer: frontend admin regressions were not executing against a DOM, the repo-wide Vitest command was polluted by dependency/archive tests, and the Phase 2 streak fixture no longer matched the approved backend active-day definition.
- Because those failures were in the regression harness, the previous same-day "0 issues" report was materially incomplete for migration governance.

## Surgical Fixes Applied

- `scripts/pipeline-watcher.test.mjs`
  - Converted Node test-runner syntax to Vitest so the suite registers under the project runner.
- `src/lib/api/soakEvidence.test.ts`
  - Converted Node test-runner syntax to Vitest and kept pre-network payload validation assertions intact.
- `src/routes/-admin.test.tsx`
  - Restored jsdom execution.
  - Updated the baseline evidence assertion to match per-entry persistence.
  - Updated the manual soak-template persistence test to use the current evidence-save refresh path instead of a non-existent ready-state refresh button.
- `vite.config.ts`
  - Restricted Vitest to first-party `src/**/*.test.*` and `scripts/**/*.test.*`.
  - Explicitly excluded `node_modules/**` and `wordpress/_archive/**`.
- `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
  - Seeded `complete` engine-run fixtures anywhere streak assertions depend on `ACTIVE_DAY_DEFINITION`.
- `src/routes/admin.tsx`
  - Prettier normalization only; no behavioral change.

## Exact Code Changes

- Admin test harness repair in `src/routes/-admin.test.tsx`.
- Runner scope hardening in `vite.config.ts`.
- Active test registration normalization in `scripts/pipeline-watcher.test.mjs` and `src/lib/api/soakEvidence.test.ts`.
- Backend streak-fixture contract correction in `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`.

## Parity Verification Results

| Domain | Result | Evidence |
|--------|--------|----------|
| Fib parity | 100% PASS | `test-fib-parity.php`, `test-superfib-weighting.php`, `test-htf-authority-anchor.php`, `test-session-anchors.php` |
| Freshness parity | 100% PASS | `test-ea-market-stream.php`, `test-market-data-service-source-filter.php`, `test-mt5-snapshot-contract.php`, admin soak/report Vitest coverage |
| Signal parity (covered paths) | 100% PASS | First-party Vitest suite PASS, no covered-path drift detected in live/plan/book/orders/admin flows |
| Regime parity (covered paths) | 100% PASS | Covered assertions passed; no dedicated replay drift surfaced in this run |

Inference note: Regime/signal percentages above reflect covered regression paths, not a new full historical replay.

## Acceptance Criteria

- `npx vitest run` completes against first-party tests only and returns PASS.
- Admin soak workspace tests execute in a DOM and cover current refresh flows.
- Phase 2 `/user/progress` streak tests assert against completed engine-run fixtures, not heartbeat-only fixtures.
- No backend authority rules, stale-data guards, Pine formulas, or MT5 ingest contracts are weakened.

## Regression Checklist

- [x] `npm run check:mql`
- [x] `npm run build`
- [x] `npx vitest run`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- [x] Full PHP regression sweep under `wordpress/smc-superfib-sniper/tests/php`
- [x] `npm run lint` completes with warnings only and 0 errors
- [ ] Dedicated regime replay parity suite
- [ ] Dedicated multi-case signal replay parity suite

## Remaining Risks

1. Direct regime replay coverage is still missing from the focused automation run set.
2. Direct multi-case signal replay coverage is still missing from the focused automation run set.
3. Existing lint warnings remain in shared UI files and hook dependency lists; they are unchanged by this run.
4. TanStack Router still emits non-blocking route-export/code-splitting warnings for several route files.

## Safe Deployment Order

1. Merge the regression-harness and test-fixture patches.
2. Re-run CI frontend build, first-party Vitest, and PHP regression commands.
3. No urgent production rollout is required because runtime authority logic was not altered.
4. If a frontend deploy is bundled with this branch, spot-check the admin soak workspace and `/user/progress` response shape after promotion.

## Do Not Touch List

- `SMC_SuperFib_Sniper_REST::ACTIVE_DAY_DEFINITION` and completed-run streak semantics without explicit governance approval
- `/ea/market-stream` freshness and timestamp authority guards
- `ensure_engine_snapshot()` stale-truth enforcement
- Pine formula file `SMC_SuperFib_v13.1.3.pine`
- MT5 trading/fib formulas under `mt5/*.mqh`
