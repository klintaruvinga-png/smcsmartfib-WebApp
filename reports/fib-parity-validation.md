# Fib Parity Validation

Date: 2026-05-25 (updated — Phase 4 code complete)  
Previous date: 2026-05-14

## Fixture comparison table

| Symbol | TF | LTF delta max | HTF_AF delta max | Status |
| --- | --- | --- | --- | --- |
| EURUSD | 15min | 0.00000 | 0.00000 | pass |
| EURUSD | 1h | 0.00000 | 0.00000 | pass |
| EURUSD | 1day | 0.00000 | 0.00000 | pass |
| USDJPY | 15min | 0.00000 | 0.00000 | pass |
| USDJPY | 1h | 0.00000 | 0.00000 | pass |
| USDJPY | 1day | 0.00000 | 0.00000 | pass |
| XAUUSD | 15min | 0.00000 | 0.00000 | pass |
| XAUUSD | 1h | 0.00000 | 0.00000 | pass |
| XAUUSD | 1day | 0.00000 | 0.00000 | pass |

## Log sample

```text
[INFO] SMC SuperFIB fib calc {"symbol":"EURUSD","timeframe":"15min","chart_tf_seconds":900,"compression_threshold":0.002,"anchors":{"F1":{"high":70,"low":7,"valid":true},"F2":{"high":60,"low":6,"valid":true},"F3":{"high":50,"low":5,"valid":true}},"composite":{"high":61.5,"low":6.15,"valid":true,"valid_count":3},"htf_af":{"high":20,"low":2,"valid":true}}
```

## Validation source

- `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` — PASS ✅ (2026-05-25)
- `wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` — PASS ✅ (2026-05-25)
- `wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` — PASS ✅ (2026-05-25)
- `wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` — PASS ✅ (2026-05-25)
- `wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` — PASS ✅ (2026-05-25 — new Phase 4 contract tests)

## Phase 4 Parity Validator

- `scripts/parity-validator.php` — self-test: 100% parity, 288/288 exact matches, 0 critical mismatches

## Phase 4 Live Corpus Status

```
Status: PENDING — operator action required
Action: Let MT5 EA run against live market data; capture Pine snapshots; run:
  php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json
Gate: PASS requires overall_parity_pct >= 99 AND critical_mismatches_count = 0
```
