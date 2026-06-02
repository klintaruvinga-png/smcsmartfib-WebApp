# SMC SuperFIB Plugin Refactor Phase Summaries

## Phase 0 — Inventory

| file | change |
|---|---|
| `reports/plugin-refactor-inventory.md` | Added pre-movement inventory of REST namespace/routes, monolith methods, `$wpdb` usage sites, table-like identifiers, constants, globals, hooks, response construction sites, and baseline verification results. |
| `reports/plugin-refactor-blast-radius.md` | Added test-level reflection blast-radius classification for all 25 PHP test files. |

## Phase 1 — Route registration extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-route-registrar.php` | Completed the route migration with declarative route definitions, a single registration loop, and centralized permission callback mapping while preserving the same namespace, route paths, HTTP methods, callbacks, and permission callbacks. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the registrar and keeps `register_routes()` as delegation only, leaving route definitions and route helper logic outside the monolith. |
| `reports/plugin-refactor-phase-summaries.md` | Recorded Phase 1 scope and verification status. |

Verification results for Phase 1:

- `php -l wordpress/smc-superfib-sniper/class-route-registrar.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`: PASS.
- PHP test-file baseline gate: PASS against the accepted current baseline of 23 passing files and 2 known failing files (`test-mt5-snapshot-contract.php`, `test-progressive-lot-sizing.php`).

## Phase 2 — Auth and permission extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-auth-service.php` | Added `SMC_SuperFib_Auth_Service` to own user, admin, EA bridge, EA market-stream, API-key, and EA user binding permission logic. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the auth service and keeps public permission callback methods as compatibility delegates for the route registrar and existing tests. |
| `reports/plugin-refactor-phase-summaries.md` | Recorded Phase 2 scope and verification status. |

Verification results for Phase 2:

- `php -l wordpress/smc-superfib-sniper/class-auth-service.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`: PASS.
- PHP test-file baseline gate: PASS against the accepted current baseline of 23 passing files and 2 known failing files (`test-mt5-snapshot-contract.php`, `test-progressive-lot-sizing.php`).

## Phase 3 — CORS service extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-cors-service.php` | Added `SMC_SuperFib_Cors_Service` to own allowed-origin lookup, origin matching, allowed-header strings, CORS header emission, preflight handling, and origin consistency validation. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the CORS service and keeps the original private static CORS helper methods as compatibility delegates for boot-time hooks and reflection-based regression tests. |
| `reports/plugin-refactor-phase-summaries.md` | Recorded Phase 3 scope and verification status. |

Verification results for Phase 3:

- `php -l wordpress/smc-superfib-sniper/class-cors-service.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`: PASS.
- PHP test-file baseline gate: PASS against the accepted current baseline of 23 passing files and 2 known failing files (`test-mt5-snapshot-contract.php`, `test-progressive-lot-sizing.php`).

## Phase 4 — Settings and risk helper extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-settings-service.php` | Added `SMC_SuperFib_Settings_Service` to own risk-allocation bounds, integer/float range helpers, and signal-board-size normalization. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the settings service and keeps the reflected private settings/risk helper methods as compatibility delegates. |

## Phase 5 — Watchlist helper extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-watchlist-service.php` | Added `SMC_SuperFib_Watchlist_Service` to own watchlist symbol sanitization, supported-symbol checks, and validated watchlist filtering. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the watchlist service and keeps the reflected private watchlist helper methods as compatibility delegates. |

## Phase 6 — EA request helper extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-ea-request-service.php` | Added `SMC_SuperFib_EA_Request_Service` to own EA request parameter fallback lookup and default EA user resolution. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the EA request service and delegates the private EA request helpers used across ingest endpoints. |

## Phase 7 — Shared plugin utility extraction

| file | change |
|---|---|
| `wordpress/smc-superfib-sniper/class-plugin-utils.php` | Added `SMC_SuperFib_Plugin_Utils` to own table-name composition, UTC MySQL timestamps, `$wpdb` error reads, REST response status extraction, and MySQL-to-ISO formatting. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Requires the utility service and keeps existing private utility helper names as delegates for behavior-preserving callers. |
| `reports/plugin-refactor-phase-summaries.md` | Recorded Phases 4–7 scope and verification status. |

Verification results for Phases 4–7:

- `php -l wordpress/smc-superfib-sniper/class-settings-service.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/class-watchlist-service.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/class-ea-request-service.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/class-plugin-utils.php`: PASS.
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php && php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php`: PASS.
- `php wordpress/smc-superfib-sniper/tests/php/test-get-soak-report.php`: PASS.
- PHP test-file baseline gate: PASS against the accepted current baseline of 23 passing files and 2 known failing files (`test-mt5-snapshot-contract.php`, `test-progressive-lot-sizing.php`).
