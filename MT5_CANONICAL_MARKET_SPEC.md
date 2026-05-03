# MT5 Canonical Market Data Specification

## Platform Constitution for SMC SuperFib MT5 Migration

**Date:** May 3, 2026  
**Version:** 1.0  
**Purpose:** Define the authoritative rules for market data handling in the MT5-based SMC SuperFib platform, replacing Pine Script and Twelve Data dependencies.

---

## 1. Core Principles

### 1.1 Single Source of Truth
- **MT5 EA** is the sole authority for market data.
- No external APIs (Twelve Data, etc.) for live data.
- Dashboard is render-only; no local calculations.

### 1.2 Deterministic State
- All state derived from ticks and candles built internally.
- No inference from timers, API responses, or external signals.
- Explicit state enums prevent ambiguity.

### 1.3 Canonical Normalization
- All symbols normalized to standard format.
- All timestamps in UTC.
- All prices in broker's native precision.

---

## 2. Tick Rules

### 2.1 Tick Ingestion
- Capture every tick: `bid`, `ask`, `spread`, `timestamp`, `tick_volume`.
- Timestamp: MT5 server time in UTC milliseconds.
- Spread: Calculated as `ask - bid` if not provided.
- Tick Volume: Cumulative volume since last tick.

### 2.2 Tick Processing
- Update live quote state on every tick.
- Reset stagnation timer to 0.
- Validate session state (market open/closed).
- Discard ticks outside trading hours (based on session rules).

### 2.3 Tick Storage
- Store last 1000 ticks per symbol for debugging.
- Persist to MT5 global variables or files for audit.

---

## 3. Candle Rules

### 3.1 Canonical Candle Construction
- Build M1 candles internally from ticks.
- Do NOT trust broker-provided candles.
- Handle missing ticks, DST transitions, weekend gaps.

### 3.2 Candle Fields
- `open`: First tick bid in period.
- `high`: Max bid in period.
- `low`: Min bid in period.
- `close`: Last tick bid in period.
- `volume`: Sum of tick_volume in period.
- `timestamp`: Period start time in UTC.

### 3.3 Candle Validation
- Reject candles with zero volume.
- Handle spread explosions (>10x average) by capping.
- Normalize for broker-specific anomalies.

### 3.4 Missing Candle Policy
- If no ticks in period: Create synthetic candle using last known close.
- Mark as `synthetic=true`.
- Volume = 0.
- Use for continuity but flag for downstream engines.

---

## 4. Aggregation Rules

### 4.1 Timeframe Hierarchy
- Base: M1 (built from ticks).
- Aggregate: M5, M15, H1, H4, D1, W1, MN1.
- Method: Standard OHLC aggregation (no volume weighting).

### 4.2 Aggregation Logic
- M5: Combine 5 M1 candles.
- High: Max of highs.
- Low: Min of lows.
- Volume: Sum of volumes.
- Handle partial periods at session boundaries.

### 4.3 Historical Depth
- Maintain 500 candles per timeframe per symbol.
- Roll off oldest candles.
- Persist to MT5 history or external storage.

---

## 5. Session Rules

### 5.1 Session Detection
- **Market Open**: First tick after session start.
- **Market Close**: Last tick before session end.
- **Rollover**: Transition between sessions (e.g., London to New York).
- **Weekend Close**: No ticks Friday 22:00 UTC to Sunday 22:00 UTC.
- **Illiquid Periods**: Low volume (<10% average) during overlaps.

### 5.2 Session Definitions (UTC)
- **Sydney**: 22:00 - 06:00 (Sun-Fri)
- **Tokyo**: 00:00 - 08:00 (Mon-Fri)
- **London**: 07:00 - 15:00 (Mon-Fri)
- **New York**: 12:00 - 20:00 (Mon-Fri)
- **Overlaps**: Handle volume weighting in overlapping sessions.

### 5.3 Holiday Handling
- Maintain trading calendar in MT5.
- Skip sessions on holidays (NY, London, etc.).
- Flag holiday periods as CLOSED.

