# Phase 3 Testing Guide: MT5 EA to Backend Data Flow

## Overview
Phase 3 testing verifies that the MT5 Expert Advisor (EA) successfully sends price and candlestick data to the WordPress backend via webhooks, and that the backend correctly stores this data as the authoritative market data source.

> Note: Phase 3 planning is complete and this guide is ready for execution.

## Prerequisites
1. **MT5 Terminal** with the SMC_MarketDataEA.mq5 attached to a chart
2. **WordPress Site** with SMC SuperFIB Sniper plugin activated
3. **SMC_SF_EA_API_KEY** configured in WordPress and copied into the EA `ApiKey` input
4. **Database Access** to verify stored data

## Test Setup

### 1. Configure MT5 EA
In MT5, attach the EA to a chart with these inputs:
```
WebhookURL = https://your-wordpress-site.com/wp-json/sniper/v1/ea/market-stream
ApiKey = value-that-matches-SMC_SF_EA_API_KEY
UserId = WordPress user_id that owns the dashboard stream
TimerSec = 10
Symbols = EURUSD,GBPUSD,XAUUSD,USDJPY
```

### 2. Verify WordPress REST Endpoint
The endpoint should be accessible at:
`https://your-wordpress-site.com/wp-json/sniper/v1/ea/market-stream`

### 3. Check Database Tables
Ensure these tables exist with `source` columns:
- `wp_smc_sf_snapshots` (for tick/price data)
- `wp_smc_sf_candles` (for M1 candlestick data)

## Testing Checklist

### ✅ MT5 EA Functionality
- [ ] EA attaches without errors
- [ ] EA receives ticks for configured symbols
- [ ] EA builds M1 candles from ticks
- [ ] EA detects market sessions (Sydney/Tokyo/London/New York)
- [ ] EA tracks freshness states (LIVE/DELAYED/STALE/CLOSED)
- [ ] EA sends webhook payloads every 10 seconds

### ✅ Webhook Transmission
- [ ] HTTP POST requests sent to WordPress endpoint
- [ ] `X-API-KEY` header included
- [ ] JSON payload includes `user_id`
- [ ] JSON payload properly formatted
- [ ] No network/firewall blocking requests

### ✅ Backend Reception
- [ ] WordPress REST API accepts POST to `/sniper/v1/ea/market-stream`
- [ ] API-key authentication passes and binds the request to `user_id`
- [ ] JSON payload parsed correctly
- [ ] No PHP errors in logs

### ✅ Data Storage
- [ ] Tick data stored in `snapshots` table with `source='mt5'`
- [ ] M1 candles stored in `candles` table with `source='mt5'`
- [ ] Freshness state stored as transient
- [ ] Session state stored as transient
- [ ] Timestamps normalized to MySQL format
- [ ] Same-symbol TD quote-TTL and rate-limit transients clear after successful MT5 snapshot writes
- [ ] `engine_runs` receives heartbeat rows after successful MT5 snapshot writes
- [ ] MT5 `change_pct_1d` is non-zero after the first UTC-day M1 candle exists, or `0` during cold start

### ✅ Dashboard Integration
- [ ] GET `/sniper/v1/market-data-authority` returns MT5 as authoritative
- [ ] Dashboard shows "MT5" as data source
- [ ] Freshness indicators update (LIVE/DELAYED/STALE)
- [ ] Session indicators show current market session
- [ ] MT5-live symbols do not display stale Twelve Data `rate-limited` state after a successful EA push
- [ ] Non-EA watchlist symbols still surface real Twelve Data `rate-limited` state when TD returns 429

## Sample Test Data

### Expected Webhook Payload from MT5 EA:
```json
{
  "user_id": 7,
  "symbol": "EURUSD",
  "normalized_symbol": "EURUSD",
  "timeframe": "M1",
  "timestamp": "2026-05-03T12:00:00Z",
  "bid": 1.0845,
  "ask": 1.0847,
  "freshness": "LIVE",
  "session": "London",
  "candle": {
    "time": "2026-05-03T11:59:00Z",
    "open": 1.0840,
    "high": 1.0850,
    "low": 1.0835,
    "close": 1.0845,
    "volume": 5000
  },
  "is_synthetic": false
}
```

### Expected Database Records:
```sql
-- In wp_smc_sf_snapshots
INSERT INTO wp_smc_sf_snapshots (
  user_id, symbol, bid, ask, mid, spread, source, state, updated_at
) VALUES (
  1, 'EURUSD', 1.0845, 1.0847, 1.0846, 2, 'mt5', 'live', '2026-05-03 12:00:00'
);

-- In wp_smc_sf_candles
INSERT INTO wp_smc_sf_candles (
  user_id, symbol, timeframe, candle_time, open, high, low, close, volume, source
) VALUES (
  1, 'EURUSD', '1min', '2026-05-03 12:00:00', 1.0840, 1.0850, 1.0835, 1.0845, 5000, 'mt5'
);
```

## Testing Commands

### Simulate Webhook (using curl):
```bash
curl -X POST https://your-wordpress-site.com/wp-json/sniper/v1/ea/market-stream \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-ea-api-key" \
  -d @test-payload.json
```

### Check Stored Data:
```sql
-- Check snapshots
SELECT * FROM wp_smc_sf_snapshots WHERE source='mt5' ORDER BY updated_at DESC LIMIT 5;

-- Check candles
SELECT * FROM wp_smc_sf_candles WHERE source='mt5' ORDER BY created_at DESC LIMIT 5;

-- Check transients (via WP CLI)
wp transient get smc_sf_freshness_1_EURUSD
wp transient get smc_sf_session_1_EURUSD
```

### Monitor Logs:
```bash
# WordPress debug log
tail -f /path/to/wp-content/debug.log

# MT5 Experts log
# Check in MT5 Terminal → Tools → Experts → Journal
```

## Success Criteria
- [ ] MT5 EA sends webhooks without errors
- [ ] Backend stores data with `source='mt5'`
- [ ] Dashboard recognizes MT5 as authoritative data source
- [ ] No data conflicts between MT5 and Twelve Data for MT5-live symbols
- [ ] Twelve Data remains the visible fallback/feed state for non-EA watchlist symbols
- [ ] Freshness and session states update correctly
- [ ] 72-hour stability test passes (no frozen quotes, proper session handling)

## Troubleshooting
- **EA not sending**: Check MT5 Experts tab for errors, verify webhook URL
- **Auth failures**: Verify `SMC_SF_EA_API_KEY`, EA `ApiKey`, and payload `user_id`
- **Data not stored**: Check PHP error logs, verify database permissions
- **Dashboard not updating**: Clear transients, check API responses

## Next Phase
Once Phase 3 passes, proceed to Phase 4: Full integration testing with signal generation.
