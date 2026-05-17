# Phase 1 MT5 EA License Check Parity Audit - 2026-05-17

**Report Date**: 2026-05-17  
**Phase**: Phase 1 - EA bridge operational gate  
**Auditor**: Codex  
**Status**: PASS (code parity restored) - live deployment verification pending

---

## Executive summary

This audit re-validates the `GET /wp-json/sniper/v1/ea/license-check` bridge contract after the missing-`user_id` defect. Code parity is restored: the MT5 EA now sends `user_id` in the GET query string, and the backend already reads that value through the existing auth callback path. Live terminal parity remains pending until the patched EA is deployed and observed in server logs.

## Contract surfaces checked

| Surface | MT5 EA | Backend | Result |
|---|---|---|---|
| Route | `GET /wp-json/sniper/v1/ea/license-check` | Registered under `sniper/v1` | MATCH |
| Auth header | `X-EA-API-Key` in `cachedHeaders` | `permission_ea_bridge()` reads supported aliases | MATCH |
| `user_id` transport | Query string `?user_id=<wpUserId>` | `ea_request_value()` falls back to `$request->get_param('user_id')` | MATCH |
| Missing `user_id` behavior | Sender defect should fail safe | Returns `smc_sf_user_required` / 400 | MATCH |
| Invalid `user_id` behavior | No sender-side bypass | Returns `smc_sf_user_invalid` / 403 | MATCH |
| User binding | Sends authenticated user id | `wp_set_current_user($ea_user_id)` on success | MATCH |
| License decision layer | No change | Existing allowed/blocked logic unchanged | MATCH |

## Evidence re-validated

- `mt5/MarketDataEngine.mqh` now appends `user_id` to the license-check GET URL before `account_id`, `terminal_id`, and `ea_version`.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` already resolves `user_id` through `ea_request_value()` and then validates positive integer semantics in `permission_ea_bridge()`.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` now includes a query-param-only `user_id` request with an empty JSON body.

## Validation results

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php` - PASS
- Manual local harness:
  missing `user_id` -> 400
  `user_id=0` -> 400
  valid query-param `user_id` -> 200
  success path bound current user context to `7`

## Parity boundaries preserved

- Backend remains the source of truth for EA auth and license-check outcomes.
- No frontend-only signal or license truth was introduced.
- No stale-data, heartbeat, account-sync, symbol-sync, or market-stream logic changed.
- No API contract widening beyond restoring the intended GET transport for `user_id`.

## Remaining parity gap

The code contract is aligned, but deployed runtime parity is still pending. Required post-deploy evidence:

- one real MT5 EA session showing `license allowed` or `license blocked` in server logs
- absence of repeated `SMC SuperFIB EA bridge auth failed: missing user_id.` for normal license-check traffic
- confirmation that the rebuilt EA binary is the one attached in the target terminal

## Conclusion

Phase 1 license-check parity is restored at the code-contract level. The only remaining gap is live deployment verification of the patched EA request path.
