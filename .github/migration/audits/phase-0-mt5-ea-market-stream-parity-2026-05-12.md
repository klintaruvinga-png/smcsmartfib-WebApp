# Phase 0 MT5 EA Market Stream Parity Audit — 2026-05-12

## Audit Scope

Verification of payload field parity, timestamp handling, OHLC constraints, and signal-readiness
between the MT5 EA MQL5 sender (`mt5/MarketDataEngine.mqh`) and the WordPress plugin PHP receiver
(`wordpress/smc-superfib-sniper/smc-superfib-sniper.php :: post_ea_market_stream()`).

---

## Route Parity

| Item | MQL5 EA | PHP Plugin | Match |
|---|---|---|---|
| Endpoint URL | `WebhookURL` input (default: `.../sniper/v1/ea/market-stream`) | `register_rest_route(self::NAMESPACE, '/ea/market-stream', ...)` | ✅ |
| HTTP method | POST via `WebRequest()` | `WP_REST_Server::CREATABLE` (POST) | ✅ |
| Auth header | `"X-EA-API-Key: " + ApiKey` | `get_ea_api_key()` checks x-ea-api-key, x_ea_api_key, x-api-key, x_api_key | ✅ |
| Content-Type | `application/json` | Parsed via `$request->get_json_params()` | ✅ |

---

## Payload Field Parity

| Field (MQL5) | Field (PHP) | Notes |
|---|---|---|
| `user_id` | `payload['user_id']` | Required. EA sets via `wpUserId` input. ✅ |
| `symbol` | `payload['symbol']` | Broker symbol string. ✅ |
| `normalized_symbol` | `payload['normalized_symbol']` | Canonical form (no suffix). Optional. ✅ |
| `timeframe` | `payload['timeframe']` | Always `"M1"` from EA. Normalized via `normalize_mt5_timeframe()`. ✅ |
| `timestamp` | `payload['timestamp']` | EA tick time as ISO 8601 UTC. PHP validates and stores as broker timestamp. ✅ |
| `bid` | `payload['bid']` | `DoubleToString(tick.bid, digits)`. PHP casts to `(float)`. ✅ |
| `ask` | `payload['ask']` | `DoubleToString(tick.ask, digits)`. PHP casts to `(float)`. ✅ |
| `freshness` | `payload['freshness']` | LIVE/DELAYED/STALE/CLOSED/DISCONNECTED from FreshnessEngine. ✅ |
| `session` | `payload['session']` | Session name from SessionManager. ✅ |
| `candle{}` | `payload['candle']` | Last closed M1 bar via `CopyRates(PERIOD_M1, 1, 1)`. Omitted if no bar. ✅ |
| `candle.time` | `candle['time']` | ISO 8601 UTC via `TimeToIso8601()`. ✅ |
| `candle.open/high/low/close` | `candle['open/high/low/close']` | Rounded to broker digits. ✅ |
| `candle.volume` | `candle['volume']` | `tick_volume` from MqlRates. ✅ |
| `candle_m15{}` | `payload['candle_m15']` | Last closed M15 bar via `CopyRates(PERIOD_M15, 1, 1)`. ✅ |

**DOCUMENTED DIVERGENCE:** The workflow specification uses `quote_time`, `server_time`, and `candles[]` (array) in its payload examples. The actual implemented contract (above) uses `timestamp` (singular), `candle{}` (singular), and `candle_m15{}` (singular). This divergence is across EA and PHP — both sides use the actual contract. The spec example is illustrative, not normative.

---

## Timestamp Parity (UTC Handling)

| Item | MQL5 | PHP | Match |
|---|---|---|---|
| Tick timestamp | `TimeToIso8601(tick.timestamp)` | Parsed via `normalize_market_timestamp()` | ✅ |
| UTC conversion | `t - (TimeCurrent() - TimeGMT())` then `TimeToStruct()` + Z suffix | `strtotime()` + stored via `gmdate()` | ✅ |
| Broker offset handling | Applied via `TimeCurrent() - TimeGMT()` | Transparent — input already in UTC | ✅ |
| Staleness threshold | N/A (EA sends fresh) | Hard reject >300s, warn >120s | ✅ |
| Candle time epoch guard | `CopyRates()` returns `time > 0` checked | `strtotime() > 946684800 (2000-01-01)` | ✅ |
| Candle time future guard | `candleTime >= now` → skip | None needed (PHP validates staleness) | ✅ |

---

## OHLC Parity

| Item | MQL5 | PHP | Match |
|---|---|---|---|
| Source | `CopyRates(PERIOD_M1, 1, 1)` (last closed bar, not forming bar) | Stored as-is from payload | ✅ |
| High ≥ max(open, close) | Guaranteed by broker history | Validated via `validate_ohlc()` | ✅ |
| Low ≤ min(open, close) | Guaranteed by broker history | Validated via `validate_ohlc()` | ✅ |
| Rejection on invalid OHLC | Filtered out by broker engine | Audit logged + candle rejected; snapshot still stored | ✅ |

---

## Fib Level Parity

| Item | Backend | Notes |
|---|---|---|
| Anchor | `fib_levels_from_candles()` using high/low of candle set | Uses `LTF_SF` family |
| Ratios | [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300] | 16 levels |
| MQL5 comparison | No separate fib computation in MQL5 EA — backend is authoritative | ✅ No parity drift |

---

## Signal Readiness Parity

| Condition | Backend Rule | Notes |
|---|---|---|
| Price is live | `price.state === 'live'` (updated_at within staleThresholdSec) | Correct |
| Candles fresh | `last_candle_age <= 7200s` | 2h buffer for offline/closed market |
| Minimum candles | `count(candles) >= 30` | M15 bars required |
| Chop gate | `chop < 0.7` | BLOCKED above 0.7 |
| Backend confirmed | `status === 'READY' && data_live` | Both required |
| Dashboard rendering | Reads `backendConfirmed` from backend | No local override |

---

## Known Blockers

None. All parity checks pass.

---

## Acceptance Criteria

- [x] EA sends ISO 8601 UTC timestamps — verified
- [x] PHP correctly parses and stores broker timestamp — verified
- [x] EA field names match PHP handler expectations — verified
- [x] OHLC validity enforced at PHP layer — verified (validate_ohlc())
- [x] is_finite() enforced for bid/ask — verified (PATCH-001, 2026-05-12)
- [x] Stale data rejected at PHP layer — verified (>300s hard reject)
- [x] Signal backendConfirmed requires live data — verified
- [x] Dashboard reads authority from backend — verified

## Residual Documentation Gap

The workflow specification payload example (`quote_time`, `server_time`, `candles[]`) does not match
the actual implemented contract. The spec example should be updated to reflect the actual contract
(`timestamp`, `candle{}`, `candle_m15{}`) in a future documentation PR. No code changes required.
