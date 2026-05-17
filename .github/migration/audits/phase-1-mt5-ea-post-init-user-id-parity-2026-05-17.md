# Phase 1 MT5 EA Post-Init user_id Parity Audit - 2026-05-17

**Report Date**: 2026-05-17  
**Phase**: Phase 1 - EA bridge post-init sync chain  
**Auditor**: Codex  
**Status**: PASS (code parity restored) - live deployment verification pending

---

## Executive summary

This audit re-validates the Phase 1 MT5 EA bridge contract after the post-license `missing user_id` failures on `/ea/heartbeat`, `/ea/account-sync`, and `/ea/symbol-sync`. Code parity is restored: the EA now sends `user_id` in each post-init JSON body, and the backend already consumes that field through the existing auth gate. Live terminal and database parity remain pending until the patched EA is rebuilt, attached, and observed against a real backend.

## Contract surfaces checked

| Surface | MT5 EA | Backend | Result |
|---|---|---|---|
| Shared owner id | Class member `wpUserId` set by `Initialize(..., userId)` | `permission_ea_bridge()` requires `user_id > 0` | MATCH |
| Heartbeat route | `POST /wp-json/sniper/v1/ea/heartbeat` with JSON `user_id` | `post_ea_heartbeat()` behind `permission_ea_bridge()` | MATCH |
| Account-sync route | `POST /wp-json/sniper/v1/ea/account-sync` with JSON `user_id` | `post_ea_account_sync()` behind `permission_ea_bridge()` | MATCH |
| Symbol-sync route | `POST /wp-json/sniper/v1/ea/symbol-sync` with JSON `user_id` | `post_ea_symbol_sync()` behind `permission_ea_bridge()` | MATCH |
| Auth header | `X-EA-API-Key` reused in `cachedHeaders` | `get_ea_api_key()` validates before user binding | MATCH |
| `user_id` extraction order | JSON body top-level field | `ea_request_value()` reads JSON payload before query params | MATCH |
| Invalid `user_id` behavior | No sender-side bypass | `smc_sf_user_required` for missing or zero values | MATCH |
| Initialization order | `SendAccountSync()` -> `SendSymbolSync()` -> `EventSetTimer()` | No contract change required | MATCH |

## Evidence re-validated

- `mt5/SMC_MarketDataEA.mq5` still passes `UserId` into `engine.Initialize(..., UserId)` and preserves the existing post-license init order.
- `mt5/MarketDataEngine.mqh` still stores `wpUserId` as a class member and now injects it into the JSON bodies for `SendHeartbeat()`, `SendAccountSync()`, and `SendSymbolSync()`.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` still validates API key first, then extracts `user_id` from JSON before query params, then rejects `user_id <= 0`, then binds `wp_set_current_user($ea_user_id)`.
- The existing PHP route tests now cover omitted and zero `user_id` failures on all three POST routes.

## Validation results

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - PASS
- `npm run check:mql` - PASS
- `npm run validate:impl` - PASS after adding `reports/codex-implementation.meta.json`

## Parity boundaries preserved

- Backend remains the source of truth for bridge authentication and ingest authorization.
- No frontend-only account, symbol, heartbeat, or signal truth was introduced.
- No stale-data protection, heartbeat cadence, route shape, or response contract was widened.
- `SendLicenseCheck()` remains query-param based and unchanged.

## Remaining parity gap

The code contract is aligned, but live parity is still pending. Required post-deploy evidence:

- one clean EA attach showing license allow, then successful account-sync and symbol-sync, then a successful heartbeat cycle
- absence of `SMC SuperFIB EA bridge auth failed: missing user_id.` for normal post-init bridge traffic
- confirmation that `smc_sf_account_snapshots` receives fresh account data and `smc_sf_symbol_sync` receives symbol rows from the patched EA
- confirmation that dashboard account telemetry reflects fresh backend data rather than stale state

## Conclusion

Phase 1 post-init bridge parity is restored at the code-contract level. The remaining gap is live deployment verification of the repaired EA POST payloads against the real backend and dashboard surfaces.
