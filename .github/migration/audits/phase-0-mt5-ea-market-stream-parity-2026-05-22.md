# Phase 0/1/2 — MT5 EA Market Stream Parity Audit

**Date:** 2026-05-22  
**Workflow ID:** stabilize-ea-2026-05-22  
**Phase Context:** Phase 0 COMPLETE, Phase 1 COMPLETE (2026-05-20), Phase 2 IN-PROGRESS (implementation complete; active-day approved 2026-05-22)  
**Auditor:** Claude Code Stabilization Agent  
**Reference template:** `.github/migration/audits/PARITY_REPORT_TEMPLATE.md`

---

## Scope

Full parity audit of the MT5 EA market-stream ingestion path against the PHP plugin handler,
and the PHP handler output against dashboard rendering. Covers Phase 2 active-day definition
confirmation and identifies remaining gaps for Phase 3.

---

## 1. Route Parity

| Item | EA (MQL5 Sender) | PHP Handler | Parity |
|---|---|---|---|
| HTTP Method | `WebRequest(…)` POST | `WP_REST_Server::CREATABLE` | ✅ MATCH |
| URL | `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` | Registered as `sniper/v1/ea/market-stream` | ✅ MATCH |
| Auth Header | `X-EA-API-Key: {ApiKey}` in cached headers | `get_ea_api_key()` checks `x-ea-api-key` (priority) then 3 aliases | ✅ MATCH |
| Content-Type | `Content-Type: application/json` | `get_json_params()` | ✅ MATCH |
| Namespace | `sniper/v1` | `const NAMESPACE = 'sniper/v1'` | ✅ MATCH |

---

## 2. All Registered REST Routes

| Route | Method | Permission | Public? |
|-------|--------|------------|---------|
| `/sniper/v1/health` | GET | `__return_true` | ✅ Yes |
| `/sniper/v1/session` | GET | `__return_true` | ✅ Yes |
| `/sniper/v1/admin/health` | GET | `permission_admin` (manage_options) | ❌ No |
| `/sniper/v1/admin/soak-report` | GET | `permission_admin` | ❌ No |
| `/sniper/v1/admin/soak-evidence` | POST | `permission_admin` | ❌ No |
| `/sniper/v1/admin/soak-checkpoint` | POST | `permission_admin` | ❌ No |
| `/sniper/v1/snapshot` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/charts` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/regimes` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/regime` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/live-signals` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/signal` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/ladders` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/user/engine-batch` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/market-data` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/trades` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/account` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/progress` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/user/settings` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/risk-profile` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/trade-queue` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/execute-signals` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/twelve-data-key` | POST, DELETE | `permission_user` | ❌ WP session |
| `/sniper/v1/user/watchlist` | GET, POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/watchlist/add` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/user/watchlist/remove` | POST | `permission_user` | ❌ WP session |
| `/sniper/v1/instruments` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/account-telemetry` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/positions` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/orders` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/market-data-authority` | GET | `permission_user` | ❌ WP session |
| `/sniper/v1/authority-diagnostics` | GET | `permission_user` | ❌ WP session (EXPECTED 401 unauthenticated) |
| `/sniper/v1/ea/market-stream` | POST | `permission_ea_market_stream` (X-EA-API-Key) | ❌ API key |
| `/sniper/v1/ea/heartbeat` | POST | `permission_ea_bridge` (X-EA-API-Key) | ❌ API key |
| `/sniper/v1/ea/account-sync` | POST | `permission_ea_bridge` (X-EA-API-Key) | ❌ API key |
| `/sniper/v1/ea/symbol-sync` | POST | `permission_ea_bridge` (X-EA-API-Key) | ❌ API key |
| `/sniper/v1/ea/license-check` | GET | `permission_ea_bridge` (X-EA-API-Key) | ❌ API key |

---

## 3. Payload Parity (MQL5 Field Names vs PHP Handler Field Names)

