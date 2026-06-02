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

## Phase 3–7

Not started in this patch. The next behavior-preserving extraction should target another low-reflection, self-contained service area and keep the same baseline gate expectation unless the two known failures are resolved separately.
