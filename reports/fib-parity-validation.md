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
