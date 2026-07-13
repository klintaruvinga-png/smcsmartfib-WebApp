# Issue summary

Immediately after the successful license allow, downstream EA bridge POST calls were still failing the backend auth gate with `SMC SuperFIB EA bridge auth failed: missing user_id.`. The failure surface was limited to the MT5 EA POST payloads sent after init: `/ea/heartbeat`, `/ea/account-sync`, and `/ea/symbol-sync`.

# Root cause implemented

`mt5/MarketDataEngine.mqh` was constructing JSON bodies for `SendHeartbeat()`, `SendAccountSync()`, and `SendSymbolSync()` without the required top-level `user_id` field. The backend `permission_ea_bridge()` gate reads `user_id` from the JSON payload before falling back to query params and rejects `user_id <= 0`, so the narrow fix was to inject `wpUserId` as an integer into each POST body without changing the backend contract or the working `SendLicenseCheck()` query-param flow.

# Exact files changed

- `mt5/MarketDataEngine.mqh`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php`
- `reports/codex-implementation.meta.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_ea-post-init-missing-user-id.md`
- `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`
- `reports/phase-1-ea-bridge-implementation-report.md`
- `.smc-workflow-state.json`
- `reports/codex-implementation.md`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` - PASS
- `npm run check:mql` - PASS
- `npm run validate:impl` - PASS

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_ea-post-init-missing-user-id.md`
- `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`
- `reports/phase-1-ea-bridge-implementation-report.md` (updated)

# Remaining risks

- Live MT5 terminal verification is still required to prove the post-license init chain now reaches backend handlers end-to-end.
- The workspace can validate backend auth behavior and static EA payload construction, but it cannot execute a real MT5 attach/heartbeat cycle from here.
- Backend stale-data protections remain intact; if `wpUserId` is misconfigured to `<= 0` in a live terminal, the backend will continue to reject the request by design.

# Any contract ambiguities resolved during implementation

- The contract required tests for the repaired surface, but the repository does not include an executable MT5 test harness for these POST builders. I took the smallest safe interpretation: patch the three MQL payload builders and extend the existing PHP bridge integration tests only for the required auth regressions (`missing user_id` and `user_id = 0`) rather than introducing new infrastructure.
