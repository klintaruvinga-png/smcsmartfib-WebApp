# Phase 0 MT5 EA Market Stream Parity Audit — 2026-05-14

## Audit Scope

Full end-to-end parity verification of the MT5 EA ingestion pipeline and signal engine for the
2026-05-14 stabilization workflow. Builds on `phase-0-mt5-ea-market-stream-parity-2026-05-13.md`.

---

## Route Parity

| Item | MQL5 EA | PHP Plugin | Match |
|---|---|---|---|
| Endpoint URL | `WebhookURL` input (default: `.../sniper/v1/ea/market-stream`) | `register_rest_route(self::NAMESPACE, '/ea/market-stream', ...)` | ✅ |
| HTTP method | POST via `WebRequest()` | `WP_REST_Server::CREATABLE` (POST) | ✅ |
| Auth header sent | `"X-EA-API-Key: " + ApiKey` | `get_ea_api_key()` reads x-ea-api-key, x_ea_api_key, x-api-key, x_api_key | ✅ |
| Auth validation | N/A | `hash_equals($configured, $provided)` with 401/403/503 on failure | ✅ |
| Content-Type | `application/json` | Parsed via `$request->get_json_params()` | ✅ |

---

## Payload Field Parity

| Field (MQL5 sender) | Field (PHP handler) | Match | Notes |
|---|---|---|---|
| `user_id` | `payload['user_id']` | ✅ | Required. Auth layer validates via `get_userdata()`. |
| `symbol` | `payload['symbol']` | ✅ | Broker symbol string. Sanitized + uppercased. |
| `normalized_symbol` | `payload['normalized_symbol']` | ✅ | Canonical suffix-stripped form. Optional. |
| `timeframe` | `payload['timeframe']` | ✅ | Always `"M1"` from EA. `normalize_mt5_timeframe()` maps to `'1min'`. |
| `timestamp` | `payload['timestamp']` | ✅ | EA tick time as ISO 8601 UTC. Hard reject if >300s old. |
| `bid` | `payload['bid']` | ✅ | Validated: isfinite, > 0. |
| `ask` | `payload['ask']` | ✅ | Validated: isfinite, > 0, bid ≤ ask. |
| `freshness` | `payload['freshness']` | ✅ | LIVE/DELAYED/STALE/CLOSED/DISCONNECTED from FreshnessEngine. |
| `session` | `payload['session']` | ✅ | Session name from SessionManager. Stored in transient. |
| `candle{}` | `payload['candle']` | ✅ | Last closed M1 bar via `CopyRates(PERIOD_M1, 1, 1)`. Optional. |
| `candle.time` | `candle['time']` | ✅ | ISO 8601 UTC. Epoch guard (pre-2000 rejected). |
| `candle.open/high/low/close` | Validated by `validate_ohlc()` | ✅ | high≥max(open,close), low≤min(open,close). |
| `candle.volume` (tick_volume) | `candle['volume']` | ✅ | `guard_tick_volume()` clamps negative values to 0 with audit. |
| `candle_m15{}` | `payload['candle_m15']` | ✅ | Last closed M15 bar via `CopyRates(PERIOD_M15, 1, 1)`. Optional. |

**DOCUMENTED DIVERGENCE (unchanged from 2026-05-12/2026-05-13):** The workflow specification uses
`quote_time`, `server_time`, and `candles[]` (array) in its payload examples. The actual implemented
contract uses `timestamp` (singular), `candle{}` (singular M1 object), and `candle_m15{}` (singular
M15 object). This divergence spans both EA and PHP — the spec example is illustrative, not normative.

---

## Timestamp Parity (UTC Handling)

