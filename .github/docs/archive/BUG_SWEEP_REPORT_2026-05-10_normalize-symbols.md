# Bug Sweep Report: Normalize Symbols for Crypto and Indices

Date: 2026-05-10

## Scope

Backend-authoritative watchlist symbol normalization for Deriv-facing index aliases and the requested crypto symbols, plus the watchlist mutation paths that invalidate `smc_sf_engine_snapshot`.

## Confirmed findings

1. The required production normalization path is already present.
   - File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
   - Evidence: `map_symbol_aliases()` maps `NASDAQ`, `NASDAQ100`, and `USTECH100` to `NAS100`; `sanitize_symbols()` and `is_supported_symbol()` both use that mapping before validation.

2. The requested crypto support is already present in the authoritative instrument registry.
   - File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
   - Evidence: `instrument_specs()` already contains `BTCUSD`, `ETHUSD`, `XRPUSD`, `BNBUSD`, and `SOLUSD`.

3. The remaining unguarded surface was regression coverage, not runtime logic.
   - File: `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
   - Impact before this patch: the branch had no focused automated proof that alias-based add/remove requests and the supported-crypto path continued returning the canonical persisted watchlist while invalidating the cached engine snapshot.

## Fixes applied

- Extended `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` to assert:
  - `sanitize_symbols()` canonicalizes `NASDAQ` and `US Tech 100` to `NAS100`
  - `is_supported_symbol()` accepts the alias path and `SOLUSD`
  - unsupported symbols remain rejected
  - `post_user_watchlist()` returns the canonical persisted watchlist for aliases and supported cryptos
  - `post_watchlist_add()` no-ops cleanly when an alias resolves to an already-present canonical symbol
  - `post_watchlist_add()` accepts `BTCUSD` through the real mutation path
  - `post_watchlist_remove()` removes `NAS100` when called with `US Tech 100` and clears the stale snapshot row

## Validation run

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
  - Existing harness failure: missing `register_deactivation_hook()` stub before the parity assertions execute

## Residual risks

- Live broker-side symbol availability was not re-queried through an authenticated Deriv account session in this environment.
- If Deriv later renames or delists one of these public symbols, the backend registry would still need a fresh contract update; this patch only hardens the currently implemented canonical set.
