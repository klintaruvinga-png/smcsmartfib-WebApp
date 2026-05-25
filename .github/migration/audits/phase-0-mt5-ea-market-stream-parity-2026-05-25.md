# Parity Audit — MT5 EA Market Stream — 2026-05-25

**Report date**: 2026-05-25  
**Phase**: Phase 3 — MT5 Market Data Engine (72h stability soak — soak window closes today)  
**Status**: PASS  
**Overall parity**: 100% across all sampled regression suites  
**Threshold required**: 95%  

---

## Executive Summary

Full stabilization audit of the EA market-stream ingest path, authentication model, payload contract, freshness/stale-data guards, signal engine wiring, and dashboard rendering truth. All 14 EA market-stream regression tests pass. No parity drift detected in Fib, session anchor, watchlist, or signal authority paths. This is the Phase 3 soak window close audit (day 3 of 3).

---

## Route Parity

| Route | Method | Expected Auth | Actual Auth | Parity |
|-------|--------|--------------|-------------|--------|
| `/sniper/v1/ea/market-stream` | POST | X-EA-API-Key shared secret | `permission_ea_market_stream` → `permission_ea_bridge` | PASS |
| `/sniper/v1/authority-diagnostics` | GET | WP session (permission_user) | `permission_user` — 401 for unauth | PASS |
| `/sniper/v1/admin/health` | GET | manage_options | `permission_admin` | PASS |
| `/sniper/v1/admin/soak-report` | GET | manage_options | `permission_admin` | PASS |
| `/sniper/v1/admin/soak-evidence` | POST | manage_options | `permission_admin` | PASS |
| `/sniper/v1/admin/soak-checkpoint` | POST | manage_options | `permission_admin` | PASS |
| All `/sniper/v1/user/*` routes | GET/POST | WP session | `permission_user` | PASS |
| `/sniper/v1/ea/heartbeat` | POST | X-EA-API-Key | `permission_ea_bridge` | PASS |
| `/sniper/v1/ea/account-sync` | POST | X-EA-API-Key | `permission_ea_bridge` | PASS |
| `/sniper/v1/ea/symbol-sync` | POST | X-EA-API-Key | `permission_ea_bridge` | PASS |
| `/sniper/v1/ea/license-check` | GET | X-EA-API-Key | `permission_ea_bridge` | PASS |

No duplicate routes. No public exposure of protected endpoints.

---

## Payload Parity — MQL5 Field Names vs PHP Handler Field Names

| MQL5 Field | PHP Handler Field | Mapping | Status |
|-----------|------------------|---------|--------|
| `user_id` | `user_id` | Direct | PASS |
| `symbol` | `symbol` | Direct + normalize via `map_symbol_aliases()` | PASS |
| `normalized_symbol` | `normalized_symbol` | Override symbol if present | PASS |
| `timeframe` | `timeframe` | Normalized via `normalize_mt5_timeframe()` | PASS |
| `timestamp` | `timestamp` | Legacy field; still accepted | PASS |
| `quote_time` | `quote_time` | Canonical alias; takes precedence over `timestamp` via `!empty()` guard | PASS |
| `server_time` | `server_time` | Stored for diagnostics | PASS |
| `bid` | `bid` | Direct; is_finite() + >0 guard | PASS |
| `ask` | `ask` | Direct; is_finite() + >0 guard; bid <= ask | PASS |
| `spread` | `spread` | Direct | PASS |
| `freshness` | `freshness` | Normalized via `normalize_mt5_freshness_value()` (LIVE/DELAYED/STALE/CLOSED/DISCONNECTED) | PASS |
| `session` | `session` | Normalized via `normalize_mt5_session_value()` (Sydney/Tokyo/London/New York/Overlap/Closed) | PASS |
| `candle` | `candle` | Legacy single-object form | PASS |
| `candles[]` | `candles` | Array form; candles[0] promoted to candle object; tick_volume → volume | PASS |
| `candle.time` | `candle['time']` | ISO 8601; epoch/pre-2000 rejected; >180s stale rejected at insert_mt5_candle() | PASS |
| `candle.open` | `candle['open']` | Finite float | PASS |
| `candle.high` | `candle['high']` | Finite float; high >= max(open,close) | PASS |
| `candle.low` | `candle['low']` | Finite float; low <= min(open,close) | PASS |
| `candle.close` | `candle['close']` | Finite float | PASS |
| `candle.tick_volume` | `candle['volume']` | Mapped via tick_volume→volume shim; clamped to max(0, int) | PASS |
| `candle_m15` | `candle_m15` | M15 candle; same OHLC/time/epoch/stale rules | PASS |
| `schema_version` | `schema_version` | Required for Phase 2 trade telemetry batches | PASS |

---

## Timestamp Parity — UTC Handling

