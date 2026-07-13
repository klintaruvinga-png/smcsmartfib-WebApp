## Issue summary

The MT5 EA `GET /ea/license-check` request was reaching the backend without `user_id`, causing `permission_ea_bridge()` to correctly reject it with `smc_sf_user_required` before the license decision layer executed.

## Root cause implemented

`mt5/MarketDataEngine.mqh` built the license-check query string with `account_id`, `terminal_id`, and `ea_version`, but omitted `user_id`. The backend already supported reading `user_id` from GET params through `ea_request_value()`, so the implementation fix is EA-side only.

## Exact files changed

- `mt5/MarketDataEngine.mqh`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
- `reports/phase-1-ea-bridge-implementation-report.md`
- `reports/codex-implementation.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_ea-license-check-missing-user-id.md`
- `.github/migration/audits/phase-1-mt5-ea-license-check-parity-2026-05-17.md`

## Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php` - passed
- Manual auth-path validation via local PHP harness:
  missing `user_id` query param returned `smc_sf_user_required` with status 400
  `user_id=0` returned `smc_sf_user_required` with status 400
  valid query-param `user_id` returned status 200
  success path bound `wp_set_current_user()` to user `7`

## Reports generated

- `reports/codex-implementation.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_ea-license-check-missing-user-id.md`
- `.github/migration/audits/phase-1-mt5-ea-license-check-parity-2026-05-17.md`

## Remaining risks

- Live MT5 terminal execution and server-log confirmation are still required to prove the deployed EA now reaches `license allowed` or `license blocked` instead of `missing user_id`.
- This workspace can validate the PHP auth contract and request-shape regression, but it cannot execute a real deployed MT5 terminal session.

## Any contract ambiguities resolved during implementation

- The contract’s backend fallback change was not applied because repository reality already satisfies it: `ea_request_value()` falls back to `$request->get_param('user_id')`, so the smallest safe interpretation is an EA transport fix plus a regression test that exercises the GET query path explicitly.
