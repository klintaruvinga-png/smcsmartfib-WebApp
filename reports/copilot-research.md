### 1. Issue classification
- Severity: CRITICAL
- Category: wiring / data-contract / stale-data
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS
- Phase impact: Phase 3

### 2. Confirmed evidence
- mt5/SessionManager.mqh resolves weekend session state for all symbols based on UTC day/hour and only special-cases equity indices via IsEquityIndexSymbol(); it does not special-case crypto as 24/7.
- mt5/MarketDataEngine.mqh calls sessionManager.IsMarketOpenForSymbol(normalized, now) for every tracked symbol in OnPeriodic(), including crypto symbols.
- mt5/FreshnessEngine.mqh sets FRESHNESS_CLOSED when is_market_open=false, and FreshnessStateName() maps that enum to the string CLOSED.
- wordpress/smc-superfib-sniper/class-market-data-service.php maps backend freshness CLOSED and DISCONNECTED to state='offline' in store_tick_snapshot().
- wordpress/smc-superfib-sniper/class-market-data-service.php stores freshness and session state as WordPress transients, and get_price_snapshot() reads those values for dashboard consumption.
- .github/migration-status.md documents expected weekend behavior: FX stale during weekend is expected, while crypto fresh is expected. This indicates the current problem is a crypto-specific weekend classification defect.

### 3. Root cause hypothesis
- Most likely root cause: crypto symbols are being classified as weekend-closed by the shared MT5 session manager, causing IsMarketOpenForSymbol() to return false, FreshnessEngine to emit FRESHNESS_CLOSED, and the backend to persist offline state. (Confirmed)
- Why: the MT5 code path applies general weekend closure rules to all non-equity symbols, but the backend treats CLOSED as offline. There is no crypto-specific open-market override in the session logic. (Confirmed)
- Likely trigger: broker weekend hours on Saturday/Sunday, when crypto should either remain tradable or not be represented as market-closed. (Confirmed)

### 4. Blast radius
- Files likely affected:
  - mt5/SessionManager.mqh
  - mt5/MarketDataEngine.mqh
  - mt5/FreshnessEngine.mqh
  - wordpress/smc-superfib-sniper/class-market-data-service.php
  - wordpress/smc-superfib-sniper/smc-superfib-sniper.php
- Systems at risk:
  - MT5 EA freshness/session engine
  - WordPress MT5 market-stream ingest
  - Snapshot/state persistence in backend
  - Dashboard offline/live UI and signal gating
- Parity surfaces:
  - EA -> Backend freshness/state contract
  - Backend snapshot state mapping and dashboard interpretation
  - Weekend/closed state semantics for crypto vs FX
- Risks:
  - false offline state hiding live candles
  - incorrect weekend closure semantics for crypto
  - downstream gating of signals based on stale/offline state

### 5. Regression surface
- What could break if patched incorrectly:
  - FX and equity index weekend closure behavior must remain unchanged.
  - True market-closed instruments must still map to offline when appropriate.
  - Dashboard consumers must continue to distinguish stale vs closed vs offline.
- Existing guards to preserve:
  - explicit CLOSED state from FreshnessEngine
  - backend mapping of CLOSED/DISCONNECTED to offline
  - phase3_mt5_simulation_test.php assertions for CLOSED -> offline
- Existing coverage:
  - .github/migration-status.md weekend behavior notes
  - Phase 1/3 weekend observation tasks and audit artifacts
  - backend session/freshness regression tests

### 6. Resolution path options
- Path A: narrow fix in MT5 session logic to treat known crypto symbols as 24/7 open, so SessionManager.IsMarketOpenForSymbol() returns true for crypto in weekend hours. Preserve existing weekend closure for FX and equity index instruments. (Recommended)
- Path B: broader asset-class schedule abstraction across SessionManager, FreshnessEngine, and backend state mapping to distinguish FX, crypto, equity index, and holiday schedules.
- Recommended: Path A, because the defect appears crypto-specific and the narrow surface minimizes regression risk while preserving other instrument closure rules.

### 7. Risk flags
- High-risk system involved: Yes - freshness/state gating affects live/offline UI and downstream signal engines.
- Requires parity re-validation: Yes - MT5, backend, and dashboard freshness/session semantics.
- Migration-blocking: Yes - crypto weekend status is tracked in Phase 3 readiness and weekend validation.
- Human review required before merge: Yes - asset-class weekend semantics and state mapping require careful examination.

### 8. Handoff package
- Epicentre files to inspect first:
  - mt5/SessionManager.mqh
  - mt5/MarketDataEngine.mqh
  - mt5/FreshnessEngine.mqh
  - wordpress/smc-superfib-sniper/class-market-data-service.php
- Inputs Codex must verify before planning:
  - whether crypto symbols should remain 24/7 open in this broker/MT5 deployment
  - whether any existing symbol-type rules already treat crypto as special-case open
  - whether the dashboard currently derives state from persisted snapshot rows or transient freshness only
- Open unknowns:
  - whether the broker/MT5 platform actually closes crypto during weekend windows and if so how that should be surfaced
  - whether the EA payload contains session/freshness values consistent with the intended crypto workflow
  - whether frontend state mapping intentionally masks CLOSED as offline for any asset class
