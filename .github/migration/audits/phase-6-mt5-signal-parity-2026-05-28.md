# Phase 6 MT5 Signal Parity Audit - 2026-05-28

## Audit Scope

Re-validate the MT5 Phase 6 signal-candidate path after the Area of Value authority patch in `mt5/SignalEngine.mqh`, with explicit focus on preserving Phase 4 fib parity and enforcing Pine-aligned institutional value-zone and RR semantics.

## Contract Under Audit

- Patch surface: `mt5/SignalEngine.mqh` only
- Signal authority rules added:
  - block equilibrium zone candidates
  - block `50`-ratio equilibrium trigger candidates
  - block long candidates outside discount
  - block short candidates outside premium
  - block candidates with RR below Pine `min_rr = 2.0`
- Guard rails preserved:
  - no Pine edits
  - no `FibEngine` ratio or anchor changes
  - no `/ea/signal-candidates` payload change
  - existing CHOP, displacement, HTF alignment, and missing-data exits remain intact

## Validation Results

- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php scripts/parity-validator.php` -> PASS
  - synthetic self-test mode
  - `384/384` exact matches
  - gate `PASS`
- `php scripts/parity-validator.php --out reports/phase4-gate.json` -> PASS
  - wrote machine-readable gate output to `reports/phase4-gate.json`
  - result is still synthetic self-test because no fresh MT5/Pine export pair was available in the repo

## Signal Path Parity Assessment

- HTF authority range source: `HTF_AF` levels already emitted by `FibEngine.BuildSignalFibLevels()` and reconstructed locally in `SignalEngine` without contract widening.
- Value-zone semantics: matched to Pine baseline thresholds by using the existing dealing-range midpoint and `ict_eq_buffer_pct = 0.03`.
- RR semantics: matched to Pine baseline by blocking when computed reward-to-risk is below `2.0`.
- Payload parity: unchanged. `SignalToJson()` field names and shape remain intact.

## Audit Conclusion

Repository-level parity remains intact after the AOV authority patch, and the patched MT5 signal path now derives its authority gate from existing MT5 fib outputs without changing backend contracts. The repo evidence supports merge readiness for code review.

## Pending Manual Closeout

- Capture one valid discount-long pass in MT5 or Strategy Tester logs.
- Capture one valid premium-short pass in MT5 or Strategy Tester logs.
- Capture one blocked equilibrium case in MT5 or Strategy Tester logs.
- Capture one blocked RR-below-`2.0` case in MT5 or Strategy Tester logs.
- Re-run `php scripts/parity-validator.php --mt5-file <fresh-export> --pine-file <fresh-export> --out reports/phase4-gate.json` with real captures before claiming operational closeout.
