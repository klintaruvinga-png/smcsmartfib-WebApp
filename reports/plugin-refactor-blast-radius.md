# SMC SuperFIB Plugin Refactor Blast Radius (Phase 0)

Reflection-coupling inventory captured before PHP code movement. Levels are based on explicit Reflection API usage and number of reflected methods in each test file.

| test file | coupling level | reflection API hits | reflected methods detected |
|---|---|---:|---|
| `fib-test-helpers.php` | **medium** | 4 | — |
| `phase3_mt5_simulation_test.php` | **none** | 0 | — |
| `test-cors-regression.php` | **high** | 9 | `get_allowed_origins`, `get_cors_allowed_headers`, `is_allowed_origin`, `validate_cors_origins_consistency` |
| `test-dxy-reference-lot-sizing.php` | **none** | 0 | — |
| `test-ea-account-sync.php` | **none** | 0 | — |
| `test-ea-bridge-bootstrap.php` | **none** | 0 | — |
| `test-ea-heartbeat.php` | **none** | 0 | — |
| `test-ea-license-check.php` | **none** | 0 | — |
| `test-ea-market-stream.php` | **none** | 0 | — |
| `test-ea-symbol-sync.php` | **none** | 0 | — |
| `test-execute-signals-stage-lots.php` | **none** | 0 | — |
| `test-fib-ingestion.php` | **high** | 5 | `get_market_data_fib_levels`, `post_ea_fib_levels` |
| `test-fib-parity.php` | **none** | 0 | — |
| `test-get-soak-report.php` | **none** | 0 | — |
| `test-htf-authority-anchor.php` | **none** | 0 | — |
| `test-market-data-service-source-filter.php` | **none** | 0 | — |
| `test-mt5-snapshot-contract.php` | **high** | 29 | `apply_closed_session_price_states`, `armed_signal_confirmed`, `build_symbol_state`, `compute_signal_family_key`, `determine_engine_blocker`, `ensure_engine_snapshot`, `fetch_candles`, `fetch_quote`, `get_cached_price`, `latest_timestamp`, `normalize_market_timestamp`, `reconcile_live_signal_board`, `run_engine_for_symbols`, `upsert_display_signal_row` |
| `test-phase2-trade-telemetry.php` | **medium** | 2 | — |
| `test-pip-value-parity.php` | **high** | 5 | `get_instrument_spec`, `pip_value_from_market` |
| `test-progressive-lot-sizing.php` | **none** | 0 | — |
| `test-rest-bootstrap-settings.php` | **none** | 0 | — |
| `test-session-anchors.php` | **none** | 0 | — |
| `test-settings-risk-fallbacks.php` | **high** | 7 | `float_between`, `int_between`, `sanitize_risk_allocation` |
| `test-superfib-weighting.php` | **none** | 0 | — |
| `test-watchlist-snapshot-regression.php` | **high** | 13 | `delete_engine_snapshot`, `get_settings`, `is_engine_snapshot_current`, `is_supported_symbol`, `sanitize_symbols`, `save_watchlist` |
