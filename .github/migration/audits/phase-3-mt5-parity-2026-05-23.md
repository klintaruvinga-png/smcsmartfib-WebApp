# Phase 3 MT5 Parity Audit

Date: 2026-05-23
Engine: MT5 session/freshness authority
Scope: Weekend crypto market-open parity from MT5 `SessionManager` through backend snapshot state persistence

## Authority parity

- MT5 remains the source of truth for market-open classification.
- The patch is MT5-side only: no PHP API contract, transient key, snapshot schema, or dashboard selector changed.
- Backend `CLOSED -> offline` mapping remains authoritative for non-crypto closed markets.

## Classification parity

- `SessionManager.IsCryptoSymbol()` now classifies normalized symbols by auditable prefix list: `BTC`, `ETH`, `LTC`, `XRP`, `BNB`, `SOL`, `ADA`, `DOGE`.
- `SessionManager.IsMarketOpenForSymbol()` now returns `true` immediately for those crypto prefixes before weekend gating executes.
- FX weekend behavior remains unchanged because `ResolveBaseSessionState()` and the existing Saturday/Sunday closure rules were not modified.
- Equity index session handling remains unchanged because `IsEquityIndexSymbol()` and `IsUsEquitySessionOpen()` were not modified.

## Persistence parity

- PHP `store_tick_snapshot()` still maps `LIVE -> live`, `STALE/DELAYED -> stale`, and `CLOSED/DISCONNECTED -> offline`.
- Existing Phase 3 regression for `CLOSED` freshness persisting offline still passes.
- Added backend regression coverage confirming a crypto `LIVE` payload persists as `state='live'`.

## Validation results

- `node mt5/check-mql-includes.mjs`: passed
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`: passed
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`: passed
- `MetaEditor64.exe /compile:.../mt5/SessionManagerWeekendClassificationTest.mq5`: inconclusive, no compiler artifact/log captured in workspace
- `MetaEditor64.exe /compile:.../mt5/SMC_MarketDataEA.mq5`: inconclusive, no compiler artifact/log captured in workspace

## Known parity limits

- Weekend live parity is not claimed from this workspace because the patched EA binary was not rebuilt and observed running in MT5 here.
- The contract text referenced a backend `freshness=FRESH` assertion, but repository reality uses `LIVE|DELAYED|STALE|CLOSED|DISCONNECTED`; the regression was implemented against the existing `LIVE` contract to avoid widening the freshness API.
