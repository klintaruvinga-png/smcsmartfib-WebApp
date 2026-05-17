# SMC SuperFIB Bug Sweep Report - 2026-05-17 - Account/Symbol Sync user_id Observability

## Issue summary

The checked-in EA and backend source already preserve the `user_id` transport and auth contract for the post-init bridge routes, but live validation still lacked direct evidence that the MT5 terminal was dispatching the same resolved `user_id` that the backend accepts. That gap made the account-sync and symbol-sync ownership path harder to verify during attach-time triage.

## Root cause

The remaining defect was observability, not a second payload regression. `mt5/MarketDataEngine.mqh` already injects `wpUserId` into `/ea/license-check`, `/ea/heartbeat`, `/ea/account-sync`, and `/ea/symbol-sync`, and `permission_ea_bridge()` already enforces `user_id > 0` before route handlers run. What was missing was route-level logging at the exact send/auth handoff points.

## Files affected

- `mt5/MarketDataEngine.mqh`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`
- `reports/codex-implementation.md`

## Fix applied

- Added MT5 journal dispatch logs for `SendLicenseCheck()`, `SendHeartbeat()`, `SendAccountSync()`, and `SendSymbolSync()` that print the resolved `user_id` and route context before the HTTP call is sent.
- Added backend auth-success logging in `permission_ea_bridge()` after `wp_set_current_user()` so accepted requests record the resolved `user_id` on the authority side as well.
- Left payload shape, auth order, stale-data rules, and route handlers unchanged.

## Validation

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - PASS
- `npm run check:mql` - PASS
- `npm run validate:impl` - PASS
- `MetaEditor64.exe /compile:.../mt5/SMC_MarketDataEA.mq5` - INCONCLUSIVE (`exit=0`, but no compiler log and no `.ex5` artifact were produced by the local CLI invocation)

## Runtime integrity assessment

- Backend authority preserved: YES
- Authentication surface widened: NO
- `user_id` fallback introduced: NO
- Route contract changed: NO
- Stale-data protections changed: NO

## Remaining risks

- Live MT5 attach evidence is still required to prove the deployed EA binary emits the new dispatch logs and receives 200 responses for license-check, account-sync, symbol-sync, and heartbeat.
- Real backend logs and DB tables were not available from this workspace, so account snapshot and symbol sync row ownership could not be re-verified against a live environment.
- The MetaEditor CLI compile path remains unreliable here; rebuild confirmation still needs a human check in the MT5 environment.

## Conclusion

The smallest safe patch for this issue is observability hardening, not another transport rewrite. The source-of-truth contract remains backend-authoritative, and local tests confirm the accepted and rejected `user_id` paths still behave correctly while the new logs make the remaining live attach verification tractable.
