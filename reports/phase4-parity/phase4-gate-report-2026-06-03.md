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

## Post-PR344 MT5 export status (2026-06-03)

Post-PR344 MT5 export captured successfully.

Official Phase 4 subset coverage: 384/384.

Expanded audit corpus coverage: 624/640, missing NAS100 D1 HTF_AF.

Validator run against existing pine-levels.json failed at 32.03%, but this is not a valid final parity result until Pine is recaptured from the same UTC snapshot as the new MT5 export.

2026-06-03 — Post-PR344 MT5 fib export captured.

EA compile confirmed clean: 0 errors, 0 warnings.

Official Phase 4 gate subset exported successfully:
EURUSD, USDJPY, XAUUSD across M15/H1/H4/D1 and LTF_SF/HTF_AF.
Coverage: 384/384 rows.

Expanded audit corpus exported:
EURUSD, USDJPY, XAUUSD, BTCUSD, NAS100.
Coverage: 624/640 rows.
Missing supplemental group: NAS100 D1 HTF_AF = 16 ratios.
Official gate subset unaffected.

Validator run:
`php scripts/parity-validator.php --mt5-file reports/phase4-parity/mt5-levels.json --pine-file reports/phase4-parity/pine-levels.json --out reports/phase4-parity/phase4-gate-post-ec5eee8.json`

Result: FAIL, overall_parity_pct=32.03%.

Important: this is not a valid final post-PR344 parity result because mt5-levels.json was captured on 2026-06-03 04:43:25 while pine-levels.json was last written on 2026-06-02 04:31:33. Pine reference must be recaptured from the same UTC window before judging PR344 parity impact.

Phase 4 remains blocked pending synchronized MT5/Pine capture.
