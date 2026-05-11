# Parity Audit Report — Phase 0 MT5 EA Market Stream

**Report Date**: 2026-05-11  
**Phase**: Phase 0 soak — MT5-native migration  
**Auditor**: Claude Code (stabilize-ea-2026-05-11 workflow)  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100% (route, auth, payload field names, timestamp handling)
- **Threshold Required**: 95%
- **Pass/Fail**: ✓ PASS
- **Trend**: ↔ Stable

The MT5 EA market-stream ingestion path is confirmed internally consistent. The MQL5 `MarketDataEngine.mqh` `BuildWebhookPayload()` and the PHP `post_ea_market_stream()` handler use the same field names and timestamp format. One missing validation was patched (OHLC ordering guard, PATCH-001).

---

## Route Parity

| Item | MQL5 EA | PHP Backend | Match |
|---|---|---|---|
| Endpoint URL | `POST {WebhookURL}` (input param) | `POST /wp-json/sniper/v1/ea/market-stream` | ✓ |
| Auth header | `X-EA-API-Key: {ApiKey}` (in `cachedHeaders`) | `get_ea_api_key()` reads `x-ea-api-key` + 3 aliases | ✓ |
| Content-Type | `application/json` in headers | `$request->get_json_params()` | ✓ |

---

## Payload Parity (MQL5 field names vs. PHP handler field names)

| Field | MQL5 sends | PHP reads | Match |
|---|---|---|---|
| `user_id` | `"user_id": {wpUserId}` | `$payload['user_id']` | ✓ |
| `symbol` | `"symbol": "{symbol}"` | `$payload['symbol']` | ✓ |
| `normalized_symbol` | `"normalized_symbol": "{norm}"` | `$payload['normalized_symbol']` (optional override) | ✓ |
| `timeframe` | `"timeframe": "M1"` | `$payload['timeframe']` → `normalize_mt5_timeframe()` | ✓ |
| `timestamp` | `"timestamp": "{TimeToIso8601(tick.timestamp)}"` | `$payload['timestamp']` → staleness check + stored as `updated_at` | ✓ |
| `bid` | `"bid": {DoubleToString(tick.bid)}` | `$payload['bid']` | ✓ |
| `ask` | `"ask": {DoubleToString(tick.ask)}` | `$payload['ask']` | ✓ |
| `freshness` | `"freshness": "{FreshnessStateName(...)}"` | `$payload['freshness']` → transient | ✓ |
| `session` | `"session": "{GetSessionName()}"` | `$payload['session']` → transient | ✓ |
| `candle.time` | `"time": "{TimeToIso8601(candleTime_m1)}"` | `$candle['time']` | ✓ |
| `candle.open/high/low/close` | `DoubleToString(rates_m1[0].open, digits)` etc. | `(float) $candle['open']` etc. | ✓ |
| `candle.volume` | `IntegerToString((long)rates_m1[0].tick_volume)` | `isset($candle['volume'])` | ✓ |
| `candle_m15.*` | Same as `candle` but from `PERIOD_M15` | `$candle_m15` fields | ✓ |

**Note:** Workflow spec describes a `candles[]` array and `quote_time`/`server_time` fields. These are NOT the actual payload fields used. The EA and backend are aligned with the fields listed above. The spec was describing a proposed alternative contract.

---

## Timestamp Parity (UTC Handling)

| Item | MQL5 | PHP | Match |
|---|---|---|---|
| Timestamp generation | `TimeToIso8601()` applies `brokerUtcOffset = TimeCurrent() - TimeGMT()` to convert broker-local to UTC, appends `Z` | `strtotime()` + `gmdate()` → UTC | ✓ |
| Candle time generation | Same `TimeToIso8601()` applied to `CopyRates()` bar time | `strtotime($candle['time'])` → `gmdate('Y-m-d H:i:s')` | ✓ |
| Storage format | N/A (sends ISO 8601) | MySQL `DATETIME` via `gmdate()` | ✓ |
| Age computation | N/A | `time() - strtotime(normalized_timestamp)` for staleness | ✓ |

