# Parity Audit Report — Phase 0/1 MT5 EA Market Stream & Bridge

**Report Date**: 2026-05-18
**Phase**: Phase 0 COMPLETE — Phase 1 active (20%)
**Auditor**: Stabilization Agent (stabilize-ea-2026-05-18)
**Workflow ID**: stabilize-ea-2026-05-18
**Status**: PASS — 100% code-contract parity confirmed; Phase 1 live validation pending

---

## Executive Summary

- **Overall Parity**: 100% code-contract parity maintained
- **Threshold Required**: Phase 0 requires stable EA→backend ingestion, correct auth, stale-data rejection
- **Pass/Fail**: PASS (code) — Phase 1 live terminal validation pending
- **Trend**: Stable — no regressions from yesterday (2026-05-17 audit also PASS)
- **Changes This Run**: LINT-001 prettier fix in scripts/pipeline-watcher.js only — zero parity impact

---

## Route Parity

| Component | MT5 EA (MQL5) | PHP Handler | Match |
|-----------|--------------|-------------|-------|
| Market Stream URL | `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` | `POST /sniper/v1/ea/market-stream` | ✓ |
| HTTP Method | POST | POST | ✓ |
| Auth header | `X-EA-API-Key: {key}` (set in `cachedHeaders`) | Reads all 4 aliases | ✓ |
| user_id (market-stream) | JSON body field | Required in both auth callback and handler | ✓ |
| Heartbeat URL | `POST /wp-json/sniper/v1/ea/heartbeat` | Registered, permission_ea_bridge | ✓ |
| Heartbeat user_id | `"user_id": wpUserId` in JSON body | Required by permission_ea_bridge | ✓ |
| Account Sync URL | `POST /wp-json/sniper/v1/ea/account-sync` | Registered, permission_ea_bridge | ✓ |
| Account Sync user_id | `"user_id": wpUserId` in JSON body | Required by permission_ea_bridge | ✓ |
| Symbol Sync URL | `POST /wp-json/sniper/v1/ea/symbol-sync` | Registered, permission_ea_bridge | ✓ |
| Symbol Sync user_id | `"user_id": wpUserId` in JSON body | Required by permission_ea_bridge | ✓ |
| License Check URL | `GET /wp-json/sniper/v1/ea/license-check` | Registered, permission_ea_bridge | ✓ |
| License Check user_id | `?user_id=wpUserId` in query string | `ea_request_value()` reads JSON + query fallback | ✓ |

---

## Payload Parity (Market Stream)

| Field | MT5 EA (MQL5) | PHP Handler | Match |
|-------|--------------|-------------|-------|
| `user_id` | `"user_id": N` (wpUserId when > 0) | Required in auth + handler | ✓ |
| `symbol` | `"symbol": symbol` (raw broker name) | `sanitize_text_field(strtoupper())` + `map_symbol_aliases()` | ✓ |
| `normalized_symbol` | `"normalized_symbol": norm` (via SymbolNormalizer) | Accepted as override for `symbol` | ✓ |
| `timeframe` | `"timeframe":"M1"` | `normalize_mt5_timeframe()` → `'1min'` | ✓ |
| `timestamp` | `"timestamp": TimeToIso8601(pushTime)` | Accepted as canonical field; also accepts `quote_time` | ✓ |
| `bid` | `"bid": DoubleToString(tick.bid, digits)` | `is_finite && > 0 && bid <= ask` | ✓ |
| `ask` | `"ask": DoubleToString(tick.ask, digits)` | Same guard | ✓ |
| `freshness` | `"freshness": freshnessStr` | Stored as transient 300s TTL | ✓ |
| `session` | `"session": GetSessionName()` | Stored as transient 300s TTL | ✓ |
| `candle.time` | `"time": TimeToIso8601(candleTime_m1)` | `normalize_market_timestamp()` | ✓ |
| `candle.open/high/low/close` | `DoubleToString(rates_m1[0].{field}, digits)` | `(float)` cast + validate_ohlc() | ✓ |
| `candle.volume` | `IntegerToString((long)rates_m1[0].tick_volume)` | `guard_tick_volume()` | ✓ |
| `candle_m15.{fields}` | Same as candle but for PERIOD_M15 | Same guards, max_age_sec=1800 | ✓ |

---

## Fields NOT Sent by EA (But Accepted by PHP)

| Field | Status |
|-------|--------|
| `quote_time` | Not sent by EA (uses `timestamp`). PHP accepts both via `!empty()` chain |
| `spread` | Not sent by EA. PHP computes from bid/ask using per-instrument pip_size |
| `source` | Not sent by EA. PHP stores as 'mt5' hardcoded |
| `server_time` | Not sent by EA. Not stored by PHP |
| `candles[]` | REST contract format. Not sent by EA (uses legacy `candle` object). PHP shim promotes `candles[0]` → `candle` |

---

## Timestamp Parity (UTC)

