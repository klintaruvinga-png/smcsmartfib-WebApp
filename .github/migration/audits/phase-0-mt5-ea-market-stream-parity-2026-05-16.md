# Parity Audit Report — Phase 0/1 MT5 EA Market Stream & Bridge

**Report Date**: 2026-05-16  
**Phase**: Phase 0 complete — Phase 1 active  
**Auditor**: Stabilization Agent (stabilize-ea-2026-05-16)  
**Workflow ID**: stabilize-ea-2026-05-16  
**Status**: PASS — all code-contract parity confirmed; Phase 1 live validation pending

---

## Executive Summary

- **Overall Parity**: 100% code-contract parity maintained
- **Threshold Required**: Phase 0 requires stable EA→backend ingestion, correct auth, stale-data rejection
- **Pass/Fail**: PASS (code) — Phase 1 live validation pending
- **Trend**: Stable — no regressions introduced

This audit confirms that all Phase 0 parity achievements are intact as the project enters Phase 1. The Phase 1 bridge routes (heartbeat, account-sync, symbol-sync, license-check) are implemented and covered by PHP regression tests.

---

## Component Parity Metrics

### Route Parity

| Component | MT5 EA | PHP Handler | Match |
|-----------|--------|-------------|-------|
| Market Stream URL | `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` | `/sniper/v1/ea/market-stream` | ✓ |
| Heartbeat URL | `POST /wp-json/sniper/v1/ea/heartbeat` | Registered, permission_ea_bridge | ✓ |
| Account Sync URL | `POST /wp-json/sniper/v1/ea/account-sync` | Registered, permission_ea_bridge | ✓ |
| Symbol Sync URL | `POST /wp-json/sniper/v1/ea/symbol-sync` | Registered, permission_ea_bridge | ✓ |
| License Check URL | `GET /wp-json/sniper/v1/ea/license-check` | Registered, permission_ea_bridge | ✓ |
| HTTP Method | POST | POST | ✓ |
| Auth header | `X-EA-API-Key: {key}` | Reads all 4 aliases | ✓ |
| user_id | JSON body | Required, validated, wp_set_current_user | ✓ |

### Payload Parity (Market Stream)

| Field | MT5 EA (MQL5) | PHP Handler | Match |
|-------|--------------|-------------|-------|
| `user_id` | `"user_id": N` | Required in auth + handler | ✓ |
| `symbol` | `"symbol": "EURUSD"` | Required; map_symbol_aliases() applied | ✓ |
| `normalized_symbol` | `"normalized_symbol": "EURUSD"` | Accepted as override | ✓ |
| `timeframe` | `"timeframe": "M1"` | Normalized via normalize_mt5_timeframe() | ✓ |
| `timestamp` | `"timestamp": "ISO8601"` | Accepted; canonical field | ✓ |
| `quote_time` | Not sent (legacy EA uses `timestamp`) | Accepted as alias via !empty() | ✓ |
| `source` | Not sent (legacy EA) | Accepted; stored as 'mt5' | ✓ |
| `server_time` | Not sent (legacy EA) | Accepted; not stored | ✓ |
| `bid` | `"bid": N.NNNNN` | `is_finite() && > 0 && bid <= ask` guard | ✓ |
| `ask` | `"ask": N.NNNNN` | Same guard | ✓ |
| `freshness` | `"freshness": "LIVE"` | Stored as transient 300s TTL | ✓ |
| `session` | `"session": "London"` | Stored as transient 300s TTL | ✓ |
| `candle` | `"candle": {...}` | Validated: epoch, OHLC, staleness guards | ✓ |
| `candle_m15` | `"candle_m15": {...}` | Validated: same guards, 1800s max_age | ✓ |
| `candles[]` | Not sent (legacy) | Shim: candles[0] → candle; tick_volume→volume | ✓ |

### Candle Field Parity

| Field | MT5 EA | PHP Handler | Match |
|-------|--------|-------------|-------|
| `time` | ISO 8601 UTC | normalize_market_timestamp() | ✓ |
| `open` | DOUBLE | (float) cast | ✓ |
| `high` | DOUBLE | (float) cast; >= max(open,close) | ✓ |
| `low` | DOUBLE | (float) cast; <= min(open,close) | ✓ |
| `close` | DOUBLE | (float) cast | ✓ |
| `volume` | tick_volume (int) | guard_tick_volume(); negative clamped to 0 | ✓ |

### Timestamp Parity (UTC)

| Check | MT5 EA | PHP Handler | Match |
|-------|--------|-------------|-------|
| Timestamp format | ISO 8601 via TimeToIso8601() | strtotime() → MySQL | ✓ |
| UTC-only | TimeToIso8601() subtracts broker offset | gmdate() for server time | ✓ |
| Staleness threshold | FreshnessEngine: STALE after 300s | PHP: 300s hard-reject, 422 | ✓ |
| Candle age threshold | M1: 180s; M15: 1800s | insert_mt5_candle() max_age_sec param | ✓ |
| Epoch guard | MqlRates.time > 0 | candle_ts > 946684800 (2000-01-01) | ✓ |
| Equity session override | TimeCurrent() for NAS100/US30 off-session | is_equity_index_off_session() health check | ✓ |

### Authentication Parity

| Check | MT5 EA | PHP Handler | Match |
|-------|--------|-------------|-------|
| API key header | `X-EA-API-Key: {ApiKey}` | get_ea_api_key() all 4 aliases | ✓ |
| Timing-safe comparison | N/A (client) | hash_equals() | ✓ |
| Unconfigured secret | N/A | 503 + error_log | ✓ |
| user_id sent | `"user_id": UserId` | Required; get_userdata(); wp_set_current_user | ✓ |

