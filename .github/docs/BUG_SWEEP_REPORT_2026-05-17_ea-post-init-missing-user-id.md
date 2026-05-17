# SMC SuperFIB Bug Sweep Report - 2026-05-17 - EA Post-Init Missing user_id

## Issue summary

After the license gate started passing, the first downstream EA bridge POST calls still failed the shared backend auth gate with `SMC SuperFIB EA bridge auth failed: missing user_id.`. The broken surface was limited to the MT5 EA post-init payloads for `/ea/heartbeat`, `/ea/account-sync`, and `/ea/symbol-sync`.

## Root cause

Confirmed in code: `mt5/MarketDataEngine.mqh` stored the authenticated WordPress owner as `wpUserId`, but `SendHeartbeat()`, `SendAccountSync()`, and `SendSymbolSync()` built JSON request bodies without emitting that field. Confirmed in backend code: `permission_ea_bridge()` reads `user_id` from JSON first and rejects `user_id <= 0` before any route handler runs. This was an EA payload-contract defect, not a backend auth defect.

## Files affected

- `mt5/MarketDataEngine.mqh`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php`
- `reports/phase-1-ea-bridge-implementation-report.md`

## Fix applied

- Added integer `user_id` injection from `wpUserId` to the top-level JSON body in `SendHeartbeat()`.
- Added integer `user_id` injection from `wpUserId` to the top-level JSON body in `SendAccountSync()`.
- Added integer `user_id` injection from `wpUserId` to the top-level JSON body in `SendSymbolSync()`.
- Extended the existing PHP bridge tests so the three POST routes explicitly preserve the backend rejection path for omitted `user_id` and `user_id = 0`.
- Left `SendLicenseCheck()`, route URLs, HTTP verbs, backend auth order, and stale-data guards unchanged.

## Validation

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - PASS
- `npm run check:mql` - PASS
- `npm run validate:impl` - PASS after adding `reports/codex-implementation.meta.json`

## Runtime integrity assessment

- Backend authority preserved: YES
- Stale-data protections changed: NO
- Dashboard truth moved to frontend: NO
- Authentication surface widened: NO
- License-check transport changed: NO

## Remaining risks

- Live MT5 post-init verification is still required to prove the deployed EA now produces 200 responses for account-sync, symbol-sync, and heartbeat.
- This workspace cannot prove table writes in a real WordPress environment or prove absence of the production log line after deployment.
- If a live terminal is configured with `UserId <= 0`, the backend will continue to reject the payload by design.

## Conclusion

The isolated post-license failure was a missing-field transport bug in the MT5 EA POST payloads. The smallest safe patch restores the explicit `user_id` contract for the three downstream bridge routes without weakening backend validation or changing source-of-truth boundaries.