| EA Sends (MQL5) | PHP Reads | Notes | Parity |
|---|---|---|---|
| `user_id` | `ea_request_value($request, $payload, 'user_id', 0)` | Required at permission callback layer | ✅ MATCH |
| `symbol` | `$payload['symbol']` | Raw broker symbol; overridden by `normalized_symbol` if present | ✅ MATCH |
| `normalized_symbol` | `$payload['normalized_symbol']` | Optional; takes precedence over `symbol` | ✅ MATCH |
| `timeframe` (e.g. "M1") | `$payload['timeframe'] ?? 'M15'` → `normalize_mt5_timeframe()` | M1→1min, M15→15min, etc. | ✅ MATCH |
| `timestamp` (ISO 8601) | `!empty($payload['quote_time']) ? ... : $payload['timestamp']` | Legacy alias; `quote_time` takes precedence | ✅ MATCH (compat) |
| `quote_time` (canonical) | `$payload['quote_time']` | Canonical REST contract field | ✅ MATCH |
| `bid` | `(float) $payload['bid']` | Validated finite, >0 | ✅ MATCH |
| `ask` | `(float) $payload['ask']` | Validated finite, >0, ask≥bid | ✅ MATCH |
| `spread` | Informational — server computes from `($ask - $bid) / pip_size` | Payload field not stored directly | ✅ CORRECT |
| `freshness` | `$payload['freshness']` | LIVE/STALE/CLOSED/DISCONNECTED → transient (5 min TTL) | ✅ MATCH |
| `session` | `$payload['session']` | Session name string → transient (5 min TTL) | ✅ MATCH |
| `candle.time` | `$candle['time']` | ISO 8601; epoch guard (>2000-01-01); future-candle guard | ✅ MATCH |
| `candle.open/high/low/close` | `(float) $candle[…]` | OHLC validated via `validate_ohlc()` | ✅ MATCH |
| `candle.volume` / `candle.tick_volume` | via `guard_tick_volume()` | `tick_volume` aliased to `volume`; clamped to non-negative int | ✅ MATCH |
| `candle_m15.*` | Same as `candle.*` with 1800s age gate | M15 closed bar | ✅ MATCH |
| `candles[0]` (canonical array) | Compat layer: promoted to `candle` | `tick_volume` → `volume`; extra entries audited | ✅ MATCH (compat) |
| `schema_version` | `$payload['schema_version'] ?? ''` | Required for Phase 2 trade telemetry batches | ✅ MATCH |

---

## 4. Timestamp Parity (UTC Handling)

| Aspect | EA (MQL5) | PHP | Parity |
|---|---|---|---|
| Tick timestamp source | `tick.timestamp` (broker datetime, UTC) | `strtotime($timestamp_raw)` | ✅ MATCH |
| ISO 8601 conversion | `TimeToIso8601(pushTime)` appends `Z` | PHP `normalize_market_timestamp()` appends `Z` if no marker | ✅ MATCH |
| UTC-suffix handling | EA provides clean UTC string | PHP strips trailing UTC/GMT/UT/Z abbreviations before pinning | ✅ MATCH |
| Stale hard-reject | N/A | `>300s → 422` with audit trail | ✅ CORRECT |
| Stale warn | N/A | `120-300s → error_log warning`; snapshot still writes | ✅ CORRECT |
| `updated_at` stored | Broker timestamp | Preserves true age in `age_sec` | ✅ CORRECT |
| `age_sec` calculation | N/A | `iso_age_sec(updated_at)` — NOT fetch time | ✅ CORRECT |

---

## 5. Authentication Parity

| Gate | EA Behavior | PHP Behavior | Parity |
|---|---|---|---|
| API key header | Sends `X-EA-API-Key: {ApiKey}` | `get_ea_api_key()` reads 4 variants | ✅ MATCH |
| Missing key | N/A | 401 `smc_sf_api_key_missing` | ✅ CORRECT |
| Unconfigured secret | N/A | 503 `smc_sf_api_key_unconfigured` + error_log | ✅ CORRECT |
| Wrong key | N/A | 403 `smc_sf_api_key_invalid` via `hash_equals()` | ✅ CORRECT |
| `user_id` | Always includes `"user_id"` in payload | Validated in `permission_ea_bridge` before handler | ✅ MATCH |
| Missing `user_id` | N/A | 400 `smc_sf_user_required` | ✅ CORRECT |
| Invalid `user_id` | N/A | 403 `smc_sf_user_invalid` | ✅ CORRECT |
| WP context binding | N/A | `wp_set_current_user($ea_user_id)` | ✅ CORRECT |

---

## 6. Freshness Parity

| State | EA Sends | PHP Stores | Dashboard Reads | Parity |
|-------|----------|------------|-----------------|--------|
| LIVE | `freshness: "LIVE"` | Transient (5 min TTL) | `FreshnessBadge state="live"` | ✅ MATCH |
| STALE | `freshness: "STALE"` | Transient (5 min TTL) | `FreshnessBadge state="stale"` | ✅ MATCH |
| age_sec > staleThresholdSec | N/A | `get_cached_price()` overrides state to "stale" | FreshnessBadge reads backend state | ✅ CORRECT |
| FreshnessBadge local derivation | N/A | N/A | None — reads backend state only | ✅ CORRECT |

