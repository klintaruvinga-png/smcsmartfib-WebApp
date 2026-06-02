# Plugin Refactor Blast Radius (Phase 0)

Generated: automated scan (Phase 0) and current refactor status

This report lists test files that use `ReflectionMethod`, helper reflection, or other coupling to `SMC_SuperFib_Sniper_REST` internals and legacy plugin behavior.

High-coupling tests (reflection / private methods):

- [tests/php/test-mt5-snapshot-contract.php](wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php)
  - Reflected methods: `ensure_engine_snapshot`, `armed_signal_confirmed`, `compute_signal_family_key`, `reconcile_live_signal_board`, `upsert_display_signal_row`, `fetch_quote`, `get_cached_price`, `latest_timestamp`, `fetch_candles`, `determine_engine_blocker`, `apply_closed_session_price_states`, `run_engine_for_symbols`, `build_symbol_state`, `normalize_market_timestamp`

- [tests/php/fib-test-helpers.php](wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php)
  - Reflection helper used for fib math/private helpers

- [tests/php/test-phase2-trade-telemetry.php](wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php)
  - Uses reflection helpers to access telemetry internals

Medium-coupling tests (indirect or helper reflection):

- test-watchlist-snapshot-regression.php
- test-get-soak-report.php
- test-fib-parity.php (via fib-test-helpers)
- test-progressive-lot-sizing.php
- test-pip-value-parity.php
- test-settings-risk-fallbacks.php

Low-coupling tests (endpoint contracts, CORS, bootstrap):

- test-cors-regression.php
- test-ea-heartbeat.php
- test-ea-account-sync.php
- test-ea-symbol-sync.php
- test-ea-license-check.php
- test-execute-signals-stage-lots.php
- test-market-data-service-source-filter.php
- test-fib-ingestion.php
- test-dxy-reference-lot-sizing.php
- test-superfib-weighting.php
- test-ea-bridge-bootstrap.php
- phase3_mt5_simulation_test.php

Refactor context:
- The current bootstrap now delegates to `includes/Legacy_SMC_SuperFib_Sniper_REST.php`, which remains the current runtime entrypoint.
- `includes/Service/*` and `includes/Rest/*` exist as the first extraction points, but the legacy runtime still contains the bulk of route handling and business logic.
- High-coupling tests should be re-scanned after the next extraction pass, because the blast radius may shift from legacy class internals to the newly exposed service API.

Notes:
- The full list and exact reflection lines are present in the tests under `wordpress/smc-superfib-sniper/tests/php/` and were discovered by scanning for `ReflectionMethod`.
- Phase 5 will require keeping specific reflected methods public on extracted classes until tests are migrated.
- No additional test coupling was introduced by the current bootstrap extraction step.

Next:
- Keep `Legacy_SMC_SuperFib_Sniper_REST` available as a compatibility bridge while migrating features into service classes.
- After the next extraction pass, update this report with newly scanned reflection usage and any service API contract dependencies.
- Run the phase 0 acceptance checks again once the service extraction reaches the next stability checkpoint.
