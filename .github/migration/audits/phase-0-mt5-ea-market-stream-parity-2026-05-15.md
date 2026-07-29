# Parity Audit Report — Phase 0 MT5 EA Market Stream

**Report Date**: 2026-05-15  
**Phase**: Phase 0 — MT5-native migration / 72h soak validation  
**Auditor**: Stabilization Agent (claude/nice-fermat-WxJFl)  
**Workflow ID**: stabilize-ea-2026-05-15  
**Status**: PASS (contract parity achieved; live validation soaks pending)

---

## Executive Summary

- **Overall Parity**: 100% code-contract parity achieved after patch. Live operational parity (NAS100/US30, XAUUSD) requires validation soaks.
- **Threshold Required**: Phase 0 requires stable EA→backend ingestion, correct auth, and stale-data rejection
- **Pass/Fail**: PASS (code) / PENDING (live operational)
- **Trend**: ↑ Improving — quote_time alias and candles[] array shim added 2026-05-15

---

## Component Parity Metrics

### Route Parity

| Component    | MT5 EA                                                                   | PHP Handler                                                 | Match |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------- | ----- |
| Endpoint URL | `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` | `/sniper/v1/ea/market-stream`                               | ✓     |
| HTTP Method  | POST                                                                     | POST                                                        | ✓     |
| Auth header  | `X-EA-API-Key: {key}`                                                    | Reads `X-EA-API-Key` (+ 3 aliases)                          | ✓     |
| user_id      | Sent in JSON body                                                        | Required, read from body, bound via `wp_set_current_user()` | ✓     |

### Payload Parity

| Field               | MT5 EA (MQL5)                   | PHP Handler                                                              | Match     |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ | --------- |
| `user_id`           | `"user_id": N`                  | Required in body                                                         | ✓         |
| `symbol`            | `"symbol": "EURUSD"`            | Required in body                                                         | ✓         |
| `normalized_symbol` | `"normalized_symbol": "EURUSD"` | Accepted as override of symbol                                           | ✓         |
| `timeframe`         | `"timeframe": "M1"`             | Normalized via `normalize_mt5_timeframe()`                               | ✓         |
| `timestamp`         | `"timestamp": "ISO8601"`        | Accepted; alias for `quote_time`                                         | ✓         |
| `quote_time`        | Not sent (legacy EA)            | **NEW**: Accepted as alias for `timestamp`                               | ✓ PATCHED |
| `source`            | Not sent by legacy EA           | Accepted but not required; stored as 'mt5' internally                    | ✓         |
| `server_time`       | Not sent by legacy EA           | Accepted; not currently stored                                           | ✓         |
| `bid`               | `"bid": N.NNNNN`                | Required; `is_finite() && > 0` guard                                     | ✓         |
| `ask`               | `"ask": N.NNNNN`                | Required; `is_finite() && > 0` guard                                     | ✓         |
| `spread`            | Not sent                        | Computed from `(ask - bid) * 100000`                                     | ✓         |
| `freshness`         | `"freshness": "LIVE"`           | Stored as transient, 300s TTL                                            | ✓         |
| `session`           | `"session": "London"`           | Stored as transient, 300s TTL                                            | ✓         |
| `candle`            | `"candle": {...}`               | Accepted as M1 candle object                                             | ✓         |
| `candle_m15`        | `"candle_m15": {...}`           | Accepted as M15 candle object                                            | ✓         |
| `candles`           | Not sent by legacy EA           | **NEW**: `candles[0]` promoted to M1 candle; `tick_volume→volume` mapped | ✓ PATCHED |

### Candle Field Parity (M1 and M15)

| Field    | MT5 EA (MQL5)                      | PHP Handler                                                                       | Match |
| -------- | ---------------------------------- | --------------------------------------------------------------------------------- | ----- |
| `time`   | ISO 8601 UTC string                | `normalize_market_timestamp()`                                                    | ✓     |
| `open`   | `DOUBLE`                           | `(float)` cast                                                                    | ✓     |
| `high`   | `DOUBLE`                           | `(float)` cast; `>= max(open,close)` guard                                        | ✓     |
| `low`    | `DOUBLE`                           | `(float)` cast; `<= min(open,close)` guard                                        | ✓     |
| `close`  | `DOUBLE`                           | `(float)` cast                                                                    | ✓     |
| `volume` | `tick_volume` as `IntegerToString` | `(int)` cast; negative clamped to 0; `tick_volume` alias mapped in candles[] shim | ✓     |

### Timestamp Parity (UTC Handling)

| Check                   | MT5 EA                                           | PHP Handler                                              | Match |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------- | ----- |
| Timestamp format        | ISO 8601 via `TimeToIso8601()`                   | `strtotime()` → MySQL format                             | ✓     |
| UTC-only                | `TimeToIso8601()` subtracts broker offset        | `gmdate()` for server time                               | ✓     |
| Equity session override | `TimeCurrent()` used for NAS100/US30 off-session | PHP `is_equity_index_off_session()` handles health check | ✓     |
| Staleness threshold     | EA: `FreshnessEngine` marks STALE after 300s     | PHP: 300s hard-reject, 422 response                      | ✓     |

### Authentication Parity

