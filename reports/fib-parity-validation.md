# Fib Parity Validation

Date: 2026-05-14

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

- `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
- `wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php`
- `wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
- `wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
