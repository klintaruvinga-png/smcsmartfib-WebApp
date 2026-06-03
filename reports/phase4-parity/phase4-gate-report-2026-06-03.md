# Phase 4 Live EA vs Pine Fib Parity Report

Date: 2026-06-03

## Summary

- Validation command:
  `php scripts/parity-validator.php --mt5-file reports/phase4-parity/mt5-levels.json --pine-file reports/phase4-parity/pine-levels.json --out reports/phase4-parity/phase4-gate.json`
- Result: **FAIL**
- Overall parity: **40.89%**
- Total tuples compared: **384**
- Exact matches: **144**
- Acceptable drifts: **13**
- Critical mismatches: **227**

## Gate status

- `reports/phase4-parity/phase4-gate.json` is the authoritative gate artifact for this run.
- The Phase 4 live paired-export gate remains blocked because parity is far below the required `>= 99%` threshold.

## Key findings

- Most `EURUSD` M15 entries have zero exact matches and are dominated by critical price drift mismatches.
- The largest drift values are in `HTF_AF` on EURUSD, reaching up to **0.01759**.
- The validator uses a strict tolerance of `0.001`; many MT5 fib prices differ from Pine prices by several basis points.
- The failure is systemic across the live paired corpus, not isolated to a single ratio.

## What this means

- The live MT5 fib export values are not aligned with the Pine reference snapshots.
- Synthetic validator self-test proof is still valid for the tool, but the actual live gate shows real drift.
- Phase 4 cannot be considered closed until the live paired export mismatch is resolved.

## Recommended next steps

1. Confirm the MT5 export mechanism is using the same symbol normalization and timeframe mapping as Pine.
2. Verify the Pine capture snapshot timestamp matches the MT5 export snapshot exactly.
3. Investigate price input source differences, including timezone/session boundaries, bar indexing, and H4/H1/LTF handling.
4. Keep the current export files as preserved evidence, then re-run the validator after correcting the mismatch source.

## Relevant artifacts

- `reports/phase4-parity/mt5-levels.json`
- `reports/phase4-parity/pine-levels.json`
- `reports/phase4-parity/phase4-gate.json`
- `reports/fib-parity-validation.md`
- `reports/automation-update-log.md`
