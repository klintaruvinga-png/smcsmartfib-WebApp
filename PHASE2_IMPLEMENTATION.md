# Phase 2: Core Engine Implementation — Complete

**Date:** May 3, 2026  
**Status:** ✅ Complete and Syntax Validated

---

## Implementation Summary

### MQL5 Market Data Modules (Fully Implemented)

All core MQL5 classes for the MT5 Canonical Market Data Layer have been implemented with complete functionality:

#### 1. **TickProcessor.mqh** — Tick Ingestion & Storage
- Ingests bid, ask, spread, timestamp, volume from every tick
- Stores last 1000 ticks per symbol in circular buffer
- Provides tick history and average spread calculations
- Tracks stagnation time (seconds since last tick)

#### 2. **CandleBuilder.mqh** — Canonical M1 Candle Construction
- Builds M1 candles internally from ticks (NOT from broker candles)
- Stores 500 M1 candles per symbol
- Aggregates to higher timeframes (M5, M15, H1, H4, D1)
- Handles missing candles via synthetic candle creation
- Validates candle data (high >= low, volume checks)

#### 3. **SessionManager.mqh** — Market Session Awareness
- Detects all four major Forex sessions (Sydney, Tokyo, London, New York)
- Identifies overlaps (highest liquidity periods)
- Handles weekends and holidays
- Tracks session transitions for detecting rollovers
- Checks market open/closed and liquidity states

#### 4. **FreshnessEngine.mqh** — Authoritative Freshness States
- **LIVE**: < 30 seconds since last tick
- **DELAYED**: 30-300 seconds since last tick
- **STALE**: > 300 seconds since last tick
- **CLOSED**: Market session not open
- **DISCONNECTED**: Terminal disconnected
- Updates on every tick and periodically (every 10-30 seconds)
- Aggregates account-level freshness (worst state)

#### 5. **SymbolNormalizer.mqh** — Symbol Canonicalization
- Strips suffixes (`.A`, `.PRO`, `.MICRO`, etc.)
- Strips prefixes (leading non-letters)
- Converts to uppercase
- Validates against known instrument list (50+ symbols)
- Provides symbol type detection (forex, metal, index, crypto)
- Returns pip size for symbol types

#### 6. **MarketDataEngine.mqh** — Central Orchestration
- Initializes all submodules (tick, candle, session, freshness, normalizer)
- Main entry point: `OnTick(symbol, bid, ask, timestamp, volume)`
- Periodic update handler: `OnPeriodic()` (call every 10-30 seconds)
- Builds JSON webhook payloads for PHP backend
- Provides data access methods:
  - `GetCandleM1Current()` / `GetCandleM1(shift)`
  - `GetFreshnessState()`, `GetSessionName()`
  - `GetLastTick()`, `GetTickHistory()`
  - `IsLive()`, `IsValidSymbol()`

---

### PHP Backend Market Data Service (Fully Implemented)

New service layer at [wordpress/smc-superfib-sniper/class-market-data-service.php](wordpress/smc-superfib-sniper/class-market-data-service.php):

#### Methods:
- `store_tick_snapshot()` — Store MT5 tick data with source='mt5'
- `store_candle_m1()` — Store canonical M1 candles
- `store_freshness()` — Store freshness state (LIVE|DELAYED|STALE|CLOSED|DISCONNECTED)
- `store_session()` — Store session state (Sydney|Tokyo|London|New York)
- `get_price_snapshot()` — Retrieve current MT5 price
- `get_candles_m1()` — Retrieve M1 candles (MT5 authoritative)
- `get_data_source()` — Return which source is authoritative (mt5|twelve-data|unavailable)
- `get_authority_state()` — Complete market data authority state including freshness, session, source

#### Database Enhancements:
- Added `source` column to `snapshots` table (tracks mt5 vs twelve-data)
- Added `source` column to `candles` table (tracks mt5 vs twelve-data)

---

### REST API Endpoints (New)

#### GET `/sniper/v1/market-data-authority`
Get market data authority state for symbol(s).

**Query Parameters:**
- `symbol` (optional) — Return state for specific symbol; if omitted, returns for entire watchlist

**Response (Single Symbol):**
```json
{
  "symbol": "EURUSD",
  "authority": "mt5",  // mt5 | twelve-data | unavailable
  "freshness": "Live",
  "session": "London",
  "price": {
    "bid": 1.0845,
    "ask": 1.0847
  },
  "is_live": true,
  "last_update": "2026-05-03T12:00:00Z"
}
```

#### POST `/sniper/v1/snapshot`
Receive MT5 tick/candle snapshots (webhook from MT5 EA).

**Payload:**
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

---

## Integration Points

### MT5 EA Integration
The EA uses `MarketDataEngine.mqh`:
```mql5
MarketDataEngine engine;
engine.Initialize(watchlist, count);

// On each tick:
engine.OnTick(symbol, bid, ask, TimeCurrent(), volume);

// Every 10-30 seconds:
engine.OnPeriodic();

// Send to backend:
string payload = engine.BuildWebhookPayload(symbol);
// POST payload to /sniper/v1/snapshot
```

### Dashboard Integration
The frontend checks market data authority:
```javascript
const response = await fetch('/wp-json/sniper/v1/market-data-authority?symbol=EURUSD');
const {authority, freshness, session} = await response.json();
```

---

## Verification

✅ **Phase 2 Complete:**
1. ✅ MQL5 tick processor fully implements tick ingestion and storage
2. ✅ MQL5 candle builder builds canonical M1 candles from ticks
3. ✅ MQL5 session manager detects market sessions and transitions
4. ✅ MQL5 freshness engine tracks authoritative freshness states
5. ✅ MQL5 symbol normalizer enforces canonical symbol names
6. ✅ MQL5 market data engine orchestrates all components
7. ✅ PHP backend service handles MT5 data storage
8. ✅ REST endpoints expose market data authority state
9. ✅ All PHP code syntax validated (no errors)
10. ✅ Database schema extended with source tracking

---

## Testing Checklist (Phase 3)

- [ ] MT5 EA tick processor receives and stores 1000 ticks without loss
- [ ] M1 candles build correctly; validate against MT5 history
- [ ] Session detection correctly identifies Sydney, Tokyo, London, New York
- [ ] Freshness states transition correctly (LIVE → DELAYED → STALE)
- [ ] Symbol normalization prevents cache splits (EURUSD.a → EURUSD)
- [ ] Webhook payload JSON is well-formed and parseable
- [ ] PHP backend receives and stores tick data correctly
- [ ] Price snapshots persist with source='mt5'
- [ ] M1 candles persist with source='mt5'
- [ ] GET /market-data-authority returns correct state
- [ ] Dashboard can query authority state and render correctly
- [ ] 72-hour stability test: no frozen quotes, correct weekends, proper session handling

---

## Next Steps (Phase 3 & Beyond)

### Phase 3: Testing & Validation
- Deploy MT5 EA with MarketDataEngine
- Run 72-hour feed validation
- Test webhook transmission and PHP ingestion
- Verify fib calculations use MT5 canonical data

### Phase 4: Signal Engine Migration
- Update signal engine to read from MT5 snapshots (not Twelve Data)
- Verify signal parity between MT5 and Twelve Data sources
- Deprecate Twelve Data for LIVE signals (keep as fallback)

### Phase 5: Execution Integration
- Connect trade queue to MT5 execution
- Update dashboard to show MT5-authoritative trade states
- Remove frontend signal calculations (render-only)