### 5.4 Session State Updates
- Update on every tick.
- Persist session state to global variables.
- Send to backend via webhook.

---

## 6. Freshness Rules

### 6.1 Freshness States
| State | Definition | Criteria |
|-------|------------|----------|
| LIVE | Active market with recent ticks | Last tick < 30 seconds ago |
| DELAYED | Ticks arriving but slow | 30s < last tick < 300s |
| STALE | No recent ticks | Last tick > 300s |
| CLOSED | Market session closed | Outside session hours |
| DISCONNECTED | No ticks and terminal offline | No ticks + MT5 disconnected |

### 6.2 Freshness Calculation
- Base solely on tick timestamps.
- No API calls or external checks.
- Update every tick and every 10 seconds.

### 6.3 Freshness Propagation
- Per symbol freshness.
- Aggregate to account-level freshness (worst symbol state).
- Send freshness state to backend.

---

## 7. Symbol Normalization Policy

### 7.1 Normalization Rules
- Strip suffixes: `EURUSD.a` → `EURUSD`
- Strip prefixes: `aEURUSD` → `EURUSD`
- Convert to uppercase.
- Max 12 characters.
- Validate against known instruments.

### 7.2 Known Instruments
- Forex: EURUSD, GBPUSD, AUDUSD, etc.
- Metals: XAUUSD, XAGUSD
- Indices: US30, NAS100
- Crypto: BTCUSD, ETHUSD

### 7.3 Normalization Enforcement
- Applied at tick ingestion.
- Prevents cache splits and parity failures.
- Log normalization actions for audit.

---

## 8. Timezone Handling

### 8.1 Canonical Timezone
- All timestamps in UTC.
- No local timezone conversions.
- MT5 server time as source of truth.

### 8.2 DST Handling
- MT5 handles DST transitions.
- Validate candle continuity across DST changes.
- Flag anomalies for manual review.

### 8.3 Timestamp Precision
- Milliseconds for ticks.
- Seconds for candles.
- ISO 8601 format for backend transmission.

---

## 9. Spread Policy

### 9.1 Spread Tracking
- Capture spread on every tick.
- Average spread per candle.
- Track spread explosions (>5x average).

### 9.2 Spread Validation
- Reject ticks with invalid spread (<0 or >1000 pips).
- Cap extreme spreads at 1000 pips.
- Use for liquidity assessment.

### 9.3 Spread in Calculations
- Include in pip value calculations.
- Flag high-spread periods as illiquid.

---

## 10. Data Transmission to Backend

### 10.1 Webhook Payload Format
```json
{
  "symbol": "EURUSD",
  "normalized_symbol": "EURUSD",
  "tick": {
    "bid": 1.0845,
    "ask": 1.0847,
    "spread": 2,
    "timestamp": "2026-05-03T12:00:00.000Z",
    "volume": 100
  },
  "candle_m1": {
    "open": 1.0840,
    "high": 1.0850,
    "low": 1.0835,
    "close": 1.0845,
    "volume": 5000,
    "timestamp": "2026-05-03T12:00:00Z"
  },
  "freshness": "LIVE",
  "session": "London",
  "is_synthetic": false
}
```

### 10.2 Transmission Frequency
- Ticks: Every tick (throttled to 1/sec max).
- Candles: On candle close.
- Freshness: Every 10 seconds or on change.

### 10.3 Error Handling
- Retry failed webhooks 3 times.
- Log failures to MT5 journal.
- Continue operation if backend offline.

---

## 11. Implementation Notes

### 11.1 MT5 Constraints
- Global variables for state persistence.
- Files for historical data.
- WebRequest for backend communication.

### 11.2 Performance Considerations
- Limit tick processing to active symbols only.
- Aggregate data before transmission.
- Use asynchronous webhooks.

### 11.3 Testing Requirements
- Simulate tick feeds for validation.
- Test session transitions and holidays.
- Validate against historical data.

---

## 12. Revision History

- **v1.0 (May 3, 2026)**: Initial specification based on migration requirements.</content>
<parameter name="filePath">c:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\MT5_CANONICAL_MARKET_SPEC.md