---

## 7. Signal Engine Integrity

| Check | Status |
|-------|--------|
| Signal gated on `price_source === 'mt5'` | ✅ CORRECT |
| Signal gated on `price_state === 'live'` | ✅ CORRECT |
| Signal gated on `price_age <= staleThresholdSec` | ✅ CORRECT |
| Signal gated on `candle_age_sec <= 7200` | ✅ CORRECT |
| Chop gate blocks READY when chop >= 0.7 | ✅ CORRECT |
| Frontend overrides backend signal state | ❌ NEVER — backend is authoritative |
| Stale prices qualify signals | ❌ NEVER — stale check in engine_run path |

---

## 8. Phase 2 Trade Telemetry Transport Parity

| Item | Status |
|------|--------|
| Transport route | Same `POST /ea/market-stream` — `schema_version` field gates Phase 2 processing | ✅ CONFIRMED |
| Phase 2 payload fields | `schema_version`, `account_id`, `terminal_id`, positions/orders/account_telemetry | ✅ IMPLEMENTED |
| Phase 2 permission | Same `permission_ea_bridge` | ✅ SHARED |
| Dashboard read paths | `/account-telemetry`, `/positions`, `/orders` — read-only, backend-owned | ✅ CONFIRMED |
| Active-day definition | `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` — approved 2026-05-22 | ✅ IMPLEMENTED AND LIVE |
| Streak state | `LIVE` for users with engine run history; `UNAVAILABLE` if no completed runs | ✅ CORRECT |

---

## 9. Symbol Normalization Parity

| Input | Normalized Output | Source |
|-------|------------------|--------|
| GOLD | XAUUSD | `map_symbol_aliases()` |
| SILVER | XAGUSD | `map_symbol_aliases()` |
| NASDAQ, NASDAQ100 | NAS100 | `map_symbol_aliases()` |
| USTECH, USTECH100 | NAS100 | `map_symbol_aliases()` |
| WALLSTREET, WALLSTREET30 | US30 | `map_symbol_aliases()` |
| DOW30, DJ30 | US30 | `map_symbol_aliases()` |
| Broker-suffixed (e.g. EURUSDm) | EURUSD | `SymbolNormalizer.mqh` + `normalize_symbol_token()` |

---

## 10. Equity Index Session Guard Parity

| Aspect | Implementation |
|--------|----------------|
| Symbols covered | NAS100, US30 |
| Trading hours (EDT, UTC-4) | 13:30–20:00 UTC (2nd Sun Mar → 1st Sun Nov) |
| Trading hours (EST, UTC-5) | 14:30–21:00 UTC (otherwise) |
| DST awareness | `is_us_dst_active()` — post-2007 US DST rules |
| Weekend guard | Saturday (6) and Sunday (0) → off-session |

---

## 11. Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| EA → PHP field names match (canonical and legacy) | ✅ PASS |
| UTC timestamp handling end-to-end | ✅ PASS |
| Auth model fully implemented | ✅ PASS |
| Stale data rejection (>300s) | ✅ PASS |
| Candle validation (OHLC, epoch, age) | ✅ PASS |
| `age_sec` from broker timestamp (not fetch time) | ✅ PASS |
| Backend is authoritative for signal state | ✅ PASS |
| Dashboard does not fake live state | ✅ PASS |
| `authority-diagnostics` protected | ✅ PASS |
| Phase 2 telemetry transport path confirmed | ✅ PASS |
| Active-day definition implemented and approved | ✅ PASS |
| Equity index session guard DST-aware | ✅ PASS |
| Symbol normalization comprehensive | ✅ PASS |

---

## Known Gaps / Deferred Items

| Item | Phase | Notes |
|------|-------|-------|
| Multi-candle batch ingestion (full `candles[]` array) | Phase 3 | Only `candles[0]` stored; extra entries produce audit diagnostic |
| Browser parity review for Phase 2 panels | Phase 2 closeout | Manual testing step — account card, positions, floating P/L, hedge grouping |
| Dedicated regime-engine parity replay suite | Maintenance | Indirectly covered by health/snapshot tests |
| Dedicated signal-engine parity replay suite | Maintenance | Indirectly verified via gate condition checks |
