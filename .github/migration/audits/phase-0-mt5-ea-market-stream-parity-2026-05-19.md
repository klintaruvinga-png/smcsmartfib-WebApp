# Phase 0 — MT5 EA Market Stream Parity Audit

**Date:** 2026-05-19  
**Workflow ID:** stabilize-ea-2026-05-19  
**Phase Context:** Phase 1 IN-PROGRESS (90%); Phase 0 COMPLETE  
**Auditor:** Claude Code Stabilization Agent  
**Reference template:** `.github/migration/audits/PARITY_REPORT_TEMPLATE.md`

---

## Scope

Full parity audit of the MT5 EA market-stream ingestion path against the PHP plugin handler,
and the PHP handler output against dashboard rendering, for the `POST /ea/market-stream` route.

---

## 1. Route Parity

| Item | EA (MQL5 Sender) | PHP Handler | Parity |
|---|---|---|---|
| HTTP Method | `WebRequest(…)` POST | `WP_REST_Server::CREATABLE` | MATCH |
| URL | `WebhookURL` input = `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` | Registered as `sniper/v1/ea/market-stream` | MATCH |
| Auth Header | `X-EA-API-Key: {ApiKey}` in `cachedHeaders` | `get_ea_api_key()` checks `x-ea-api-key` (priority) and 3 aliases | MATCH |
| Content-Type | `Content-Type: application/json\r\n` in `cachedHeaders` | `get_json_params()` used | MATCH |

---

## 2. Payload Parity (MQL5 Field Names vs PHP Handler Field Names)

| EA Sends (MQL5) | PHP Reads | Notes | Parity |
|---|---|---|---|
| `user_id` | `ea_request_value($request, $payload, 'user_id', 0)` | Required at permission callback layer | MATCH |
| `symbol` | `$payload['symbol']` | Raw broker symbol; overridden by `normalized_symbol` if present | MATCH |
| `normalized_symbol` | `$payload['normalized_symbol']` | Optional; takes precedence over `symbol` | MATCH |
| `timeframe` (always "M1") | `$payload['timeframe'] ?? 'M15'` | Mapped via `normalize_mt5_timeframe()` | MATCH |
| `timestamp` (ISO 8601) | `!empty($payload['quote_time']) ? ... : $payload['timestamp']` | Legacy alias; `quote_time` takes precedence | MATCH (compat) |
| `bid` | `(float) $payload['bid']` | Validated finite, > 0 | MATCH |
| `ask` | `(float) $payload['ask']` | Validated finite, > 0, ask >= bid | MATCH |
| `freshness` | `$payload['freshness']` | LIVE/STALE/CLOSED/DISCONNECTED → snapshot_state via `mt5_freshness_to_snapshot_state()` | MATCH |
| `session` | `$payload['session']` | Session name string | MATCH |
| `candle.time` | `$candle['time']` | ISO 8601; epoch guard + future-candle guard | MATCH |
| `candle.open` | `(float) $candle['open']` | OHLC validated | MATCH |
| `candle.high` | `(float) $candle['high']` | high >= max(open,close) | MATCH |
| `candle.low` | `(float) $candle['low']` | low <= min(open,close) | MATCH |
| `candle.close` | `(float) $candle['close']` | OHLC validated | MATCH |
| `candle.volume` | `$candle['volume'] ?? 0` via `guard_tick_volume()` | MQL5: `(long)rates_m1[0].tick_volume`; clamped, non-negative | MATCH |
| `candle_m15.*` | Same as `candle.*` but with 1800s age gate | M15 closed bar | MATCH |

**Canonical REST contract note:** The canonical `candles` array format (with `tick_volume`) is
supported via a compat layer at line 1875 (`payload['candle']` populated from `candles[0]` if
`candle` absent). The EA uses the `candle` object format directly.

---

## 3. Timestamp Parity (UTC Handling)

| Aspect | EA (MQL5) | PHP | Parity |
|---|---|---|---|
| Tick timestamp source | `tick.timestamp` (broker datetime, UTC) | `strtotime($timestamp_raw)` | MATCH |
| ISO 8601 conversion | `TimeToIso8601(pushTime)` — subtracts broker offset | PHP `strtotime()` parses any valid ISO 8601 | MATCH |
| Equity index off-session timestamp | `TimeCurrent()` (broker-local, adjusted to UTC) | Accepted as fresh (no >300s reject for CLOSED freshness wall-clock times) | MATCH |
| Candle timestamp | `TimeToIso8601(candleTime_m1)` | `strtotime($candle['time'])` + epoch guard | MATCH |
| Server time | PHP uses `time()` for staleness comparison | EA uses broker clock | Clock drift risk: broker clock vs WP server clock could differ by seconds; 300s threshold provides adequate headroom |

