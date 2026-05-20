# Phase 0 / Phase 1 — MT5 EA Market Stream Parity Audit

**Date:** 2026-05-20  
**Workflow ID:** stabilize-ea-2026-05-20  
**Phase Context:** Phase 1 COMPLETE; Phase 2 PLANNING-IN-PROGRESS  
**Auditor:** Claude Code Stabilization Agent  
**Reference template:** `.github/migration/audits/PARITY_REPORT_TEMPLATE.md`

---

## Scope

Full parity audit of the MT5 EA market-stream ingestion path against the PHP plugin handler,
and the PHP handler output against dashboard rendering, for the `POST /ea/market-stream` route.
This audit also confirms all Phase 1 bridge routes and validates the system is ready for Phase 2.

---

## 1. Route Parity

| Item | EA (MQL5 Sender) | PHP Handler | Parity |
|---|---|---|---|
| HTTP Method | `WebRequest(…)` POST | `WP_REST_Server::CREATABLE` | ✅ MATCH |
| URL | `WebhookURL` input = `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` | Registered as `sniper/v1/ea/market-stream` | ✅ MATCH |
| Auth Header | `X-EA-API-Key: {ApiKey}` in `cachedHeaders` | `get_ea_api_key()` checks `x-ea-api-key` (priority) and 3 aliases | ✅ MATCH |
| Content-Type | `Content-Type: application/json\r\n` in `cachedHeaders` | `get_json_params()` used | ✅ MATCH |

---

## 2. Payload Parity (MQL5 Field Names vs PHP Handler Field Names)

| EA Sends (MQL5) | PHP Reads | Notes | Parity |
|---|---|---|---|
| `user_id` | `ea_request_value($request, $payload, 'user_id', 0)` | Required at permission callback layer | ✅ MATCH |
| `symbol` | `$payload['symbol']` | Raw broker symbol; overridden by `normalized_symbol` if present | ✅ MATCH |
| `normalized_symbol` | `$payload['normalized_symbol']` | Optional; takes precedence over `symbol` | ✅ MATCH |
| `timeframe` (always "M1") | `$payload['timeframe'] ?? 'M15'` | Mapped via `normalize_mt5_timeframe()` | ✅ MATCH |
| `timestamp` (ISO 8601) | `!empty($payload['quote_time']) ? ... : $payload['timestamp']` | Legacy alias; `quote_time` takes precedence | ✅ MATCH (compat) |
| `bid` | `(float) $payload['bid']` | Validated finite, >0 | ✅ MATCH |
| `ask` | `(float) $payload['ask']` | Validated finite, >0, ask≥bid | ✅ MATCH |
| `freshness` | `$payload['freshness']` | LIVE/STALE/CLOSED/DISCONNECTED → snapshot_state | ✅ MATCH |
| `session` | `$payload['session']` | Session name string | ✅ MATCH |
| `candle.time` | `$candle['time']` | ISO 8601; epoch guard + future-candle guard | ✅ MATCH |
| `candle.open/high/low/close` | `(float) $candle[…]` | OHLC validated (high≥max(O,C), low≤min(O,C)) | ✅ MATCH |
| `candle.volume` | `$candle['volume'] ?? 0` via `guard_tick_volume()` | MQL5: `(long)rates_m1[0].tick_volume`; clamped non-negative | ✅ MATCH |
| `candle_m15.*` | Same as `candle.*` but with 1800s age gate | M15 closed bar (natural age ~15-30 min) | ✅ MATCH |
| `candles[0]` (canonical array) | Compat layer at line 1875: promoted to `candle` | `tick_volume` mapped to `volume` | ✅ MATCH (compat) |

---

## 3. Timestamp Parity (UTC Handling)

| Aspect | EA (MQL5) | PHP | Parity |
|---|---|---|---|
| Tick timestamp source | `tick.timestamp` (broker datetime, UTC via `TimeToIso8601`) | `strtotime($timestamp_raw)` | ✅ MATCH |
| ISO 8601 conversion | `TimeToIso8601(pushTime)` — subtracts broker timezone offset | PHP `strtotime()` parses any valid ISO 8601 | ✅ MATCH |
| Missing timezone marker | EA always provides `Z` suffix | PHP `normalize_market_timestamp()` appends `Z` if no marker | ✅ MATCH |
| Equity index off-session timestamp | `TimeCurrent()` (broker-local, adjusted to UTC) | Accepted; not rejected by >300s guard (CLOSED freshness) | ✅ MATCH |
| Candle timestamp | `TimeToIso8601(candleTime_m1)` | `strtotime($candle['time'])` + epoch guard (>2000-01-01) | ✅ MATCH |
| Server time for age comparison | PHP uses `time()` | EA uses broker clock | ⚠️ DRIFT RISK: 300s threshold provides adequate headroom for typical broker/server clock drift (<30s) |
| Broker stored timestamp | `updated_at` = broker timestamp (not server receive time) | Preserves true age in `age_sec` calculations | ✅ CORRECT |

---

## 4. Authentication Parity

