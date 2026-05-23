# Phase 0 / Phase 3 MT5 EA Market Stream Parity Audit

**Date**: 2026-05-23  
**Workflow**: stabilize-ea-2026-05-23  
**Branch**: claude/nice-fermat-LKa98  
**Plugin Version**: 13.0.3  
**EA Version**: SMC_MarketDataEA.mq5 v1.00

---

## Route Parity

| Route | MQL5 Sender | PHP Handler | Parity |
|---|---|---|---|
| `POST /wp-json/sniper/v1/ea/market-stream` | `WebhookURL` input in SMC_MarketDataEA.mq5 | `post_ea_market_stream()` in smc-superfib-sniper.php | ✅ MATCH |
| `POST /sniper/v1/ea/heartbeat` | `HeartbeatURL` in MarketDataEngine.mqh | `post_ea_heartbeat()` | ✅ MATCH |
| `POST /sniper/v1/ea/account-sync` | via MarketDataEngine | `post_ea_account_sync()` | ✅ MATCH |
| `POST /sniper/v1/ea/symbol-sync` | via MarketDataEngine | `post_ea_symbol_sync()` | ✅ MATCH |
| `GET /sniper/v1/ea/license-check` | On EA OnInit | `get_ea_license_check()` | ✅ MATCH |

---

## Payload Parity — MQL5 Field Names vs PHP Handler

| MQL5 Field | PHP Handler Field | Accepted? | Notes |
|---|---|---|---|
| `user_id` (int) | `user_id` | ✅ | Required at auth layer; validated before handler runs |
| `symbol` (string) | `symbol` | ✅ | Normalized to uppercase; alias mapping applied |
| `normalized_symbol` (string) | `normalized_symbol` | ✅ | Takes precedence over raw symbol if present |
| `timeframe` (string) | `timeframe` | ✅ | `normalize_mt5_timeframe()` maps MQL5 names to 1min/15min etc. |
| `timestamp` (ISO 8601 UTC) | `quote_time` / `timestamp` | ✅ | `!empty(quote_time) ? quote_time : timestamp` fallback chain |
| `bid` (double) | `bid` | ✅ | Required; is_finite + >0 validated |
| `ask` (double) | `ask` | ✅ | Required; is_finite + >0 + bid<=ask validated |
| `spread` (double) | `spread` | ✅ | Required for Phase 3 payloads |
| `freshness` (string) | `freshness` | ✅ | Normalized to LIVE/DELAYED/STALE/CLOSED/DISCONNECTED |
| `session` (string) | `session` | ✅ | Mapped to Sydney/Tokyo/London/New York/Overlap/Closed |
| `candle.time` | `candle.time` | ✅ | ISO 8601 UTC; epoch guard applied |
| `candle.open` | `candle.open` | ✅ | |
| `candle.high` | `candle.high` | ✅ | OHLC validated: high ≥ max(open,close) |
| `candle.low` | `candle.low` | ✅ | OHLC validated: low ≤ min(open,close) |
| `candle.close` | `candle.close` | ✅ | |
| `candle.tick_volume` | `candle.tick_volume` → mapped to `candle.volume` | ✅ | normalize_phase3_market_stream_payload() maps tick_volume → volume |
| `candle_m15.*` | `candle_m15.*` | ✅ | Separate M15 candle slot; same validation as M1 |
| `candle_*_flat_aliases` | Accepted | ✅ | normalize_phase3_market_stream_payload() promotes flat aliases to nested |
| `candles[]` (array) | Accepted | ✅ | candles[0] promoted to M1 candle; multi-candle batch logged |
| `schema_version` | `schema_version` | ✅ | Required for Phase 2 trade telemetry batches |

---

## Timestamp Parity

| Aspect | EA (MQL5) | Backend (PHP) | Parity |
|---|---|---|---|
| Timezone | UTC (TimeGMT()) | UTC (gmdate()) | ✅ MATCH |
| Format | ISO 8601 (YYYY-MM-DDTHH:MM:SSZ) | ISO 8601 via normalize_market_timestamp() | ✅ MATCH |
| Stale threshold | N/A (EA sends current tick time) | Reject if age > 300s; warn 120–300s | ✅ CORRECT |
| Candle staleness | N/A | Reject candle if age > 180s separately from snapshot | ✅ CORRECT |
| Epoch guard | MQL5 checks time > 0 before sending | PHP: strtotime() + min_valid_ts = 946684800 (2000-01-01) | ✅ MATCH |
| Future candle guard | EA only sends closed candles | PHP: open/future candle rejected if candle_time >= stream_time | ✅ CORRECT |

---

## Fib Parity

| Calculation | Status | Notes |
|---|---|---|
| Fib anchor levels | PASS | test-fib-parity.php green; no fib logic changed |
| Swap Fib 1 / Bull Run / Swap Fib 2 | PENDING (Phase 4) | Not yet migrated to MT5 |
| Premium/discount zones | PENDING (Phase 4) | Not yet migrated to MT5 |
| HTF anchor validation | PASS | test-htf-authority-anchor.php green |

---

## Signal-Readiness Parity

| Gate | Backend | Dashboard | Parity |
|---|---|---|---|
| Freshness gate | Backend enforces; rejects stale prices | useEngineHealth staleTime:0 reflects backend truth | ✅ MATCH |
| Candle count gate | Backend: min 30 M15 bars required | Dashboard shows engine state from backend | ✅ MATCH |
| Regime gating | Backend chop logic | Dashboard displays backend verdict | ✅ MATCH |
| Live vs. stale | Backend is_live derived from freshness + source | Frontend VerdictBadge uses backend is_live flag | ✅ MATCH |
| MT5 authority check | Backend: source='mt5' required for EA-owned symbols | Frontend: no override possible | ✅ MATCH |

---

## Known Parity Limits

1. **Multi-candle batch**: Only `candles[0]` is ingested. Multi-candle batch ingestion is Phase 3 scope and logged with a diagnostic.
2. **Fib engine in MT5**: Phase 4 deliverable — not yet migrated. Pine remains authoritative for fib calculations.
3. **Regime engine in MT5**: Phase 5 deliverable — not yet migrated.
4. **Signal engine in MT5**: Phase 6 deliverable — not yet migrated (dual-run pending).

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| EA key auth model confirmed end-to-end | ✅ PASS |
| Missing token → 401 | ✅ PASS |
| Invalid token → 403 | ✅ PASS |
| Missing user_id → 400 | ✅ PASS |
| Valid fresh payload → 200 | ✅ PASS (confirmed in Phase 1 live validation 2026-05-18) |
| Stale payload → 422 | ✅ PASS (test 14 in test-ea-market-stream.php) |
| OHLC validation enforced | ✅ PASS |
| Epoch candle rejected | ✅ PASS |
| Freshness transient stored | ✅ PASS (phase3_mt5_simulation_test.php) |
| Session transient stored | ✅ PASS |
| M1 + M15 candles stored separately | ✅ PASS |
| Timestamp is UTC throughout | ✅ PASS |
| Dashboard does not fake live | ✅ PASS |
| Signal engine uses backend truth | ✅ PASS |
