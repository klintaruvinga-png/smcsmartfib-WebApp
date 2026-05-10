## 1. Issue classification
- Severity: HIGH
- Category: data-contract / wiring / runtime-bug
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS
- Phase impact: Phase 0 / Cross-phase

## 2. Confirmed evidence
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` defines `normalize_symbol_token()` as `preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $symbol))`. This only strips non-alphanumeric characters and uppercases input; it does not map aliases such as `NASDAQ` or `US Tech 100`. (lines 2200-2205)
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` has an authoritative `instrument_specs()` registry listing only `US30`, `NAS100`, `BTCUSD`, and `ETHUSD` for non-forex instruments. There is no `SOLUSD` entry and no alias table for alternative names. (lines 3238-3242)
- `is_supported_symbol()` normalizes the input then checks `instrument_specs()`, which means unsupported aliases are rejected before any broker-specific mapping can occur. (lines 3253-3256)
- `sanitize_symbols()` normalizes and deduplicates watchlist entries, but only retains symbols if they already pass the supported-symbol registry. That means a user can add `ETHUSD` but cannot add `SOLUSD` because the symbol registry simply lacks it. (lines 3269-3281)
- `twelve_symbol()` converts all-alpha 6-letter tokens into slash format for Twelve Data and leaves digit-containing tokens unchanged. This confirms the code assumes canonical symbols are already present, rather than resolving broker-specific aliases before formatting. (lines 3321-3326)
- Search for Deriv or broker-specific symbol alias logic returned no active matches in the current repo, so there is no evidence of a dedicated Deriv symbol normalization layer. (search result: none found)

## 3. Root cause hypothesis
- Most likely root cause: the backend supports only a narrow canonical symbol registry and does not normalize alternative index or crypto aliases before validation. (Confirmed)
- Why it fits: `NAS100` is accepted, but `NASDAQ` and `US Tech 100` are never mapped to `NAS100`; `ETHUSD` is accepted while `SOLUSD` is rejected because the symbol spec list lacks it. (Confirmed)
- What likely triggered the issue: a user-provided symbol alias or broker-specific naming from Deriv is passed through `normalize_symbol_token()` and then rejected by `is_supported_symbol()`. (Hypothesis)
- Confirmed/hypothesis markers:
  - `normalize_symbol_token()` is alias-agnostic and only uppercases/strips non-alphanumeric characters. (Confirmed)
  - The active instrument spec registry is too small for the top 5 traded cryptos and alternative index names. (Confirmed)
  - Deriv-specific naming may require a second normalization step or alias registry. (Hypothesis)

## 4. Blast radius
- Files likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Any frontend route that submits raw watchlist symbol text through the REST API, e.g. `src/routes/account.tsx` and `src/lib/api/sniperClient.ts`
- Systems affected:
  - backend watchlist validation and persistence
  - price refresh/quote mapping for MT5 / Deriv symbol feeds
  - dashboard watchlist entry and symbol acceptance
- Parity surfaces at risk:
  - canonical backend symbol registry versus broker/Deriv symbol naming
  - watchlist normalization contract versus actual live feed key formats
  - Twelve Data slash-format expectations for 6-letter pairs vs digit-containing index names
- Stale-state, cache, or authority risks:
  - If alias mapping is only added in one layer, unsupported symbols can still fail downstream validation
  - If unsupported symbols are filtered after initial acceptance, backend watchlist state and UI state can diverge

## 5. Regression surface
- Current guard rails:
  - `instrument_specs()` is the authoritative source for symbol support and pip sizing.
  - `sanitize_symbols()` rejects empty values and tokens longer than 12 chars.
  - `twelve_symbol()` already expects canonical normalized symbols for formatting.
- What could break if patched incorrectly:
  - broadening `normalize_symbol_token()` without a controlled alias registry may allow invalid or unsupported ticker-like input.
  - adding `SOLUSD` without verifying Deriv/MT5 contract conventions could break pricing or pip-value calculations.
  - changing symbol validation in the backend could affect watchlist persistence and related engine snapshot logic.
- Existing tests/coverage:
  - current watchlist normalization tests cover generic normalization and deduplication, but not alias mapping for indexes or crypto symbols.

## 6. Resolution path options
- Path A: add explicit alias mapping for known alternative index/crypto names in the backend.
  - map `NASDAQ` and `US TECH 100` to `NAS100`
  - add `SOLUSD` plus other top-5 crypto symbols to `instrument_specs()` if Deriv supply and MT5 contract support exist
  - keep `normalize_symbol_token()` unchanged and apply alias mapping before `is_supported_symbol()` and watchlist validation
- Path B: implement a configurable broker symbol alias registry that normalizes Deriv-specific names to canonical supported keys.
  - this is safer if multiple brokers use different naming conventions
  - it isolates alias logic from the core instrument spec registry
- Recommended: Path A for the narrowest correction surface, unless Deriv naming requires a more extensive alias registry. Path A is the smallest fix and preserves the existing authoritative instrument spec model.

## 7. Risk flags
- High-risk system involved: Yes — backend symbol normalization is central to both watchlist acceptance and price feed mapping.
- Requires parity re-validation: Yes — backend symbol registry and broker/Deriv naming normalization must be reconciled.
- Migration-blocking: Yes for Phase 0 stabilization if live symbol acceptance is expected to include the top traded crypto and index aliases.
- Human review required before merge: Yes — alias mappings and any new supported symbols should be reviewed against broker-specific contract names and existing MT5/Twelve Data conventions.

## 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Inputs Codex must verify before planning:
  - whether Deriv uses `NASDAQ`, `US TECH 100`, or another alias for `NAS100`
  - the exact Deriv symbol names for `SOLUSD` and other top-5 traded crypto instruments
  - whether the backend should support `SOLUSD` in `instrument_specs()` or via alias normalization only
- Open unknowns that could invalidate the hypothesis:
  - whether the repository already supports Deriv alias resolution in a different code path not found in the current search
  - whether `SOLUSD` pricing is available under a different canonical symbol such as `SOLUSDT`
  - whether MT5 and backend quote ingestion already expect a different normalized symbol format for Deriv instruments