---

## 4. Freshness Parity

| EA Freshness State | PHP Snapshot State | Effect |
|---|---|---|
| `LIVE` | `live` | Price marked live; signal engine can run |
| `DELAYED` or `STALE` | `stale` | Price aged; signal engine gated |
| `CLOSED` | `offline` | Session closed; signal engine gated |
| `DISCONNECTED` | `offline` | No data; signal engine gated |

**Equity index session override (NAS100/US30):**
- EA: `IsEquitySessionOpen()` check → if closed, sends `freshness=CLOSED` + `timestamp=TimeCurrent()`
- PHP: `mt5_freshness_to_snapshot_state('CLOSED')` = `'offline'`; `is_live` = false
- Dashboard: session-closed symbols excluded from `$feed_has_stale_symbols` count
- **MATCH** — no false-live state for equity index symbols during off-session

---

## 5. Fib Parity

| Component | Status |
|---|---|
| MT5 Fib Engine | NOT-STARTED (Phase 4) |
| Pine Fib vs Backend | PASS on audited paths (Phase 0 parity audit 2026-05-14) |
| Backend Fib vs Dashboard | PASS |

No fib parity drift detected in current Phase 1 scope.

---

## 6. Signal-Readiness Parity

| Gate | Backend | Dashboard | Parity |
|---|---|---|---|
| Freshness check | `is_live` from `persisted_snapshot_state === 'live'` | Reads `is_live` from `/snapshot` response | MATCH |
| Stale data block | `age_sec >= staleThresholdSec` | Reads `age_sec` from `/snapshot` | MATCH |
| Candle history gate | `INSUFFICIENT_CANDLE_HISTORY` if < 30 M15 bars | Reads `verdict` from `/snapshot` | MATCH |
| Chop gate | Backend engine classifies chop | Dashboard renders backend verdict | MATCH |
| Regime gating | Backend `is_choppy` | Dashboard reads regime state | MATCH |

Signal engine truth lives in WordPress plugin. Dashboard only renders. **MATCH.**

---

## 7. Known Blockers and Drift

| Blocker | Status | Notes |
|---|---|---|
| BUG-EA-001 — `HeartbeatIntervalTicks` undeclared | FIXED (this workflow) | EA compilation restored |
| Phase 1 48h continuity window | OPEN | Sole remaining Phase 1 gate item |
| MT5 Fib Engine parity | PENDING | Phase 4 scope |
| MT5 Regime Engine parity | PENDING | Phase 5 scope |
| MT5 Signal Engine parity | PENDING | Phase 6 scope |

---

## 8. Acceptance Criteria

| Criterion | Status |
|---|---|
| EA compiles without errors | PASS (BUG-EA-001 fixed) |
| Auth rejects missing token with 401 | PASS |
| Auth rejects invalid token with 403 | PASS |
| Auth rejects missing user_id with 400 | PASS |
| Stale data rejected at >300s with 422 | PASS |
| Stale warning logged at 120–300s | PASS |
| OHLC validation enforced | PASS |
| Epoch guard enforced | PASS |
| M1 candle age gate (180s) enforced | PASS |
| M15 candle age gate (1800s) enforced | PASS |
| tick_volume guard active | PASS |
| Symbol normalization correct | PASS |
| Equity index off-session handled | PASS |
| Backend remains source of signal truth | PASS |
| Dashboard does not fake live state | PASS |

---

## 9. Auditor Notes

The EA MQL5 payload uses the legacy `timestamp` and `candle` (singular object) format, while
the canonical REST contract specification uses `quote_time` and `candles` (array with
`tick_volume`). Both formats are supported via the compat layer in `post_ea_market_stream()`.
The compat layer has been in place since the May 2026 hardening sessions and has been
verified working through live Phase 1 validation evidence.

The `HeartbeatIntervalTicks` input gap (BUG-EA-001) was likely introduced when the heartbeat
cadence was changed from 48 ticks to 6 ticks in PR #197 (commit 1450998). The fix in PR #199
(commit f2f9886) gated the debug log behind `DebugLog` but did not re-add the input
declaration. This workflow restores it.
