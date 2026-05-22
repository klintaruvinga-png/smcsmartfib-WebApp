# Phase 3 Implementation Plan - MT5 EA to Backend Market-Data Handoff

**Date:** 2026-05-22
**Status:** NOT-STARTED

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

### Track A - MT5 EA

- [ ] EA candle engine delivers OHLC, spreads, sessions, tick movement, and volatility metrics
- [ ] EA attaches without errors
- [ ] EA receives ticks for configured symbols
- [ ] EA builds M1 candles from ticks
- [ ] EA detects market sessions (Sydney/Tokyo/London/New York)
- [ ] EA tracks freshness states (LIVE/DELAYED/STALE/CLOSED)
- [ ] EA sends webhook payloads every 10 seconds
- [ ] HTTP POST requests sent to WordPress endpoint
- [ ] `X-API-KEY` header included
- [ ] JSON payload includes `user_id`
- [ ] JSON payload properly formatted
- [ ] No network/firewall blocking requests

### Track B - Backend

- [ ] Backend freshness layer persists `quote_updated_at`, `last_seen_at`, stagnation state, and feed health
- [ ] WordPress REST API accepts POST to `/sniper/v1/ea/market-stream`
- [ ] API-key authentication passes and binds the request to `user_id`
- [ ] JSON payload parsed correctly
- [ ] No PHP errors in logs
- [ ] Tick data stored in `snapshots` table with `source='mt5'`
- [ ] M1 candles stored in `candles` table with `source='mt5'`
- [ ] Freshness state stored as transient
- [ ] Session state stored as transient
- [ ] Timestamps normalized to MySQL format
- [ ] Same-symbol TD quote-TTL and rate-limit transients clear after successful MT5 snapshot writes
- [ ] `engine_runs` receives heartbeat rows after successful MT5 snapshot writes
- [ ] MT5 `change_pct_1d` is non-zero after the first UTC-day M1 candle exists, or `0` during cold start
- [ ] GET `/sniper/v1/market-data-authority` returns MT5 as authoritative
- [ ] Dashboard shows "MT5" as data source
- [ ] Freshness indicators update (LIVE/DELAYED/STALE)
- [ ] Session indicators show current market session
- [ ] MT5-live symbols do not display stale Twelve Data `rate-limited` state after a successful EA push
- [ ] Non-EA watchlist symbols still surface real Twelve Data `rate-limited` state when TD returns 429

---

## Phase Gate

Reference gate: `PHASE3_TESTING_GUIDE.md` success criteria

- [ ] MT5 EA sends webhooks without errors
- [ ] Backend stores data with `source='mt5'`
- [ ] Dashboard recognizes MT5 as authoritative data source
- [ ] No data conflicts between MT5 and Twelve Data for MT5-live symbols
- [ ] Twelve Data remains the visible fallback/feed state for non-EA watchlist symbols
- [ ] Freshness and session states update correctly
- [ ] 72-hour stability test passes (no frozen quotes, proper session handling)
