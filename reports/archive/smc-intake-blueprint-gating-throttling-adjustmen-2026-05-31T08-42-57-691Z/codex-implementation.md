# Issue summary

Fix blueprint gate active pre-entry handling in `build_symbol_state()` so a structurally valid `READY` setup with a prior MT5 candidate still visible in `ACTIVE_PRE_ENTRY` is capped to `ARMED` instead of being hidden as `WATCH`.

# Root cause implemented

The lifecycle override in `build_symbol_state()` grouped `ACTIVE_PRE_ENTRY` with `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER`, hard-suppressing all three states to `WATCH`. The patch keeps open positions and pending orders as hard `WATCH` suppressions, and handles `ACTIVE_PRE_ENTRY` separately by changing only structurally `READY` signals to `ARMED`.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` - narrowed the hard lifecycle suppression list and added the `ACTIVE_PRE_ENTRY && READY -> ARMED` branch.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - added `build_symbol_state()` lifecycle regression coverage for no prior candidate, active pre-entry, active open position, and active pending order.

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` - passed

Targeted red validation was run before the production patch and failed as expected on `ACTIVE_PRE_ENTRY` returning `WATCH` instead of `ARMED`.

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_blueprint-gate-active-pre-entry.md`
- No Pine parity audit generated; the contract explicitly excluded Pine formula parity re-validation.

# Remaining risks

The patch intentionally does not alter MT5 candidate ingestion suppression, stale-data guards, execution dispatch, Pine formulas, frontend rendering, or API response shape. Remaining operational risk is limited to live-environment confirmation that dashboards display pre-entry structural setups as `ARMED` while execution remains blocked.

# Any contract ambiguities resolved during implementation

The contract did not specify exact fixture symbols or candle geometry for the new PHP tests. I used isolated MT5-authoritative symbols and real in-memory table rows to exercise the existing candle analysis, candidate lookup, lifecycle resolution, open-position matching, and pending-order matching paths without bypassing the backend source-of-truth logic.