| Check                  | MT5 EA                      | PHP Handler                      | Match |
| ---------------------- | --------------------------- | -------------------------------- | ----- |
| API key in header      | `"X-EA-API-Key: " + ApiKey` | Reads `x-ea-api-key` (+ aliases) | ✓     |
| Timing-safe comparison | N/A (client side)           | `hash_equals()`                  | ✓     |
| Unconfigured secret    | N/A                         | Returns 503 + error_log          | ✓     |
| user_id sent           | `"user_id": UserId`         | Required; `get_userdata()` check | ✓     |

### Fib Parity

No fib calculation changes in this audit cycle. Deterministic fib parity was confirmed in `phase-0-pine-backend-parity-2026-05-14.md`. Status: ✓ PASS (inherited from prior audit).

### Signal-Readiness Parity

| Check                                                           | Status                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| Signal engine gates on MT5-fresh prices                         | ✓ PASS                                                        |
| Signal engine gates on sufficient candle history (≥30 M15 bars) | ✓ PASS (XAUUSD historically blocked by GOLD alias, now fixed) |
| Chop gate blocks signal when chop ≥ 0.7                         | ✓ PASS (AUDUSD/ETHUSD correct behavior)                       |
| Dashboard does not compute signals                              | ✓ PASS                                                        |
| Frontend reads `age_sec` from backend                           | ✓ PASS                                                        |

### Symbol Normalization Parity

| Broker Symbol                 | MT5 SymbolNormalizer.mqh    | PHP map_symbol_aliases()              | Match |
| ----------------------------- | --------------------------- | ------------------------------------- | ----- |
| GOLD                          | → XAUUSD                    | → XAUUSD                              | ✓     |
| GOLD.PRO                      | → XAUUSD (via suffix strip) | N/A (PHP receives normalized)         | ✓     |
| SILVER                        | → XAGUSD                    | → XAGUSD                              | ✓     |
| US100 / NASDAQ / NDX          | → NAS100                    | → NAS100 (NASDAQ/NASDAQ100/USTECH100) | ✓     |
| WALL STREET 30 / WALLSTREET30 | → US30                      | → US30                                | ✓     |
| DJ30 / DOW30                  | → US30                      | → US30                                | ✓     |
| US500 / SPX                   | → SPX500                    | N/A                                   | ✓     |

---

## Critical Issues Found

| Issue                                        | Severity | Count | Resolution                                          | Blocker                      |
| -------------------------------------------- | -------- | ----- | --------------------------------------------------- | ---------------------------- |
| `quote_time` not accepted as alias           | MEDIUM   | 1     | FIXED 2026-05-15 (PATCH-1)                          | No (EA uses `timestamp`)     |
| `candles[]` array not processed              | MEDIUM   | 1     | FIXED 2026-05-15 (PATCH-1 shim)                     | No (EA uses `candle` object) |
| NAS100/US30 live validation soak not started | HIGH     | 2     | Code fix merged PR #170/#171; soak required         | Yes (Phase 0 gate)           |
| XAUUSD candle accumulation not confirmed     | HIGH     | 1     | Code fix merged PR #170; EA restart + 7.5h required | Yes (Phase 0 gate)           |

---

## Acceptable Drift Items

| Item                      | Difference                                                   | Reason                                                 | Accepted          |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ | ----------------- |
| `spread` field            | EA computes from bid/ask implicitly; PHP stores integer pips | PHP recomputes from bid/ask; no drift in signal output | Yes               |
| `server_time` field       | Not sent by legacy EA; accepted but not stored by PHP        | Metadata only; no signal impact                        | Yes               |
| `source` field            | Not sent by legacy EA; PHP always stores 'mt5'               | Correct for all EA pushes                              | Yes               |
| `tick_volume` vs `volume` | Canonical REST uses `tick_volume`; legacy EA uses `volume`   | Shim maps `tick_volume→volume` in candles[] path       | Yes (after patch) |

---

## Acceptance Criteria Status

| Criterion                                         | Status                                  |
| ------------------------------------------------- | --------------------------------------- |
| EA→backend route exists and accepts POST          | ✓ PASS                                  |
| Auth header validated with `hash_equals()`        | ✓ PASS                                  |
| `quote_time` accepted as timestamp alias          | ✓ PASS (PATCHED 2026-05-15)             |
| `candles[]` array processed via shim              | ✓ PASS (PATCHED 2026-05-15)             |
| Stale data (>300s) rejected with 422              | ✓ PASS                                  |
| OHLC guard active                                 | ✓ PASS                                  |
| Epoch guard active                                | ✓ PASS                                  |
| Negative volume clamped                           | ✓ PASS                                  |
| NAS100/US30 feedStatus=live during active session | ⏳ PENDING (live soak required)         |
| XAUUSD candle-history readiness                   | ⏳ PENDING (EA restart + 7.5h required) |
| 14/14 EA market stream regression tests           | ✓ PASS                                  |

---

## Recommendations

1. **EA restart immediately** after this branch is deployed — picks up GOLD alias from SymbolNormalizer.mqh
2. **4-hour validation soak** for NAS100/US30 — schedule for next US equity session (13:30–20:00 UTC Mon–Fri)
3. **7.5h monitoring** for XAUUSD candle accumulation after EA restart
4. **Phase 0 closeout** can proceed if both soaks PASS — update phase tracker and run Phase 0 readiness check
5. **Begin Phase 1 planning** if Phase 0 closes: MT5 bridge infrastructure, account sync hardening, execution engine prep