### Symbol Normalization Parity

| Broker Symbol | MT5 SymbolNormalizer.mqh | PHP map_symbol_aliases() | Match |
|--------------|--------------------------|--------------------------|-------|
| GOLD | → XAUUSD | → XAUUSD | ✓ |
| GOLD.PRO | → XAUUSD (suffix strip then alias) | N/A (PHP receives normalized) | ✓ |
| SILVER | → XAGUSD | → XAGUSD | ✓ |
| US100/NASDAQ/NDX | → NAS100 | → NAS100 (also NASDAQ100/USTECH100) | ✓ |
| WALL STREET 30 | → US30 | → US30 (also WALLSTREET30/WALLST30) | ✓ |
| DJ30/DOW30/DJI | → US30 | → US30 | ✓ |
| US500/SPX | → SPX500 | N/A (not yet mapped in PHP — low priority) | ~ |

### Fib Parity

No fib calculation changes in this audit cycle. Deterministic fib parity confirmed in `phase-0-pine-backend-parity-2026-05-14.md`. Status: ✓ PASS (inherited).

### Signal-Readiness Parity

| Check | Status |
|-------|--------|
| Signal engine gates on MT5-fresh prices | ✓ PASS |
| Signal engine gates on ≥30 M15 closed bars | ✓ PASS (XAUUSD GOLD-alias fix 2026-05-14) |
| Chop gate blocks signal when chop ≥ 0.7 | ✓ PASS (AUDUSD/ETHUSD correct behavior) |
| Dashboard does not compute signals | ✓ PASS |
| Frontend reads age_sec from backend | ✓ PASS |
| FreshnessBadge reads backend state | ✓ PASS |
| VerdictBadge reads backend verdict | ✓ PASS |
| useEngineHealth staleTime:0 | ✓ PASS |

---

## Phase 1 Bridge Route Parity (Code-Contract)

| Route | Implemented | Regression Covered | Live Validated |
|-------|-------------|-------------------|----------------|
| `POST /ea/heartbeat` | ✓ | ✓ | ⏳ PENDING |
| `POST /ea/account-sync` | ✓ | ✓ | ⏳ PENDING |
| `POST /ea/symbol-sync` | ✓ | ✓ | ⏳ PENDING |
| `GET /ea/license-check` | ✓ | ✓ | ⏳ PENDING |

---

## Critical Issues Found

None in this audit cycle.

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|------------|--------|----------|
| `spread` field | EA computes from bid/ask; PHP stores integer pips | PHP recomputes from bid/ask; no drift in signal output | Yes |
| `server_time` field | Not sent by legacy EA | Metadata only; no signal impact | Yes |
| `source` field | Not sent by legacy EA; PHP stores 'mt5' | Correct for all EA pushes | Yes |
| US500/SPX → SPX500 | SymbolNormalizer has alias; PHP map_symbol_aliases not mapped | Low-priority; SPX500 not in standard watchlist | Accepted, low priority |
| session endpoint killzone vs full hours | Backend session endpoint returns SMC killzone windows (07-11, 12-16 UTC); MT5 SessionManager uses full sessions (07-15, 12-20) | Intentional display-only divergence; no signal authority impact | Yes |

---

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| EA→backend route exists and accepts POST | ✓ PASS |
| Auth header validated with hash_equals() | ✓ PASS |
| Missing token → 401 | ✓ PASS |
| Unconfigured secret → 503 | ✓ PASS |
| Invalid token → 403 | ✓ PASS |
| Missing user_id → 400 | ✓ PASS |
| Invalid user_id → 403 | ✓ PASS |
| quote_time accepted as timestamp alias | ✓ PASS |
| candles[] array processed via shim | ✓ PASS |
| Stale data (>300s) rejected with 422 | ✓ PASS |
| OHLC guard active | ✓ PASS |
| Epoch guard active (>2000-01-01) | ✓ PASS |
| Negative volume clamped to 0 | ✓ PASS |
| bid <= ask guard | ✓ PASS |
| NAS100/US30 feedStatus=live during active session | ✓ PASS (confirmed 2026-05-15 16:37 UTC) |
| XAUUSD candle-history readiness | ✓ PASS (confirmed 2026-05-15 after GOLD alias fix) |
| 14/14 EA market stream regression tests | ✓ PASS |
| Phase 1 bridge routes implemented | ✓ PASS (code) |
| Phase 1 live bridge validation | ⏳ PENDING |

---

## Recommendations

1. **Initiate Phase 1 live terminal validation** — Deploy `mt5/SMC_MarketDataEA.mq5` to the Deriv-Demo terminal and execute all 6 Phase 1 checklist scenarios (heartbeat, account-sync, symbol-sync, license-check, market-stream coexistence, reconnect/restart tests)
2. **48h heartbeat continuity soak** — Run uninterrupted for 48h before Phase 1 gate review
3. **Record evidence** in `PHASE1_TRACKER.md` and create Phase 1 closeout document
4. **Advance to Phase 2** once heartbeat + reconnect scenarios all pass — begin read-only trade telemetry work
5. **SPX500 symbol alias** — consider adding US500/SPX to `map_symbol_aliases()` in PHP to match MT5 normalizer; low priority until SPX500 is in a watchlist
6. **Weekend behavior testing** — deferred from Phase 0; schedule during Phase 1 validation window to avoid surprises
