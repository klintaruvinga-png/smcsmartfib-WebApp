# Bug Sweep Report - Blueprint Gating Throttle

Date: 2026-05-31
Issue: SMC Intake - Blueprint Gating Throttling Adjustment

## Runtime Integrity Finding

`build_symbol_state()` previously returned `plan: null` for every non-backend-confirmed signal. This suppressed deterministic plan visibility for live, unblocked `ACTIVE_PRE_ENTRY` throttled setups even though execution authority remained separately guarded by `backendConfirmed` and `/user/execute-signals`.

## Patch Applied

- Added `build_pending_or_confirmed_plan()` to expose non-executable pending blueprints only for live, `engineBlocker === OK`, ARMED lifecycle-throttled setups.
- Preserved confirmed plan behavior by returning the existing `build_trade_plan()` result unchanged for backend-confirmed signals.
- Guarded `smc_sf_trade_plans` persistence so only `source === backend-blueprint` with `signal.backendConfirmed === true` is written.
- Added dashboard handling for `pending-blueprint` with explicit non-executable labeling and warning text.

## Regression Sweep

- Stale and blocked states remain ineligible because pending plans require `$data_live === true` and `$engine_blocker === 'OK'`.
- `ACTIVE_OPEN_POSITION`, `ACTIVE_PENDING_ORDER`, and `AOV_EQUILIBRIUM_ZONE` remain null-plan paths in the PHP contract test.
- `/user/execute-signals` was not changed and still rejects non-confirmed or non-READY signals.
- Pending plans are included in snapshot `plans` payloads but are not persisted to executable `trade_plans` rows.

## Validation

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` passed.
- `npx vitest run src/routes/-plan.test.tsx` passed.
- `npm run build` passed.
- `npm run validate:impl` passed.
- `npm run lint` failed on pre-existing unrelated Prettier issues outside this patch scope.

## Remaining Risk

Live replay is still required for one `ACTIVE_PRE_ENTRY` setup to observe the snapshot payload and confirm `/user/execute-signals` continues to reject the unconfirmed signal in an integrated environment.