| Check | MT5 EA | PHP Handler | Match |
|-------|--------|-------------|-------|
| Timestamp format | ISO 8601 via `TimeToIso8601()` (UTC-shifted by broker offset subtraction) | `strtotime()` → MySQL | ✓ |
| UTC enforcement | `TimeToIso8601()` subtracts broker offset; `TimeCurrent()` is broker-local | `gmdate()` for all server times | ✓ |
| Stale threshold | FreshnessEngine: STALE classification after 300s no-tick | PHP: 300s hard-reject → 422 | ✓ |
| M1 candle age | EA guards `candleTime_m1 >= now` (regression guard for clock fault) | PHP: age_sec > 180 → false (audit logged) | ✓ |
| M15 candle age | EA guards `candleTime_m15 >= now` | PHP: age_sec > 1800 → false | ✓ |
| Epoch guard | EA: `rates[0].time > 0` (MQL5 history not ready check) | PHP: `candle_ts < 946684800` (2000-01-01) rejected | ✓ |
| Equity session override | `TimeCurrent()` (not tick.timestamp) when NAS100/US30 off-session | `is_equity_index_off_session()` health check returns CLOSED | ✓ |

---

## Authentication Parity

| Check | MT5 EA | PHP Handler | Match |
|-------|--------|-------------|-------|
| Header name | `X-EA-API-Key: {apiKey}` in `cachedHeaders` | Reads x-ea-api-key, x_ea_api_key, x-api-key, x_api_key | ✓ |
| Timing-safe comparison | N/A (sender side) | `hash_equals()` | ✓ |
| Missing key → 401 | EA checks `StringLen(apiKeyValue) == 0` before WebRequest | PHP returns 401 `smc_sf_api_key_missing` | ✓ |
| user_id sender | All 4 bridge routes now include `"user_id": wpUserId` (or `?user_id=` for GET) | Validated, `wp_set_current_user()` | ✓ |
| Dispatch observability | `Print("[HeartBeat|AccountSync|SymbolSync|LicenseCheck] Dispatch | user_id=", wpUserId, ...)` | Auth-success log after `wp_set_current_user()` | ✓ |

---

## Signal Readiness Parity

| Check | Backend | Dashboard | Match |
|-------|---------|-----------|-------|
| Signal truth source | WordPress plugin (ensure_engine_snapshot) | Reads from /snapshot, /live-signals | ✓ |
| is_live derivation | `freshness === 'LIVE' && source === 'mt5'` | Uses backend is_live flag | ✓ |
| Stale data gate | Signal engine checks freshness state; does not run on stale | Dashboard shows backend state | ✓ |
| Chop gate | Regime chop check in engine | Displayed from backend regime data | ✓ |
| age_sec source | PHP: `now - updated_at` (server-computed) | Frontend reads age_sec from /snapshot | ✓ |
| FreshnessBadge truth | N/A (rendering only) | Reads state from backend props; unknown states default to 'stale' guard | ✓ |

---

## Fib Parity

| Surface | Status |
|---------|--------|
| Pine ↔ Backend fib calculations | PASS on audited paths (no code modified this run) |
| MT5 fib (Phase 4 target) | PENDING — Phase 4 not started |

---

## Known Drift / Open Items

| Item | Status | Notes |
|------|--------|-------|
| Phase 1 live bridge parity | PENDING | Requires 48h live terminal soak for heartbeat; account-sync, symbol-sync, license-check all need live payloads captured |
| ESLint warnings (react-hooks, react-refresh) | ACCEPTED | 9 pre-existing warnings in UI components; no parity impact |
| Full tsc --noEmit check | DEFERRED | Build passes; strict TypeScript check may reveal type-only drift |
| Weekend MT5 behavior | DEFERRED | No blocking evidence found |
| MetaEditor CLI compile verification | DEFERRED | Must be confirmed in live MT5 environment |

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| EA→backend market stream ingestion correct | PASS |
| Auth model complete and hardened | PASS |
| Stale data rejected at correct thresholds | PASS |
| Candle parity (M1, M15) with guards | PASS |
| Symbol normalization includes broker aliases | PASS |
| Equity index off-session handling correct | PASS |
| Dashboard reads backend truth only | PASS |
| Admin routes protected | PASS |
| authority-diagnostics requires WP session | PASS |
| Phase 1 bridge routes implemented | PASS — live validation PENDING |
| user_id in all EA bridge payloads | PASS (patched 2026-05-17) |
| Dispatch observability logs at EA + backend | PASS (patched 2026-05-17) |
| TypeScript build clean | PASS (patched 2026-05-17) |
| CI lint clean | PASS (LINT-001 patched 2026-05-18) |

---

## References

- Previous market stream parity audit: `.github/migration/audits/phase-0-mt5-ea-market-stream-parity-2026-05-17.md`
- Phase 1 license-check parity: `.github/migration/audits/phase-1-mt5-ea-license-check-parity-2026-05-17.md`
- Phase 1 post-init user_id parity: `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`
- Phase 1 heartbeat observability: `.github/migration/audits/phase-1-mt5-heartbeat-timer-observability-parity-2026-05-17.md`
- Phase 0 closeout: `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`
- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-18.md`
- Snapshot archive: `reports/snapshots/stabilize-ea-2026-05-18/`