| Gate | EA Behavior | PHP Behavior | Parity |
|---|---|---|---|
| API key header | Sends `X-EA-API-Key: {ApiKey}` | `get_ea_api_key()` reads `x-ea-api-key` first, then aliases | ✅ MATCH |
| Missing key | N/A (EA always sends key) | Returns 401 `smc_sf_api_key_missing` | ✅ CORRECT |
| Wrong key | N/A | Returns 403 `smc_sf_api_key_invalid` via `hash_equals()` | ✅ CORRECT |
| user_id | Always includes `"user_id": {UserId}` in payload | Validated in `permission_ea_bridge` before handler runs | ✅ MATCH |
| Missing user_id | EA always sends | Returns 400 `smc_sf_user_required` | ✅ CORRECT |
| wp context binding | N/A | `wp_set_current_user($ea_user_id)` before `return true` | ✅ CORRECT |

---

## 5. Freshness Parity

| EA Freshness State | PHP Snapshot State | Effect on Signal Engine |
|---|---|---|
| `LIVE` | `live` | Signal engine can run |
| `DELAYED` or `STALE` | `stale` | Signal engine gated |
| `CLOSED` | `offline` | Signal engine gated |
| `DISCONNECTED` | `offline` | Signal engine gated |

**Equity index session override (NAS100, US30):**
- EA: `IsEquitySessionOpen()` check → sends `freshness=CLOSED` + current timestamp during off-hours
- PHP: `mt5_freshness_to_snapshot_state('CLOSED')` = `'offline'`; `is_live` = false
- Dashboard: off-session equity symbols excluded from `$feed_has_stale_symbols` count
- Parity: ✅ MATCH — confirmed LIVE at 16:37 UTC 2026-05-15 during active US equity session

---

## 6. Fib / Signal / Regime Parity

| Component | Status | Notes |
|---|---|---|
| Fib anchor and level calculations | PASS (Phase 0 audit) | No drift in audited paths |
| Regime classification | PASS (Phase 0 audit) | AUDUSD/ETHUSD chop-gate classified as correct behavior |
| Chop logic | PASS (Phase 0 audit) | Chop correctly gates signal generation |
| Signal readiness | PASS | Freshness + candle count gates enforced server-side |
| Entry/SL/TP derivation | PASS (Phase 0 audit) | No drift |
| Backend vs dashboard | PASS | Dashboard reads from backend snapshot, no local override |

---

## 7. Phase 1 Bridge Route Parity

| Route | EA Sends | PHP Handles | Status |
|---|---|---|---|
| `POST /ea/heartbeat` | heartbeat every ~8 min | `post_ea_heartbeat()` — inserts engine_run row, logs | ✅ PASS (48h+ confirmed) |
| `POST /ea/account-sync` | account metadata | `post_ea_account_sync()` — upserts account_snapshots | ✅ PASS |
| `POST /ea/symbol-sync` | broker symbol list | `post_ea_symbol_sync()` — upserts symbol_sync table | ✅ PASS (27 symbols) |
| `GET  /ea/license-check` | account_id + terminal_id | `get_ea_license_check()` — license status lookup | ✅ PASS (hard gate) |

---

## 8. Known Parity Divergences (Non-Blocking)

| ID | Location | Description | Blocking? |
|---|---|---|---|
| D-001 | `get_session()` | Session endpoint returns SMC killzone windows (London 07-11, NY 12-16 UTC) for display. MT5 SessionManager.mqh uses full market sessions (London 07-15, NY 12-20). | NO — display-only divergence |
| D-002 | Clock drift | PHP `time()` vs broker clock can differ by seconds. 300s staleness threshold provides adequate headroom. | NO — within tolerance |

---

## 9. Acceptance Criteria

- [x] EA market-stream route exists and is registered correctly
- [x] Auth: X-EA-API-Key shared secret validated via hash_equals()
- [x] Auth: All 4 header alias variants accepted
- [x] Auth: Missing/invalid/unconfigured key rejected with correct HTTP codes
- [x] Auth: Missing/invalid user_id rejected with correct HTTP codes
- [x] Auth: wp_set_current_user() called on success
- [x] Payload: bid/ask validated finite, positive, bid≤ask
- [x] Payload: OHLC consistency guard
- [x] Payload: Epoch guard on candle timestamps
- [x] Payload: Future-candle rejection
- [x] Payload: Staleness threshold 300s (422), warn 120-300s
- [x] Payload: Tick volume guard
- [x] Payload: Symbol normalization (broker aliases)
- [x] Payload: Both candle formats (object + canonical array) accepted
- [x] Freshness: LIVE/STALE/CLOSED/DISCONNECTED correctly mapped to snapshot state
- [x] Freshness: Equity index off-session excluded from stale count
- [x] Timestamps: Broker timestamp preserved as updated_at (not replaced with server time)
- [x] Phase 1 bridge routes: All 5 confirmed operational (2026-05-18/2026-05-20)
- [x] 48h heartbeat continuity: PASS (2026-05-20)

---

## 10. Phase 2 Readiness Assessment

Phase 2 (Read-Only Trade Telemetry) requires:
- Track A: EA telemetry for open positions, pending orders, account metrics, trade history
- Track B: Backend APIs to ingest and serve telemetry data
- Track C: Dashboard panels for account card, live positions, floating P/L

**Blockers for Phase 2 start**: Track A / Track B telemetry contract sign-off pending.  
**Infrastructure foundation from Phase 1**: `post_ea_account_sync()` and `post_ea_symbol_sync()` provide the account and symbol data model that Phase 2 will extend.  
**Recommended**: Draft `PHASE2_IMPLEMENTATION.md` with Track A/B contract terms before sign-off meeting.
