# Fib Parity Validation

Date: 2026-05-28 (updated - Phase 4 timeframe contract corrected)  
Previous date: 2026-05-27  
Contract correction addendum: `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`

## Fixture comparison table

| Symbol | TF | LTF delta max | HTF_AF delta max | Status |
| --- | --- | --- | --- | --- |
| EURUSD | 15min | 0.00000 | 0.00000 | pass |
| EURUSD | 1h | 0.00000 | 0.00000 | pass |
| EURUSD | 4h | 0.00000 | 0.00000 | pass |
| EURUSD | 1day | 0.00000 | 0.00000 | pass |
| USDJPY | 15min | 0.00000 | 0.00000 | pass |
| USDJPY | 1h | 0.00000 | 0.00000 | pass |
| USDJPY | 4h | 0.00000 | 0.00000 | pass |
| USDJPY | 1day | 0.00000 | 0.00000 | pass |
| XAUUSD | 15min | 0.00000 | 0.00000 | pass |
| XAUUSD | 1h | 0.00000 | 0.00000 | pass |
| XAUUSD | 4h | 0.00000 | 0.00000 | pass |
| XAUUSD | 1day | 0.00000 | 0.00000 | pass |

## Validation source

- `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` - PASS
- `wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` - PASS
- `wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` - PASS
- `wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` - PASS
- `wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` - PASS

## Phase 4 Parity Validator

- `scripts/parity-validator.php` - self-test: 100% parity, 384/384 exact matches, 0 critical mismatches

## Phase 4 Live Corpus Status

```text
Status: IN PROGRESS - live EA deployed and T0 baseline captured 2026-05-27; timeframe contract corrected 2026-05-28; corpus accumulation underway
Action: Continue the 30-day MT5 soak, then capture Pine snapshots and run:
  php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json
Gate: PASS requires overall_parity_pct >= 99, critical_mismatches_count = 0, and 384 rows across 24 (symbol,timeframe,family) groups
```

## Latest live paired-export validation

- Date: 2026-06-03
- Command: `php scripts/parity-validator.php --mt5-file reports/phase4-parity/mt5-levels.json --pine-file reports/phase4-parity/pine-levels.json --out reports/phase4-parity/phase4-gate.json`
- Result: `FAIL`
- Overall parity: `40.89%`
- Tuples compared: `384`
- Exact matches: `144`
- Acceptable drifts: `13`
- Critical mismatches: `227`
- Gate artifact: `reports/phase4-parity/phase4-gate.json`

### Interpretation

The validator confirms the live paired MT5 vs Pine corpus is not aligned. Large price drifts exceed the Phase 4 tolerance threshold (`0.001`) across several `EURUSD` M15 and H1 fib levels, particularly in `LTF_SF` and `HTF_AF`.

### Next action

- Investigate MT5 export input and session/timeframe alignment
- Confirm the Pine reference capture timestamp matches the MT5 export snapshot
- Re-run the validator after fixing the drift source


## Run: 2026-06-04_112056
- Gate: **FAIL** (13.54%)
- MT5: 96 rows (mt5-levels.json)
- Pine: 96 rows (pine-levels.json)
- Report: phase4-gate-2026-06-04_112056.json

## Run: 2026-06-04_114528
- Gate: **FAIL** (54.17%)
- MT5: 96 rows (mt5-levels.json)
- Pine: 96 rows (pine-levels.json)
- Report: phase4-gate-2026-06-04_114528.json

## Run: 2026-06-04_134931
- Gate: **FAIL** (71.88%)
- MT5: 96 rows (mt5-levels.json)
- Pine: 96 rows (pine-levels.json)
- Report: phase4-gate-2026-06-04_134931.json

## Run: 2026-06-04_143044
- Gate: **FAIL** (66.67%)
- MT5: 96 rows (mt5-levels.json)
- Pine: 96 rows (pine-levels.json)
- Report: phase4-gate-2026-06-04_143044.json