| Item | MQL5 | PHP | Match |
|---|---|---|---|
| Tick timestamp | `TimeToIso8601(tick.timestamp)` via UTC offset calc | Parsed via `normalize_market_timestamp()` | ✅ |
| UTC conversion | `t - (TimeCurrent() - TimeGMT())` then Z suffix | `strtotime()` + stored via `gmdate()` | ✅ |
| Staleness hard reject | N/A (EA sends fresh data) | >300s → **422** error (was 400 — patched 2026-05-14) | ✅ |
| Staleness warning | N/A | 120–300s → error_log drift warning | ✅ |
| Candle epoch guard | `CopyRates()` + `time > 0` check | `strtotime() > 946684800` (2000-01-01) | ✅ |
| M1 candle staleness | `CopyRates(1, 1)` is always closed bar | `insert_mt5_candle()` max_age_sec=180 (now always checked) | ✅ |
| M15 candle staleness | `CopyRates(PERIOD_M15, 1, 1)` is closed bar | `insert_mt5_candle()` max_age_sec=1800 (now always checked) | ✅ |
| Missing timestamp + candle | N/A (EA always sends timestamp) | Server-time fallback ensures guards always run (patched 2026-05-14) | ✅ |

---

## OHLC Parity

| Item | MQL5 | PHP | Match |
|---|---|---|---|
| Source | `CopyRates(PERIOD_M1, 1, 1)` (last closed bar) | Stored as-is from payload | ✅ |
| high ≥ max(open, close) | Guaranteed by broker history | `validate_ohlc()` | ✅ |
| low ≤ min(open, close) | Guaranteed by broker history | `validate_ohlc()` | ✅ |
| volume non-negative | MT5 tick_volume is always ≥ 0 | `guard_tick_volume()` clamps to 0 | ✅ |
| Rejection on invalid | Filtered by broker engine | Audit logged + candle rejected; snapshot still stored | ✅ |

---

## Fib Level Parity

| Item | Backend | Notes |
|---|---|---|
| Anchor | `fib_levels_from_candles()` using high/low of candle set | LTF_SF family |
| Ratios | [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300] | 16 levels |
| MQL5 comparison | No separate fib computation in MQL5 EA — backend is authoritative | ✅ No drift |

---

## Signal Readiness Parity

| Gate | Backend | Match |
|---|---|---|
| Price state | `price_state === 'live'` | ✅ Backend authoritative |
| Candle count | `count($candles) >= 30` | ✅ Backend enforced |
| Candle freshness | `candle_age_sec <= 7200` | ✅ Backend enforced |
| Chop gate | `chop < 0.7` | ✅ Backend enforced |
| MT5 authority | MT5 source takes precedence over Twelve Data | ✅ |
| Rate limit bypass | MT5 authority ignores Twelve Data rate limits | ✅ |

---

## Dashboard Rendering Parity

| UI Element | Source | Status |
|---|---|---|
| `FreshnessBadge` state | `price.state` from backend snapshot | ✅ Backend authoritative |
| `VerdictBadge` verdict | `signal.verdict` from backend engine | ✅ Backend authoritative |
| `age_sec` | Computed from broker `updated_at` (stored as ISO timestamp) | ✅ Not page-load time |
| `is_live` flag | Backend `freshness === 'LIVE' && source === 'mt5'` | ✅ Backend authoritative |

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| EA successfully POSTs to `/ea/market-stream` with API key | ✅ Route registered and functional |
| Stale payloads rejected | ✅ >300s → 422 (patched) |
| Open/forming candles rejected | ✅ Future-candle guard always active (patched) |
| Invalid OHLC rejected | ✅ |
| Negative tick_volume clamped | ✅ |
| Signal engine uses MT5 data only when authoritative | ✅ |
| Dashboard reflects backend truth | ✅ |
| All 12 regression suites pass | ✅ |
| PHP syntax clean | ✅ |
| MQL5 include check passes | ✅ |

---

## Known Blockers

None. All identified issues patched in this workflow run.

---

## Changes Since 2026-05-13 Audit

1. **Staleness rejection HTTP status:** 400 → 422 (BUG-002 patch).
2. **Stream timestamp fallback:** Missing `timestamp` in payload now causes server clock to be
   used as `$stream_timestamp`, ensuring candle staleness guards always execute (BUG-001 patch).
3. **Test coverage:** Test 11 added to verify the server-time fallback path.
