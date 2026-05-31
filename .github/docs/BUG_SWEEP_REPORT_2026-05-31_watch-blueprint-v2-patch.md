# Bug Sweep Report: Watch Blueprint V2 Patch

Date: 2026-05-31
Issue: SMC Intake - Watch blueprint v2 PATCH

## Runtime Integrity Scope

- Backend plan gate: `SMC_SuperFib_Sniper_REST::build_pending_or_confirmed_plan()`
- Pending blueprint source contract: `pending-blueprint`
- Persistence guard: `smc_sf_trade_plans`
- Stale-data and blocker gates: `data_live === true`, `engine_blocker === 'OK'`
- Hard lifecycle suppression: `ACTIVE_OPEN_POSITION`, `ACTIVE_PENDING_ORDER`

## Findings

- Confirmed root cause: unconfirmed ARMED/READY pending blueprints required sweep plus MSS or clean/strong displacement.
- Confirmed fix: ARMED/READY pending blueprints now require sweep only after live data, OK engine blocker, and hard lifecycle suppression checks pass.
- Confirmed backend authority retained: `backend_confirmed === true` still returns through the existing confirmed `build_trade_plan()` path.
- Confirmed stale-data protection retained: the patch did not alter `data_live === true` or `engine_blocker === 'OK'`.
- Confirmed lifecycle suppression retained: hard lifecycle states still return `null` before pending blueprint creation.
- Confirmed persistence guard retained: the weak-displacement pending blueprint is not persisted to `smc_sf_trade_plans`.

## Regression Coverage

- Updated PHP contract coverage for sweep-present weak-displacement ACTIVE_PRE_ENTRY ARMED setups.
- Added an assertion that the weak-displacement pending blueprint is not persisted as an executable trade plan row.
- Re-ran frontend plan page coverage to confirm watch rendering and ranking behavior remained green.

## Verification

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- `npx vitest run src/routes/-plan.test.tsx` passed with 24 tests.

## Remaining Manual Checks

- Replay representative WATCH, ARMED sweep-only, READY confirmed, and blocked fixtures against a live-like snapshot source before merge.
- Confirm in a live environment that pending/watch blueprints remain read-only and do not create trade queue or executable plan rows.
