# Phase 2: Read-Only Trade Telemetry Planning Contract

**Date:** 2026-05-20  
**Status:** Planning in Progress - readiness package active

> Canonical Phase 2 planning document. Historical implementation notes below are retained as repository context only and do not supersede the acceptance criteria in this document.

---

## Phase 2 Acceptance Criteria

### 1. Transport Contract

Phase 2 trade telemetry must continue to use the existing EA-owned write path:

- `POST /wp-json/sniper/v1/ea/market-stream`

No new write endpoint is introduced by this planning patch. Phase 2 source-code work may extend the payload carried on this route, but it must not weaken the existing auth gate, staleness validation, or backend-authority boundary.

The planned Phase 2 trade-telemetry envelope is:

```json
{
  "user_id": 1,
  "account_id": 32206603,
  "terminal_id": "FB9A56D617EDDDFE29EE54EBEFFE96C1",
  "ea_version": "1.00",
  "timestamp": "2026-05-20T10:15:00Z",
  "positions": [
    {
      "position_id": "123456789",
      "symbol": "EURUSD",
      "direction": "BUY",
      "entry_price": 1.0845,
      "sl": 1.0825,
      "tp": 1.0885,
      "volume": 0.1,
      "opened_at": "2026-05-20T10:00:00Z",
      "state": "open"
    }
  ],
  "pending_orders": [
    {
      "order_id": "987654321",
      "symbol": "EURUSD",
      "direction": "BUY_LIMIT",
      "entry_price": 1.083,
      "sl": 1.081,
      "tp": 1.087,
      "volume": 0.1,
      "placed_at": "2026-05-20T10:05:00Z",
      "state": "pending"
    }
  ],
  "account_metrics": {
    "balance": 1000.0,
    "equity": 1012.5,
    "margin": 125.0,
    "free_margin": 887.5,
    "floating_pl": 12.5
  }
}
```

Compatibility note: the current repository still uses this route for price and candle snapshots. Phase 2 must extend the existing path and preserve current transport and validation behavior until Track A and Track B approve the trade-telemetry field set.

### 2. Backend Persistence Requirements

For each ingested position snapshot, the backend must persist these fields without frontend mutation:

- `position_id`
- `account_id`
- `terminal_id`
- `symbol`
- `direction`
- `entry_price`
- `sl`
- `tp`
- `volume`
- `timestamp`
- `ea_version`

For each ingested pending-order snapshot, the backend must persist the same trade fields with `order_id` substituted for `position_id`.

For each ingestion batch, the backend must also persist read-only account metrics sufficient to render the account card and floating P/L surfaces:

- `balance`
- `equity`
- `margin`
- `free_margin`
- `floating_pl`

Duplicate ticket updates must overwrite the current authoritative record for the same account and terminal rather than creating duplicate rows.

### 3. Dashboard Read-Only Authority Contract

The following dashboard surfaces must render from backend-owned read paths only:

- Account card
- Live positions
- Floating P/L
- Hedge grouping
- Sync health

Read-only authority for Phase 2 means:

- the dashboard consumes `GET /wp-json/sniper/v1/market-data-authority` for authority and sync-health state
- the dashboard consumes backend-owned GET trade and account reads for displayed telemetry state
- the dashboard does not mutate live trade truth, position state, or account state from the frontend

The existing audit-only `POST /user/trades` and merge-only `POST /user/account` flows must not become the source of truth for live Phase 2 trade telemetry.

### 4. Phase 2 Completion Gate

Phase 2 is complete only when all of the following are true:

- dashboard account, position, and P/L surfaces match MT5 terminal state on reviewed scenarios
- no stale open positions remain visible after backend refresh or broker reconnect
- no duplicate tickets are created across repeated telemetry pushes
- Track A and Track B confirm the persisted field set matches the EA payload carried on the existing market-stream path
- Track C confirms all Phase 2 dashboard panels render from read-only authority only

---

## Existing Repository Surfaces

### MQL5 Market Data Modules (Existing repository surfaces)

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

### PHP Backend Market Data Service (Existing repository surfaces)

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

### REST API Endpoints (Existing repository surfaces)

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

## Repository Findings Informing This Contract

These repository surfaces inform Phase 2 planning but are not, by themselves, proof that read-only trade telemetry is complete:

1. MQL5 tick processor implements tick ingestion and storage
2. MQL5 candle builder builds canonical M1 candles from ticks
3. MQL5 session manager detects market sessions and transitions
4. MQL5 freshness engine tracks authoritative freshness states
5. MQL5 symbol normalizer enforces canonical symbol names
6. MQL5 market data engine orchestrates related market-data modules
7. PHP backend service handles MT5 market-data storage
8. REST endpoints expose market-data authority state
9. PHP syntax validation previously passed on the documented market-data surfaces
10. Database schema already includes source-tracking fields for the documented market-data tables

---

## Phase 2 Exit Validation Checklist

- [x] Existing `POST /ea/market-stream` auth and payload validation still pass unchanged
- [x] Phase 2 payload extension is well-formed and parseable on the existing market-stream path
- [x] Backend persists the required position, pending-order, and account-metric fields without duplicates
- [x] `GET /market-data-authority` returns the expected authority and sync-health state
- [x] Dashboard account card, live positions, floating P/L, hedge grouping, and sync health render from read-only authority only
- [x] `GET /user/progress` returns backend-owned equity pulse, milestone state, and conservative streak state for the Progress page
- [x] Manual trade open/close, partial close, SL/TP modification, broker reconnect, and weekend reopen scenarios all reconcile to backend-owned truth

> Browser and regression checks now cover live account telemetry, active book, trade dashboard surfaces, and the `/progress` route wiring. The Progress page streak and milestone panels read from the backend-owned `/user/progress` contract. Active-day definition formally approved 2026-05-22: `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` — a calendar day (UTC) is active when at least one completed engine run is persisted in `engine_runs` for the user. Streak truth is live; `GET /user/progress` now returns `streak.state = "LIVE"` with a non-zero `current_streak_days` for users with engine run history. All historical records are included in streak backfill.

---

## Post-Signoff Follow-On Work

### Phase 2: Source-Code Implementation
- Extend the existing market-stream payload for read-only trade telemetry on the EA-owned path
- Persist the approved trade/account field set in backend-owned storage
- Wire dashboard telemetry panels to backend-owned read paths only
- Replay at least one live Phase 1 payload and confirm the persisted field set matches this contract before enabling dashboard parity review

### Phase 3: Market Data Engine Work
- Update signal engine to read from MT5 snapshots (not Twelve Data)
- Verify signal parity between MT5 and Twelve Data sources
- Deprecate Twelve Data for LIVE signals (keep as fallback)

### Phase 4: Execution and Dashboard Follow-On
- Connect trade queue to MT5 execution
- Update dashboard to show MT5-authoritative trade states
- Remove frontend signal calculations (render-only)

