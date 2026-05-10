# Bug Sweep Report - 2026-05-10

## Executive Summary

- Overall health: Stable after a targeted data-contract hardening pass across WordPress settings persistence and the PHP regression harness.
- Bugs found: 3 confirmed issues. One high-severity backend contract gap and two medium/low verification-harness defects.
- Fixes applied: Unsupported watchlist symbols are now rejected consistently on read and write; PHP harnesses now stub plugin deactivation hooks; the CORS regression expectation now matches the credentialed allowlist policy.
- Remaining risks: Global frontend lint remains noisy from pre-existing formatting drift outside this patch set. No Pine or MT5 execution logic was changed in this run.
- Migration readiness: Phase 0 remains ready for continued soak. Watchlist parity is stricter and verifier coverage is restored.

## Confirmed Problems

### Data Contract Verification

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| HIGH | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` - user settings watchlist flow | `post_user_settings()`, `get_settings()`, and `save_watchlist()` only sanitized watchlist tokens but did not validate them against `instrument_specs()`. Dedicated watchlist endpoints already validated. | Unsupported symbols could persist through the settings endpoint, reappear on subsequent reads, and leak into snapshot/engine polling paths, creating dashboard/backend contract drift and noisy stale placeholders. | Patched in this run. |

### Runtime & Stability Scan

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| MEDIUM | PHP regression harnesses under `wordpress/smc-superfib-sniper/tests/php` | Multiple tests `require` the plugin but only stubbed `register_activation_hook()`. The plugin boot path also registers `register_deactivation_hook()`. | Contract tests could fail during plugin load before assertions ran, reducing confidence in MT5 and settings regression coverage. | Patched in this run. |

### Cleanup / Verification Drift

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| LOW | `test-cors-regression.php` | Harness still expected an arbitrary `*.workers.dev` origin to pass, but the live CORS policy explicitly rejects wildcard Worker origins when credentials are enabled. | False-negative regression signal in the PHP suite. | Patched in this run. |

## Surgical Fixes Applied

| File | Change | Hardening Added |
|---|---|---|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Switched `post_user_settings()`, `get_settings()`, and `save_watchlist()` from `sanitize_symbols()` to `validate_watchlist_symbols()`. | All persisted and reloaded watchlists now share one supported-symbol contract with `/user/watchlist` add/remove endpoints. Existing corrupt rows are cleaned on read. |
| `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` | Added unsupported-symbol regression cases (`FOOBAR`) for stored settings, `save_watchlist()`, and `post_user_settings()`. | Prevents silent reintroduction of unsupported-symbol persistence. |
| `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | Added missing `register_deactivation_hook()` stub. | Restores plugin-load stability in the MT5 contract harness. |
| `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` | Added missing `register_deactivation_hook()` stub. | Keeps EA ingress regression coverage executable after plugin boot changes. |
| `wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php` | Added missing `register_deactivation_hook()` stub. | Restores harness compatibility. |
| `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php` | Added missing `register_deactivation_hook()` stub. | Restores harness compatibility. |
| `wordpress/smc-superfib-sniper/tests/php/test-rest-bootstrap-settings.php` | Added missing `register_deactivation_hook()` stub. | Restores harness compatibility. |
| `wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php` | Added missing `register_deactivation_hook()` stub and corrected the `another-test.workers.dev` expectation to `denied`. | Aligns verification with the live credentialed CORS policy and removes a false failure. |

## Parity Verification Results

| Dimension | Scope | Result | Drift |
|---|---|---|---|
| Watchlist contract parity | Settings read/write vs dedicated watchlist endpoints | Supported-symbol validation now consistent across all paths | Drift removed |
| Freshness parity | MT5 snapshot + engine contract harness | PASS via `test-mt5-snapshot-contract.php` | No new drift |
| Signal / regime parity | Backend engine logic | Unchanged in this sweep | No drift introduced |
| CORS policy parity | Test expectation vs live allowlist | Test now matches explicit allowlist behavior | Drift removed |

## Remaining Risks

- Full `npm run lint` remains blocked by pre-existing formatting drift in unrelated frontend files.
- This pass hardens symbol support contracts but does not yet add frontend transport anti-cache coverage to all polled GET endpoints.
- Existing persisted unsupported symbols will disappear from the watchlist on next read; that is the intended correction, but users with legacy custom symbols may notice the cleanup.

## Regression Checklist

- [x] `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-rest-bootstrap-settings.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- [x] `node .\\node_modules\\typescript\\bin\\tsc --noEmit`

## Safe Deployment Order

1. Deploy the updated WordPress plugin file.
2. Run the PHP regression bundle in the target environment.
3. Verify Account -> watchlist saves drop unsupported symbols and retain supported aliases like `XAU/USD` -> `XAUUSD`.
4. Monitor snapshot/engine logs for any residual references to removed legacy symbols.

## Do Not Touch List

- Pine fib formulas and MT5 execution logic: unchanged and out of scope for this contract fix.
- Backend stale-state authority rules: unchanged and still backend-owned.
- CORS wildcard policy for Worker origins: intentionally strict because credentialed requests are enabled.
