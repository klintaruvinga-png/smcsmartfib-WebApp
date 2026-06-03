# Phase 4 Parity: Before vs After `ec5eee8` (Fib Anchor Fix v2)

Patch: `ec5eee8` — "Fix MT5 fib anchor session keys"
Branch: `codex/fib-anchor-fix-v2`
PR: https://github.com/klintaruvinga-png/smcsmartfib-WebApp/pull/344
Date of comparison: 2026-06-03

## Summary

This report compares the parity gate results immediately before and after the `ec5eee8` patch was recorded in the repository.

| Metric | Before (reports/phase4-gate.json run_date 2026-06-02) | After (reports/phase4-parity/phase4-gate.json run_date 2026-06-03) |
|---|---:|---:|
| overall_parity_pct | 40.89% | 40.89% |
| gate | FAIL | FAIL |
| total_tuples | 384 | 384 |
| exact_matches | 144 | 144 |
| acceptable_drift | 13 | 13 |
| critical_mismatches_count | 227 | 227 |

## Observations

- The parity metrics are unchanged between the two gate artifacts. This indicates the validator comparison used the same paired export snapshots for both runs.
- The `ec5eee8` patch updates anchor computation logic in `mt5/FibEngine.mqh` and adds debug keys, but the MT5 export artifacts used by the validator were not updated after the patch — the validator compares static JSON exports.

## Conclusion

- The repository changes successfully applied at commit `ec5eee8` (branch present and commit visible). However, because the parity validator runs against exported MT5 snapshots, a passing parity gate requires re-exporting MT5 fib levels from a running EA built with the patched `FibEngine.mqh`.
- Until the EA is recompiled and fresh `mt5-levels.json` is captured from the patched EA, the parity run will not reflect the patch's effect.

## Recommended next steps

1. Rebuild/deploy the EA with the `ec5eee8` changes and capture a fresh `mt5-levels.json` snapshot at the same UTC timestamp as the Pine capture.
2. Re-run the parity validator with the new `mt5-levels.json` and `pine-levels.json` and save the result as `reports/phase4-parity/phase4-gate-post-ec5eee8.json`.
3. If parity improves, document the delta and close the Phase 4 gate when thresholds are met.
4. If parity remains poor, focus debug on:
   - Session/week ISO boundaries (verify `GetISOWeekYear()` behavior across source data),
   - Anchor session-key selection and grouping,
   - Time alignment between MT5 bar indexing and Pine closed-bar snapshots.

## Artifacts referenced

- `reports/phase4-gate.json` (before)
- `reports/phase4-parity/phase4-gate.json` (after)
- `mt5/FibEngine.mqh` (patched)
- `reports/phase4-parity/mt5-levels.json` and `reports/phase4-parity/pine-levels.json` (paired exports)

