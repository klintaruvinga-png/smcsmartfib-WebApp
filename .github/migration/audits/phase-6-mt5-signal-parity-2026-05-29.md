# Phase 6 MT5 Signal Parity Audit - 2026-05-29

## Audit Scope

Re-validate the MT5 Phase 6 signal-candidate path after expanding signal fib inputs from M15-only to `M15/H1/H4`, with explicit focus on keeping the existing AOV, equilibrium, directional, and RR gates intact while preserving Phase 4 fib parity and backend payload stability.

## Contract Under Audit

- Patch surface:
  - `mt5/FibEngine.mqh`
  - `mt5/SignalEngine.mqh`
  - `scripts/mt5-signal-dispatch.test.mjs`
  - `mt5/MarketDataEngine.mqh` comment-only clarification
- Signal-input change:
  - aggregate `M15`, `H1`, and `H4` fib levels for nearest-trigger selection
  - stamp each `FibLevelOut` with its source timeframe
  - resolve authority range from the selected trigger timeframe's `HTF_AF` `0.0` and `100.0` levels
- Guard rails preserved:
  - no Pine edits
  - no backend payload or schema changes
  - no WordPress ingest or parity-test changes
  - no D1 signal-selection widening
  - no change to AOV, equilibrium, directional, CHOP, displacement, confidence, or RR formulas

## Validation Results

- `npx vitest run scripts/mt5-signal-dispatch.test.mjs` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php scripts/parity-validator.php` -> PASS
  - synthetic self-test mode
  - `384/384` exact matches
  - gate `PASS`
- `php scripts/parity-validator.php --out reports/phase4-gate-2026-05-29.json` -> PASS
  - wrote machine-readable gate output to `reports/phase4-gate-2026-05-29.json`
  - result remains synthetic self-test because no fresh MT5/Pine export pair was available in the repo
- `npm run validate:impl` -> PASS after writing `reports/codex-implementation.meta.json`

## Signal Path Parity Assessment

- Fib geometry parity: preserved. The new signal helper reuses the existing anchor and ratio math per timeframe instead of introducing a new formula path.
- Signal authority parity: improved. Mixed-timeframe nearest-trigger selection now reconstructs the authority range from the selected trigger timeframe instead of using an ambiguous shared range.
- Payload parity: unchanged. `SignalToJson()` field names and shapes remain intact.
- Regression coverage: improved. The source-contract guard now fails if the signal path falls back to M15-only inputs or if the existing `AOV_EQUILIBRIUM_ZONE`, `AOV_EQUILIBRIUM_LEVEL`, or `RR_BELOW_MIN` markers are removed.

## Audit Conclusion

Repository-level parity remains intact after the multi-timeframe signal-input hardening patch. The MT5 signal path now consumes `M15/H1/H4` fib levels and evaluates the selected trigger against the correct timeframe authority range without widening backend contracts or changing Pine formulas.

## Pending Manual Closeout

- Capture one H1 or H4 candidate that passes using the correct timeframe authority range in MT5 or Strategy Tester logs.
- Capture one blocked equilibrium case in MT5 or Strategy Tester logs after the multi-timeframe expansion.
- Capture one blocked RR-below-`2.0` case in MT5 or Strategy Tester logs after the multi-timeframe expansion.
- Capture one full `/ea/signal-candidates` dispatch cycle with no serialization or ingestion errors.
- Re-run `php scripts/parity-validator.php --mt5-file <fresh-export> --pine-file <fresh-export> --out reports/phase4-gate-2026-05-29.json` with real exports before claiming operational parity closeout.
