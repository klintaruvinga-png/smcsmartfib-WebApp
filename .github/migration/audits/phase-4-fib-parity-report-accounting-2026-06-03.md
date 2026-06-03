# Parity Audit Report - Phase 4

Report date: 2026-06-03  
Phase: Phase 4 - fib parity validator reporting  
Auditor: Codex automation code-bug-fix-and-cleanup  
Status: FAIL for live paired-export gate; PASS for validator accounting regression

## Executive Summary

- Overall parity: 100% synthetic self-test; 0.26% current live paired corpus.
- Threshold required: 99%.
- Pass/Fail: FAIL for migration closeout because live paired-export parity remains below threshold.
- Trend: reporting accuracy improved; live fib parity remains blocked pending synchronized captures.

## Component Parity Metrics

### Fib Engine (Phase 4)

| Metric                                 | Pine Value         | MT5 Value          | Match |          Accuracy |
| -------------------------------------- | ------------------ | ------------------ | ----- | ----------------: |
| Required tuple coverage                | 384                | 384                | Yes   |              100% |
| Synthetic comparator self-test         | 384 exact          | 384 exact          | Yes   |              100% |
| Live paired corpus exact matches       | 1                  | 1                  | No    |     0.26% overall |
| Live paired corpus critical mismatches | 383                | 383                | No    |              FAIL |
| EURUSD M15 bucket total after patch    | 32 required tuples | 32 reported tuples | Yes   |   100% accounting |
| Fib parity score                       | -                  | -                  | No    | 0.26% live corpus |

Observations: the patch does not change fib math, anchors, ratios, or gate thresholds. It corrects diagnostic bucket totals so each required tuple contributes once to per-symbol/timeframe reporting. The current live corpus still shows broad price drift and remains unsuitable for closeout.

### Regime Engine (Phase 5)

| Metric                   | Pine Classification | MT5 Classification | Match |             Accuracy |
| ------------------------ | ------------------- | ------------------ | ----- | -------------------: |
| Keyed regime wrapper     | Accepted            | Accepted           | Yes   | 100% focused harness |
| Missing counterpart gate | FAIL expected       | FAIL observed      | Yes   | 100% focused harness |

Observations: no regime logic changed.

### Signal Engine (Phase 6)

| Metric                    | Pine Signal   | MT5 Signal    | Match |             Accuracy |
| ------------------------- | ------------- | ------------- | ----- | -------------------: |
| Keyed signal wrapper      | Accepted      | Accepted      | Yes   | 100% focused harness |
| EA candidates wrapper     | Accepted      | Accepted      | Yes   | 100% focused harness |
| Missing counterpart gates | FAIL expected | FAIL observed | Yes   | 100% focused harness |

Observations: no signal generation, readiness, stale gating, or persistence logic changed.

## Critical Issues Found

| Issue                                                               | Severity | Count | Resolution                                                                  | Blocker |
| ------------------------------------------------------------------- | -------- | ----: | --------------------------------------------------------------------------- | ------- |
| Phase 4 bucket totals double-counted present critical mismatches    | MEDIUM   |     1 | Patched validator accounting and added regression coverage.                 | No      |
| Live Phase 4 MT5/Pine fib parity remains materially below threshold | HIGH     |     1 | Not patched; requires synchronized capture/root-cause parity investigation. | Yes     |

## Acceptable Drift Items

| Item                              | Difference                          | Reason                                                       | Accepted |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------ | -------- |
| Validator bucket accounting patch | No formula or gate-threshold change | Reporting-only correction; gate totals remain authoritative. | Yes      |
| Live corpus drift                 | 383/384 critical mismatches         | Current artifacts do not prove synchronized Pine/MT5 parity. | No       |

## Recommendations

1. Keep the validator accounting patch so migration reports do not understate per-bucket parity.
2. Re-capture Pine and MT5 exports from the same UTC window before changing fib formulas.
3. Use `reports/phase4-parity/phase4-gate-2026-06-03-corrected.json` as the corrected diagnostic artifact for this run.

## Verification Checklist

- [x] Parity computed across the required 384 Phase 4 tuples.
- [x] Synthetic validator self-test passed at 100%.
- [x] Bucket total regression failed before the patch and passed after it.
- [x] Drift root cause for reporting defect identified.
- [x] Corrective action documented.
- [ ] Synchronized live Pine/MT5 capture completed.
- [ ] Live fib parity reaches the 99% gate.

## Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-06-03.md`
- Corrected live gate: `reports/phase4-parity/phase4-gate-2026-06-03-corrected.json`
- Regression harness: `scripts/test-parity-validator-regression.php`
- Validator patch: `scripts/parity-validator.php`