| Path | MQL5 | PHP | Parity |
|------|-------|-----|--------|
| Candle time | `TimeToString(rates[i].time, TIME_DATE\|TIME_MINUTES\|TIME_SECONDS)` with UTC timezone | `normalize_market_timestamp()` parses ISO 8601 UTC; appends 'Z' if no timezone marker | PASS |
| Quote time | UTC ISO 8601 string | `normalize_market_timestamp()` → `strtotime()` → stored as MySQL UTC | PASS |
| Server time | UTC ISO 8601 string | Stored for diagnostics | PASS |
| Staleness check | EA sends current broker time as quote_time | PHP computes `time() - strtotime(quote_time)` in server UTC; >300s → 422 | PASS |
| Candle staleness | Candle time = closed bar time (UTC) | `insert_mt5_candle()` checks `time() - strtotime(candle.time)` > max_age_sec (default 180s) | PASS |
| MQL5 timestamp format | `2026.05.25 00:00:00` (dot separator) | `normalize_market_timestamp()` converts dots to dashes via regex before parsing | PASS |

---

## Symbol Alias Parity

| Broker Name / Alias | MQL5 SymbolNormalizer | PHP map_symbol_aliases | Parity |
|--------------------|----------------------|----------------------|--------|
| GOLD → XAUUSD | SymbolNormalizer.mqh | `map_symbol_aliases()` | PASS |
| SILVER → XAGUSD | SymbolNormalizer.mqh | `map_symbol_aliases()` | PASS |
| NASDAQ / NASDAQ100 / USTECH100 → NAS100 | SymbolNormalizer.mqh | `map_symbol_aliases()` | PASS |
| WALLSTREET / WALLSTREET30 / DOW30 / DJ30 → US30 | SymbolNormalizer.mqh | `map_symbol_aliases()` | PASS |

---

## Timeframe Normalization Parity

| MQL5 | PHP normalize_mt5_timeframe | Stored As | Parity |
|------|----------------------------|-----------|--------|
| M1 | 1min | smc_sf_candles.timeframe = '1min' | PASS |
| M5 | 5min | smc_sf_candles.timeframe = '5min' | PASS |
| M15 | 15min | smc_sf_candles.timeframe = '15min' | PASS |
| M30 | 30min | smc_sf_candles.timeframe = '30min' | PASS |
| H1 | 1h | smc_sf_candles.timeframe = '1h' | PASS |
| H4 | 4h | smc_sf_candles.timeframe = '4h' | PASS |
| D1 | 1day | smc_sf_candles.timeframe = '1day' | PASS |
| W1 | 1week | smc_sf_candles.timeframe = '1week' | PASS |

---

## Fib Parity

| Metric | Result |
|--------|--------|
| Fib anchor (F1/F2/F3) computation | PASS — test-fib-parity.php |
| Composite anchor (weighted average) | PASS |
| SuperFIB recency weights (0.40/0.35/0.25) | PASS — test-superfib-weighting.php |
| HTF anchor (higher timeframe authority) | PASS — test-htf-authority-anchor.php |
| Session anchor parity | PASS — test-session-anchors.php |
| Compression guard | PASS |

No drift between PHP backend fib calculations and expected parity values. Pine formula not modified.

---

## Signal-Readiness Parity

| Gate | PHP Logic | Parity |
|------|-----------|--------|
| Price freshness | `get_cached_price()` checks age vs staleThresholdSec | PASS |
| Equity index off-session | `is_equity_index_off_session()` with DST handling for NAS100/US30 | PASS |
| Candle freshness | `is_chart_candle_fresh()` with 2h-4h threshold window by timeframe | PASS |
| Minimum candle history | `fetch_candles()` returns INSUFFICIENT if < 30 M15 bars | PASS |
| Backend authority | Signal truth computed in WordPress plugin, not dashboard | PASS |
| Dashboard live status | FreshnessBadge uses backend `state` prop — does not compute live/stale locally | PASS |

---

## Known Issues

None. Zero parity drift across all audited paths.

---

## Known Blockers (non-parity, operator/trader actions)

1. **Phase 3 gate**: Operator must capture T0 baseline and run DB gate queries
2. **NAS100/US30 EA config**: Trader must add broker alias names to MT5 EA Properties Symbols input
3. **Weekend observation**: Passive soak covering Sat–Sun; results to be recorded in closeout template

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| EA route uses X-EA-API-Key | ✅ PASS |
| Missing key → 401 | ✅ PASS |
| Unconfigured secret → 503 | ✅ PASS |
| Invalid key → 403 | ✅ PASS |
| Missing user_id → 400 | ✅ PASS |
| Invalid user_id → 403 | ✅ PASS |
| wp_set_current_user() called | ✅ PASS |
| Stale quote_time (>300s) → 422 | ✅ PASS |
| Invalid OHLC → rejected | ✅ PASS |
| Epoch candle → rejected | ✅ PASS |
| authority-diagnostics protected (401 unauth) | ✅ PASS |
| Admin routes require manage_options | ✅ PASS |
| Backend authority preserved | ✅ PASS |
| Dashboard does not fake live state | ✅ PASS |
| PHP syntax clean | ✅ PASS |
| MQL include validation | ✅ PASS |
| All PHP regression tests pass | ✅ PASS (11 suites / 14 EA assertions) |
