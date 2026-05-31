# Phase 0 Sniper Parity Audit - Pending Blueprint Visibility

Date: 2026-05-31
Issue: SMC Intake - Blueprint Gating Throttling Adjustment

## Scope

Re-validated backend/dashboard plan semantics for lifecycle-throttled blueprint visibility. Pine formulas, Fibonacci ratios, stop logic, target logic, lot sizing, stage progression, and execution queue logic were intentionally untouched.

## Backend Parity

- Confirmed backend plans still use the unchanged `build_trade_plan()` output and retain `source: backend-blueprint`.
- Pending blueprints call the same `build_trade_plan()` path once and change only `source` to `pending-blueprint`.
- `backendConfirmed`, `status`, `engineBlocker`, stale-data gates, lifecycle diagnostics, and signal ID anchoring remain unchanged.
- Pending blueprint eligibility is limited to live data, `engineBlocker === OK`, final `status === ARMED`, and approved lifecycle throttle diagnostics.

## Dashboard Parity

- `TradePlan.source` now accepts `pending-blueprint` without weakening other `TradePlan` fields.
- Pending blueprints render the same entry, stop, target, risk, lot, and ladder fields as backend plans.
- Dashboard execution remains disabled through the existing `!signal.backendConfirmed` guard.
- The UI labels pending plans as `PENDING BLUEPRINT` and warns that execution remains disabled until backend confirmation.

## Persistence Parity

- Snapshot `plans` includes pending blueprints for dashboard visibility.
- `smc_sf_trade_plans` persistence is restricted to confirmed backend blueprints only.
- Pending blueprints do not become durable executable plan rows.

## Validation Evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` passed.
- `npx vitest run src/routes/-plan.test.tsx` passed.
- `npm run build` passed.
- `npm run validate:impl` passed.

## Parity Impact

No Pine or calculation formula parity changes were made. The API contract addition is limited to a new non-executable plan `source` value for approved pending blueprint visibility.
