# Phase 0 Deriv Symbol Parity Audit

Date: 2026-05-10
Scope: Backend canonical symbol registry vs Deriv-facing public symbol labels for watchlist entry

## Parity contract

- Backend remains the source of truth for supported symbols.
- User-entered aliases may normalize into canonical backend keys, but the persisted watchlist must only contain canonical symbols.
- Watchlist mutations must invalidate `smc_sf_engine_snapshot` whenever the canonical persisted watchlist changes.

## Canonical set re-validated

- Index: `NAS100`
- Accepted public aliases: `NASDAQ`, `NASDAQ100`, `US Tech 100`
- Crypto: `BTCUSD`, `ETHUSD`, `XRPUSD`, `BNBUSD`, `SOLUSD`

## Evidence

1. Backend implementation
   - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
   - `map_symbol_aliases()`, `sanitize_symbols()`, `is_supported_symbol()`, `instrument_specs()`

2. Regression proof
   - `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
   - Result: alias canonicalization, supported-crypto acceptance, and snapshot invalidation all pass on the real watchlist mutation methods.

3. Deriv public naming check
   - Deriv market page labels `US Tech 100` as the Nasdaq 100 index.
   - Deriv public materials and trading-specification indexing expose the requested crypto-style tickers, including `BTCUSD`, `ETHUSD`, `XRPUSD`, `BNBUSD`, and public `SOLUSD` usage.

## Validation evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`

## Outcome

Parity is preserved for the current canonical symbol set: user-facing alias input resolves into backend-authoritative symbols, persisted watchlists stay canonical, and snapshot invalidation still occurs on real watchlist changes.

## Remaining gaps

- This audit does not replace a live authenticated Deriv symbol-list check.
- The standalone pip-parity harness has an unrelated bootstrap stub gap and was not used as parity evidence for this issue.
