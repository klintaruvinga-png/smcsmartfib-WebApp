# Bug Sweep Report: Watch Blueprint

Date: 2026-05-31
Issue: SMC Intake - Watch blueprint PATCH

## Runtime Integrity Scope

- Backend plan source: `SMC_SuperFib_Sniper_REST::build_pending_or_confirmed_plan()`
- Frontend plan source contract: `TradePlan.source`
- Dashboard rendering and ranking: Signal Plans page
- Persistence guard: `smc_sf_trade_plans`

## Findings

- Confirmed root cause: the backend rejected every unconfirmed `WATCH` signal before plan construction.
- Confirmed guard retained: `backendConfirmed=true` still returns the existing backend plan path unchanged.
- Confirmed lifecycle suppression retained: `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` remain planless.
- Confirmed persistence guard retained: only `backend-blueprint` plans with `backendConfirmed=true` are persisted to `smc_sf_trade_plans`.
- Confirmed stale-data guard retained: watch blueprints require `data_live === true` and `engine_blocker === 'OK'`.

## Regression Coverage

- Added natural live WATCH fixture coverage for `watch-blueprint`.
- Added snapshot coverage proving `watch-blueprint` is exposed in `plans` and not persisted.
- Existing open-position and pending-order lifecycle assertions remain in place.
- Added frontend rendering coverage for read-only watch blueprints.
- Added ranking coverage for same-verdict plan quality ordering.

## Remaining Manual Checks

- Verify `/ladders` on a live watchlist symbol with fresh MT5 data exposes `watch-blueprint` only when `engineBlocker` is `OK`.
- Verify an active open position or pending order keeps `plan === null`.
- Verify no trade queue rows are created from watch blueprints in a live environment.
