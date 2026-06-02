# SMC SuperFIB Plugin Refactor Completion Checklist

## Scope status

| phase | extraction | status |
|---|---|---|
| Phase 1 | REST route registration | Complete |
| Phase 2 | Auth and permission checks | Complete |
| Phase 3 | CORS policy and preflight handling | Complete |
| Phase 4 | Settings and risk helper normalization | Complete |
| Phase 5 | Watchlist symbol helper normalization | Complete |
| Phase 6 | EA request helper utilities | Complete |
| Phase 7 | Shared plugin utility helpers | Complete |

## Compatibility checklist

| check | status |
|---|---|
| REST namespace, route paths, methods, callbacks, and permission callback semantics preserved | PASS |
| Public route permission callback methods retained on `SMC_SuperFib_Sniper_REST` | PASS |
| Reflection-coupled private helper names retained as delegates where tests use them | PASS |
| Phase 0 inventory and blast-radius artifacts retained | PASS |
| Refactor phase summary updated through closeout | PASS |

## Verification checklist

| command | result |
|---|---|
| `php -l wordpress/smc-superfib-sniper/class-route-registrar.php && php -l wordpress/smc-superfib-sniper/class-auth-service.php && php -l wordpress/smc-superfib-sniper/class-cors-service.php && php -l wordpress/smc-superfib-sniper/class-ea-request-service.php && php -l wordpress/smc-superfib-sniper/class-plugin-utils.php && php -l wordpress/smc-superfib-sniper/class-settings-service.php && php -l wordpress/smc-superfib-sniper/class-watchlist-service.php && php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-get-soak-report.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | PASS |
| Full PHP test-file gate using `passed=0; failed=0; failed_files=(); for f in wordpress/smc-superfib-sniper/tests/php/*.php; do echo "== $f =="; if php "$f"; then passed=$((passed+1)); else failed=$((failed+1)); failed_files+=("$f"); fi; done; printf 'PHP test files: %d passed, %d failed\n' "$passed" "$failed"; if [ "$failed" -gt 0 ]; then printf 'Failed files: %s\n' "${failed_files[*]}"; exit 1; else printf 'Failed files: none\n'; fi` | PASS: 25 passed, 0 failed; failed files: none |
| `npm run build` | PASS |
| `npm run test:focused` | WARNING: fails in the repo test environment with React dispatcher-null `Invalid hook call` errors; a temporary minimal `renderHook` smoke test reproduced the same environment failure. |

## PR #332 Phase 1+ audit closeout

- Re-audited runtime PHP changes from `fde38da` through `b916526`, excluding the already-accepted USC cent-account fix at `30ba3ed`.
- Closed the P1 review gap for PR #332 Phase 1+ runtime PHP changes: no new defects found after route-registration, auth, CORS, settings/risk, watchlist, EA request, and shared utility extraction review.
- Closed the P2 test-command concern: the verified 25/0 result uses the full `for f in wordpress/smc-superfib-sniper/tests/php/*.php; do ... php "$f" ... done` loop form restored in `7804886`, not a single `php tests/*.php` invocation.
- Current verification output explicitly ended with `PHP test files: 25 passed, 0 failed` and `Failed files: none`.

## Closeout notes

- The previous accepted baseline of 23 passing files and 2 known failures is superseded by the closeout result: all 25 PHP test files now pass.
- `test-progressive-lot-sizing.php` was restored by keeping staged lot sizing on the existing USC risk budget instead of multiplying pip value by an extra USC scale factor.
- `test-mt5-snapshot-contract.php` was restored by surfacing HTF AOV equilibrium before generic candle-staleness diagnostics.
- The configured frontend focused Vitest suite is not a plugin-refactor pass/fail signal in this checkout because even a minimal `renderHook` smoke test fails with React's dispatcher unset; production `npm run build` passes.