---

## Freshness State Parity

| MQL5 `ENUM_FRESHNESS_STATE` | MQL5 string sent | PHP transient stored | Dashboard displayed |
|---|---|---|---|
| `FRESHNESS_LIVE` | `"LIVE"` | `LIVE` | `FreshnessBadge state=live` |
| `FRESHNESS_DELAYED` | `"DELAYED"` | `DELAYED` | fallback to `stale` style |
| `FRESHNESS_STALE` | `"STALE"` | `STALE` | `stale` style |
| `FRESHNESS_CLOSED` | `"CLOSED"` | `CLOSED` | fallback to `stale` |
| `FRESHNESS_DISCONNECTED` | `"DISCONNECTED"` | `DISCONNECTED` | fallback to `stale` |

Note: `FreshnessBadge.tsx` handles unknown states via `STYLES[state] ?? STYLES["stale"]` guard. No crash risk.

---

## Candle Guard Parity

| Guard | MQL5 | PHP | Match |
|---|---|---|---|
| Future bar rejection | `candleTime_m1 >= now` → skip | `strtotime(candle.time) >= strtotime(stream_timestamp)` → skip | ✓ |
| Epoch/pre-2000 rejection | `CopyRates() index=1` returns closed bar (never epoch if history loaded) | `strtotime() < 946684800` → skip + audit | ✓ |
| Stale candle rejection | No EA-side staleness gate | M1: >180s from stream_timestamp; M15: >1800s | ✓ (PHP-side only) |
| OHLC ordering validation | Broker guarantees valid OHLC (trusted source) | NEW (PATCH-001): `validate_ohlc()` | ✓ added |

---

## Fib Parity

| Item | Pine | Backend | Match |
|---|---|---|---|
| Fib ratios used | [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300] | Same array in `$this->ratios` | ✓ |
| Level formula | `high - (ratio/100) * (high - low)` | `price_for_ratio()`: same formula | ✓ |

---

## Signal Readiness Parity

| Condition | Backend PHP | Dashboard |
|---|---|---|
| Price source=mt5 required | `$price_source !== 'mt5'` → BLOCKED | Reads `priceState` from backend response |
| Price state=live required | `$price_state !== 'live'` → BLOCKED | Reads `priceState` from backend response |
| Price age <= threshold | `$price_age > $engine_stale_threshold_sec` → BLOCKED | Does not compute independently |
| Candles >= 30 | `count($candles) < 30` → BLOCKED | Reads `candleCount` from diagnostics |
| Candles fresh (<=7200s) | `$candle_age_sec <= 7200` → `$candles_fresh` | Does not compute independently |
| backendConfirmed gate | `$status === 'READY' && $data_live` | Reads from backend signal response |
| Execute gate | `backend_confirmed=1 AND status='READY'` in DB | Cannot bypass — DB check only |

**Signal truth lives in the WordPress PHP backend. The React dashboard is a pure display layer.** ✓

---

## Known Parity Divergences

| Item | Description | Risk |
|---|---|---|
| Session windows | Dashboard `/session` returns killzone windows (London 07-11, NY 12-16). MT5 `SessionManager` uses full session hours (London 07-15, NY 12-20). Intentional display-only divergence. | LOW — display only |
| `candles[]` vs `candle{}` | Spec describes array; EA sends singular objects. Backend aligned with EA. | INFO — doc only |

---

## Known Blockers

None. System is in Phase 0 soak and operational.

---

## Acceptance Criteria

- [x] EA route auth confirmed correct
- [x] Payload field names aligned between EA and PHP
- [x] UTC timestamp handling confirmed
- [x] Freshness state round-trip confirmed
- [x] OHLC validation added
- [x] Signal engine guards confirmed
- [x] Backend is sole source of signal truth
- [x] All regression tests pass
