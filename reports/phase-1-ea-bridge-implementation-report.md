# Phase 1 EA Bridge Implementation Report

## Summary
- Implemented four additive EA bridge routes under the existing `/wp-json/sniper/v1/ea/*` namespace.
- Preserved the existing `POST /wp-json/sniper/v1/ea/market-stream` route, handler contract, auth gate, persistence, and regression coverage.
- Reused `smc_sf_account_snapshots` for account-sync by storing EA bridge state inside the existing JSON blob.
- Added dedicated `smc_sf_symbol_sync` persistence for broker symbol metadata and upserts.
- Implemented `GET /ea/license-check` as a soft operational gate only. No Stripe, subscription, billing, or commercial licensing logic was added.
- Resolved the 2026-05-16 live `missing user_id` failure on `GET /ea/license-check` by sending `user_id` as a query parameter from the MT5 EA while preserving the existing backend auth contract.

## Files changed
- `mt5/MarketDataEngine.mqh`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
- `.github/migration-status.md`
- `reports/phase-1-ea-bridge-implementation-report.md`

## Routes added
- `POST /wp-json/sniper/v1/ea/heartbeat`
- `POST /wp-json/sniper/v1/ea/account-sync`
- `POST /wp-json/sniper/v1/ea/symbol-sync`
- `GET /wp-json/sniper/v1/ea/license-check`

## Schema changes
- Added dedicated table `smc_sf_symbol_sync` through the plugin database creation pattern and bridge-table migration helper.
- Table fields:
  `id`, `user_id`, `account_id`, `terminal_id`, `broker`, `broker_server`, `broker_symbol`, `normalized_symbol`, `base_symbol`, `visible`, `selected`, `digits`, `point`, `contract_size`, `trade_mode`, `min_lot`, `max_lot`, `lot_step`, `spread`, `currency_profit`, `currency_margin`, `last_seen_at`, `created_at`, `updated_at`, `raw_json`
- Unique key:
  `user_id + account_id + terminal_id + broker_symbol`

## Persistence decisions applied
- Heartbeat:
  explicit EA heartbeats append `engine_runs` rows with `status=heartbeat` and `summary.source=explicit_heartbeat`.
- Account-sync:
  reused `smc_sf_account_snapshots`; persisted EA bridge account state under `data.eaBridge.accounts[account_id|terminal_id]` and preserved the raw payload in `raw_json`.
- Symbol-sync:
  wrote broker symbol metadata into the dedicated `smc_sf_symbol_sync` table and preserved both `broker_symbol` and `normalized_symbol` exactly as provided.
- License-check:
  used the existing EA API-key + `user_id` auth convention as the operational gate and supported optional future block metadata from the account snapshot blob.

## Issue resolution - 2026-05-17
- Evidence:
  live logs showed repeated `SMC SuperFIB EA bridge auth failed: missing user_id.` entries with no following `license allowed` or `license blocked` result, confirming the request was rejected inside `permission_ea_bridge()`.
- Root cause:
  the MT5 EA `GET /ea/license-check` request was sending `account_id`, `terminal_id`, and `ea_version` in the query string but was not sending `user_id`, so the backend intentionally rejected the request before the license-decision layer.
- Fix applied:
  `mt5/MarketDataEngine.mqh` now includes `user_id=<wpUserId>` in the license-check query string. No backend auth relaxation was applied because `ea_request_value()` already reads `$request->get_param('user_id')` for GET requests.
- Regression protection:
  `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` now covers a query-param-only `user_id` request with an empty JSON body to protect the live GET transport path.
- Backend authority:
  preserved. Missing `user_id` still returns 400, invalid `user_id` still returns 403, API key handling is unchanged, and `wp_set_current_user()` remains the binding point on success.

## Issue resolution - 2026-05-17 (post-init POST payloads)
- Evidence:
  after the license gate fix, the next live failure remained `SMC SuperFIB EA bridge auth failed: missing user_id.` on the first downstream POST bridge calls reached during init.
- Root cause:
  `mt5/MarketDataEngine.mqh` stored `wpUserId` correctly but omitted it from the JSON bodies built by `SendHeartbeat()`, `SendAccountSync()`, and `SendSymbolSync()`, so `permission_ea_bridge()` rejected the request before the handlers executed.
- Fix applied:
  `mt5/MarketDataEngine.mqh` now injects `"user_id": <wpUserId>` as an integer top-level field in all three POST payloads. No backend auth, route, or stale-data logic was changed.
- Regression protection:
  the existing PHP bridge tests for heartbeat, account-sync, and symbol-sync now explicitly assert that missing or zero `user_id` continues to fail with `smc_sf_user_required`, preserving backend authority while documenting the required payload contract.
- Backend authority:
  preserved. API key validation order is unchanged, `user_id > 0` enforcement is unchanged, `SendLicenseCheck()` remains query-param based, and the dashboard/backend source-of-truth boundary is unchanged.

## Tests added
- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php`

## Tests run
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-rest-bootstrap-settings.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`

## Pass/fail result
- PASS: all eight PHP test scripts above completed successfully in the local workspace.

## Known limitations
- Live MT5 terminal verification was not executable from this workspace, so post-fix runtime confirmation still requires a deployed EA session and server log review.
- No live soak or staging terminal verification was run from this workspace.
- `GET /ea/license-check` is intentionally limited to operational access validation and optional stored disable flags. It is not a commercial licensing system.
- Symbol-sync table creation is available through plugin activation and the bridge-table migration helper used by the symbol-sync path.

## Rollback notes
- Revert `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` to remove the routes and handlers.
- Drop or ignore the `smc_sf_symbol_sync` table if rolling back the dedicated symbol-sync persistence.
- Remove the new Phase 1 PHP test scripts if the backend routes are reverted.
- Revert the migration-status checklist entry if the backend route implementation is rolled back.

## Next recommended step
- Run staging Phase 1 bridge verification with a real MT5 terminal against:
  `/ea/license-check`, `/ea/heartbeat`, `/ea/account-sync`, `/ea/symbol-sync`, and the unchanged `/ea/market-stream` path, then perform the planned soak validation for heartbeat continuity and account/symbol parity.
