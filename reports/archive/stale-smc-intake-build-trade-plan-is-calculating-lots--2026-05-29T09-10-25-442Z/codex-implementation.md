## Issue summary

`build_trade_plan()` was calculating staged lot sizes from the stale `/user/account` blob via `equityUSC`, then masking missing equity with a fake `1 USC` floor. That let a dead snapshot produce tiny backend-authored plans even while the app wallet showed live telemetry equity.

## Root cause implemented

Updated backend plan sizing to use live `/account-telemetry` equity only when telemetry freshness is `live` and equity is positive. When live telemetry equity is missing, stale, or non-positive, the plan now keeps its existing structure but returns zero risk, zero stage lots, and `state = 'INVALID'` instead of fabricating a tiny valid plan.

## Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php`
- `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_trade-plan-telemetry-authority.md`
- `.github/migration/audits/phase-4-trade-plan-sizing-parity-2026-05-29.md`
- `reports/codex-implementation.md`

## Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- `npx vitest run src/routes/-plan.test.tsx`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_trade-plan-telemetry-authority.md`
- `.github/migration/audits/phase-4-trade-plan-sizing-parity-2026-05-29.md`

## Remaining risks

Live staging verification is still pending; the endpoint parity evidence captured here was generated from the local PHP harness rather than a running WordPress environment. The patch intentionally does not widen snapshot invalidation, change `/user/account`, or add a balance fallback.

## Any contract ambiguities resolved during implementation

Applied the smallest safe interpretation of the contract: only live positive telemetry equity is a valid sizing source; stale telemetry, missing telemetry, or non-positive telemetry equity must invalidate sizing. No `balance` fallback was added.
