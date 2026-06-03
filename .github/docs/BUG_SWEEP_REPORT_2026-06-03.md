# Executive Summary

- overall health: GUARDED FAIL for Phase 4 live MT5/Pine fib parity; PASS for the validator synthetic self-test and focused regression harness after patch.
- bugs found: 1 confirmed MEDIUM report-integrity defect in Phase 4 parity bucket accounting.
- fixes applied: corrected per-symbol/timeframe bucket totals so critical mismatches are counted once.
- remaining risks: live paired MT5/Pine fib exports still fail the Phase 4 gate at 0.26% against the current local corpus.
- migration readiness: not ready for Phase 4 closeout until synchronized Pine and MT5 captures are reconciled.

Report date: 2026-06-03  
Phase: Phase 4 - fib parity reporting and MT5 migration gate  
Scanner: Codex automation code-bug-fix-and-cleanup  
Scan duration: 2026-06-03T06:00:00+02:00 to 2026-06-03T06:37:37+02:00

## Confirmed Problems

| Severity | Category                | Component                      | Root Cause                                                                                                                                                                  | Impact                                                                                                         | Blocker |
| -------- | ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| MEDIUM   | Parity report integrity | `scripts/parity-validator.php` | `record_bucket_mismatch()` incremented bucket `total` after the comparison branch had already counted present critical tuples.                                              | Per-symbol/timeframe parity percentages were understated when critical drifts existed, confusing drift triage. | No      |
| HIGH     | Migration parity        | Phase 4 live fib corpus        | Current MT5 and Pine artifacts remain materially divergent. This run did not prove formula corruption; the corpus appears unsynchronized/stale relative to migration notes. | Phase 4 live paired-export gate remains failed.                                                                | Yes     |

## Surgical Fixes Applied

| File                                                          | Change                                                                                                                                 | Regression Protection                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `scripts/parity-validator.php`                                | Removed bucket `total` mutation from `record_bucket_mismatch()` and counted missing tuples explicitly at the missing-tuple call sites. | Keeps each required tuple counted once regardless of exact, acceptable, critical, or missing outcome. |
| `scripts/test-parity-validator-regression.php`                | Added Phase 4 regression where one EURUSD/M15 critical drift must still leave the bucket total at the required 32 tuples.              | Fails on the previous double-count behavior (`33`) and passes after patch (`32`).                     |
| `reports/phase4-parity/phase4-gate-2026-06-03-corrected.json` | Stored corrected live paired-export gate artifact.                                                                                     | Provides corrected bucket metrics for migration audit review.                                         |

## Parity Verification Results

| Area                           |               Result | Evidence                                                                                                                                                     |
| ------------------------------ | -------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fib parity synthetic validator |            100% PASS | `php scripts/parity-validator.php --out reports/phase4-gate-2026-06-03.json` during verification; generated scratch artifact was not kept in the final diff. |
| Fib parity live paired corpus  |           0.26% FAIL | `reports/phase4-parity/phase4-gate-2026-06-03-corrected.json`; 384 total tuples, 383 critical mismatches.                                                    |
| Regime parity                  | Not directly changed | `php scripts/test-parity-validator-regression.php` retained regime wrapper and missing-counterpart checks.                                                   |
| Signal parity                  | Not directly changed | `php scripts/test-parity-validator-regression.php` retained signal keyed/candidates/bare-array checks and counterpart gates.                                 |
| Freshness parity               | Not directly changed | Scan reviewed stale/freshness references; no freshness logic was patched in this run.                                                                        |

## Remaining Risks

- Phase 4 live MT5/Pine fib parity remains blocked. Current corrected live corpus: gate `FAIL`, overall parity `0.26%`.
- Existing migration note states MT5/Pine captures must be synchronized before operational parity judgment. That remains the next required action.
- No frontend, REST, Pine formula, MT5 engine, stale-state, or signal readiness logic was changed in this run.

## Regression Checklist

- [x] Refresh tests: focused scan found no duplicate refresh-loop patch target in this run.
- [x] Stale detection tests: existing stale/freshness PHP and TypeScript coverage left untouched; no stale logic changed.
- [x] Signal readiness tests: signal parity wrapper/counterpart regression remained green.
- [x] Backend sync tests: display schema backend-confirmed regression remained green.
- [x] Parity verification tests: Phase 4 bucket-total regression added and passed; synthetic validator returned 100%.

## Safe Deployment Order

1. Merge the validator/reporting patch.
2. Re-run Phase 4 synthetic validator self-test.
3. Capture synchronized Pine and MT5 level exports from the same UTC market window.
4. Re-run `php scripts/parity-validator.php --mt5-file <mt5> --pine-file <pine> --out <gate>`.
5. Escalate remaining formula/input-source drift only after synchronized captures are confirmed.

## Do Not Touch List

- Pine v13 trading formulas and anchor rules without synchronized capture evidence.
- MT5 fib formula implementation without a paired-export repro proving formula drift.
- Backend source-of-truth stale-state gates.
- Dashboard signal truth rendering contracts.
