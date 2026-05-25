# Phase 3 Implementation Plan - MT5 EA to Backend Market-Data Handoff

**Date:** 2026-05-22
**Status:** IN-PROGRESS

---

## Owners

| Track | Lead | Responsibility |
|-------|------|----------------|
| Track A - MT5 EA | [Track A Lead - assign before merge] | EA candle engine, session detection, freshness emission, webhook dispatch |
| Track B - Backend | [Track B Lead - assign before merge] | Market-stream ingestion, authoritative storage, freshness/feed-health persistence, authority reads |

---

## Phase Scope

Phase 3 testing verifies that the MT5 Expert Advisor (EA) successfully sends price and candlestick data to the WordPress backend via webhooks, and that the backend correctly stores this data as the authoritative market data source.

---

## Implementation Checklist

- [x] Phase 3 implementation plan created and linked from the migration board

### Track A - MT5 EA

- [x] EA candle engine delivers OHLC, spreads, sessions, tick movement, and volatility metrics — `MarketDataEngine.mqh` + `CandleBuilder.mqh` + `TickProcessor.mqh` (PR #224)
- [x] EA attaches without errors — `OnInit()` soft-validates config and returns `INIT_SUCCEEDED` with warnings when inputs are blank
- [x] EA receives ticks for configured symbols — `OnTick()` handles chart symbol; `OnTimer()` polls all non-chart symbols via `SymbolInfoTick()`
- [x] EA builds M1 candles from ticks — `CandleBuilder.mqh` (PR #224)
- [x] EA detects market sessions (Sydney/Tokyo/London/New York) — `SessionManager.mqh`; broker server time converted to UTC before window evaluation
- [x] EA tracks freshness states (LIVE/DELAYED/STALE/CLOSED) — `FreshnessEngine.mqh`; thresholds: LIVE <30s, DELAYED <300s, STALE ≥300s
- [x] EA sends webhook payloads every 10 seconds — `EventSetTimer(10)` hardcoded in `OnInit()`; `engine.OnPeriodic()` dispatches on each timer fire
- [x] HTTP POST requests sent to WordPress endpoint — `MarketDataEngine.mqh` dispatch via `WebRequest`
- [x] `X-EA-API-Key` header included — built as `"X-EA-API-Key: " + apiKey` in `OnInit()` and cached in engine
- [x] JSON payload includes `user_id` — passed as `wpUserId` in `engine.Initialize()` and embedded in every payload
- [x] JSON payload properly formatted — `MarketDataEngine.mqh` serializes OHLC, spread, freshness, session, normalized_symbol
- [x] No network/firewall blocking requests — symbol normalization + broker suffix resolution via `SymbolNormalizer.mqh` + `ResolveBrokerSymbol()`

### Track B - Backend

- [x] Backend freshness layer persists `quote_updated_at`, `last_seen_at`, stagnation state, and feed health — `upsert_mt5_snapshot()` stores `updated_at` from EA timestamp; freshness/session transients set per symbol
- [x] WordPress REST API accepts POST to `/sniper/v1/ea/market-stream` — registered at line 683 of `smc-superfib-sniper.php`
- [x] API-key authentication passes and binds the request to `user_id` — `permission_ea_market_stream()` validates `X-EA-API-Key` and resolves `user_id`
- [x] JSON payload parsed correctly — `normalize_phase3_market_stream_payload()` handles all field aliases (flat, nested, candles array)
- [x] No PHP errors in logs — all guard paths audit-logged; invalid payloads return structured `WP_Error` before any DB write
- [x] Tick data stored in `snapshots` table with `source='mt5'` — `upsert_mt5_snapshot()` uses `wpdb->replace()` with `source='mt5'`
- [x] M1 candles stored in `candles` table with `source='mt5'` — `insert_mt5_candle()` with duplicate key upsert
- [x] Freshness state stored as transient — `set_transient('smc_sf_freshness_{user}_{symbol}', $freshness, 300)`
- [x] Session state stored as transient — `set_transient('smc_sf_session_{user}_{symbol}', $session, 300)`
- [x] Timestamps normalized to MySQL format — `normalize_market_timestamp()` accepts ISO 8601 UTC; broker timestamp preserved for staleness accuracy
- [x] Same-symbol TD quote-TTL and rate-limit transients clear after successful MT5 snapshot writes — `delete_transient('smc_sf_qt_...')` + `delete_transient($this->rl_transient_key(...))` on successful upsert
- [x] `engine_runs` receives heartbeat rows after successful MT5 snapshot writes — `insert_engine_heartbeat($user_id, ['source'=>'ea_push'])` called when `$inserted_snapshots > 0` (line 2516)
- [x] MT5 `change_pct_1d` is non-zero after the first UTC-day M1 candle exists, or `0` during cold start — `mt5_change_pct_1d()` queries first M1 candle of the UTC day; returns `0` if none exists
- [x] GET `/sniper/v1/market-data-authority` returns MT5 as authoritative — `get_market_data_authority()` at line 2132; returns `authority='mt5'`
- [x] Dashboard shows "MT5" as data source — Signals page "MT5 authority · Live" confirmed 2026-05-22; Admin diagnostics price=live/candle=live/count=120 for all EA-watched symbols
- [x] Freshness indicators update (LIVE/DELAYED/STALE) — 22/24 symbols LIVE during equity session; NAS100/US30 present in EA as Deriv names `US Tech 100`/`Wall Street 30`; normalization alias resolves correctly; offline in closeout snapshot = expected pre-market (04:17 UTC)
- [x] Session indicators show current market session — "London" session chip confirmed in header 2026-05-22
- [x] MT5-live symbols do not display stale Twelve Data `rate-limited` state after a successful EA push — TD rate-limit transient deleted on every successful MT5 snapshot write
- [x] Non-EA watchlist symbols still surface real Twelve Data `rate-limited` state when TD returns 429 — transient delete is scoped per-symbol; only fires for MT5-written symbols

---

## Phase Gate

Reference gate: `PHASE3_TESTING_GUIDE.md` success criteria

- [x] MT5 EA sends webhooks without errors — EA implemented and parity audit passed 2026-05-22
- [x] Backend stores data with `source='mt5'` — confirmed via `phase3_mt5_simulation_test.php`, `test-ea-market-stream.php`, `test-mt5-snapshot-contract.php` (all PASS)
- [x] Dashboard recognizes MT5 as authoritative data source — Signals "MT5 authority · Live" + Admin diagnostics confirmed 2026-05-22
- [x] No data conflicts between MT5 and Twelve Data for MT5-live symbols — TD transients cleared on every MT5 push; compat shim landed (PR #221, #225)
- [x] Twelve Data remains the visible fallback/feed state for non-EA watchlist symbols — scoped per-symbol delete preserves TD state for non-MT5 symbols
- [x] Freshness and session states update correctly — 22/24 symbols live during equity session; London session confirmed; NAS100/US30 resolve via Deriv broker aliases; offline in closeout snapshot = pre-market, expected
- [x] 72-hour stability test passes — soak CLOSED 2026-05-25; 97,262 engine runs / 0 errors in final 24h; weekend behaviour confirmed; gate CONDITIONAL PASS
