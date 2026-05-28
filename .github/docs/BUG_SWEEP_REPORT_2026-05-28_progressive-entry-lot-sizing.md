# Bug Sweep Report - 2026-05-28 - Progressive Entry Lot Sizing

## Overview

Focused sweep of the backend-authoritative progressive entry lot-sizing path spanning:

- `build_trade_plan()` lot derivation
- `post_execute_signals()` staged queue payload mapping
- dashboard plan-card rendering of backend `lotSize`

## Findings

- `0` confirmed production defects in the currently implemented lot-sizing path.
- `0` confirmed backend-authority regressions.
- `0` confirmed stale-data or READY/backend-confirmed gate regressions.
- `1` confirmed test-coverage gap closed: the repo previously lacked direct regression tests for progressive lot derivation, staged queue mapping, and dashboard lot-size mirroring.

## Evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php` -> PASS
- `npx vitest run src/routes/-plan.test.tsx` -> PASS (`15/15`)

Sample backend plan JSON captured from the pinned regression harness:

```json
{
  "signalId": "sig-sample-plan",
  "symbol": "GBPUSD",
  "entries": { "e1": 1.275, "e2": 1.27, "e3": 1.26 },
  "stops": { "e1": 1.27, "e2": 1.26, "e3": 1.25 },
  "lotSize": { "e1": 0.33, "e2": 0.33, "e3": 0.5 },
  "riskUSC": 1000,
  "source": "backend-blueprint"
}
```

Sample queued payload set for the same staged-lot contract surface:

```json
[
  { "id": "ord-41808afb24a0c11e", "price": 1.2505, "lots": 0.11, "sl": 1.241, "tp": 1.258 },
  { "id": "ord-1606aebba58aeb6e", "price": 1.248, "lots": 0.27, "sl": 1.2385, "tp": 1.2625 },
  { "id": "ord-eeccebf8af8f75dd", "price": 1.2455, "lots": 0.43, "sl": 1.236, "tp": 1.269 }
]
```

## Recommendations

1. Keep progressive lot-sizing changes test-first and local to `build_trade_plan()` or `post_execute_signals()` only when one of these regressions fails.
2. Preserve client non-authority: `/user/execute-signals` should continue accepting only `signalIds`, never client-supplied lot sizes.
3. If broker-economics concerns emerge for indices or crypto, open a separate contract with broker-spec evidence instead of widening this patch.
