# SMC SuperFIB Bug Sweep Report - 2026-05-17 - EA License Check Missing user_id

## Issue summary

Live logs showed repeated `SMC SuperFIB EA bridge auth failed: missing user_id.` failures for the Phase 1 `GET /wp-json/sniper/v1/ea/license-check` route. The failure occurred inside `permission_ea_bridge()` before the license decision layer executed.

## Root cause

Confirmed in code: `mt5/MarketDataEngine.mqh` built the license-check query string with `account_id`, `terminal_id`, and `ea_version`, but omitted `user_id`. Confirmed in backend code: `permission_ea_bridge()` already reads `user_id` through `ea_request_value()`, which falls back to `$request->get_param('user_id')` for GET requests. This was an EA transport defect, not a backend auth defect.

## Files affected

- `mt5/MarketDataEngine.mqh`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
- `reports/phase-1-ea-bridge-implementation-report.md`

## Fix applied

- Added `user_id=<wpUserId>` to the MT5 EA `GET /ea/license-check` query string.
- Added a PHP regression test that exercises a query-param-only `user_id` request with an empty JSON body.
- Preserved backend authority boundaries: no auth callback weakening, no API key changes, no response-contract changes, no stale-data rule changes.

## Validation

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php` - PASS
- Manual local harness checks:
  missing `user_id` -> `smc_sf_user_required` / 400
  `user_id=0` -> `smc_sf_user_required` / 400
  valid query-param `user_id` + API key -> 200
  success path still binds `wp_set_current_user()` to the authenticated user

## Runtime integrity assessment

- Backend authority preserved: YES
- Stale-data protections changed: NO
- Frontend/dashboard truth changed: NO
- License-decision logic changed: NO
- Authentication surface widened: NO

## Remaining risks

- Live post-deploy confirmation is still required from a real MT5 terminal session and production logs.
- This workspace cannot prove that the deployed EA binary has been rebuilt and attached with the patched request path.

## Conclusion

The confirmed runtime integrity issue was a missing-field transport defect on the MT5 EA side. The smallest safe patch restores the `user_id` bridge contract for `GET /ea/license-check` without weakening backend validation.
