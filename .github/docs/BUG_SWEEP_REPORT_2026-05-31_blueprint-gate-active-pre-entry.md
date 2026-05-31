# Bug Sweep Report - Blueprint Gate Active Pre-Entry

## Issue

`build_symbol_state()` suppressed `ACTIVE_PRE_ENTRY` lifecycle signals to `WATCH`, hiding structurally valid setups that should remain visible as `ARMED` while blueprint/trade-plan generation stays blocked.

## Runtime Integrity Sweep

- Backend source of truth preserved: signal state continues to be computed in `build_symbol_state()`.
- API shape preserved: no response fields, selectors, IDs, or contracts were changed.
- Stale-data protections preserved: price freshness, candle freshness, MT5 source filtering, and `determine_engine_blocker()` were not changed.
- Execution safety preserved: `ACTIVE_PRE_ENTRY` is capped to `ARMED`, so `backendConfirmed` remains false and `plan` remains null.
- Live trade suppression preserved: `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` still force `WATCH`.
- Candidate ingest suppression preserved: `post_ea_signal_candidates()` and duplicate suppression lifecycle handling were not changed.

## Patch Summary

- Removed `ACTIVE_PRE_ENTRY` from the hard `WATCH` lifecycle suppression list in `build_symbol_state()`.
- Added a separate `ACTIVE_PRE_ENTRY && READY -> ARMED` branch before duplicate READY suppression.
- Added PHP contract coverage for:
  - no prior candidate remains `READY`
  - active pre-entry caps `READY` to `ARMED`
  - active open position remains `WATCH`
  - active pending order remains `WATCH`

## Validation

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` - passed
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` - passed

## Remaining Risk

Live-environment smoke validation is still recommended for one symbol with a known prior pre-entry candidate to confirm the dashboard shows `ARMED` while execution remains blocked.
