# Phase 0/4 — MT5 EA Market Stream Parity Audit

**Date**: 2026-05-26  
**Phase**: Cross-phase (covers EA market-stream contract as it applies to Phase 0 route stability + Phase 4 fib delivery)  
**Auditor**: Claude Code (stabilize-ea-2026-05-26 workflow)  
**Threshold Required**: 100% for auth/payload contracts; 99% for live parity (Phase 4 fib pending corpus)

---

## Executive Summary

- **Route Contract Parity**: PASS (100%)
- **Auth Model Parity**: PASS (100%)
- **Payload Field Parity**: PASS (100%)
- **Timestamp Handling (UTC)**: PASS (100%)
- **Stale Rejection**: PASS (300s hard reject with HTTP 422)
- **Bid/Ask Validation** (post-patch): PASS — invalid values now return HTTP 422
- **Fib Level Parity (fixture)**: PASS (100%, 288/288 tuples)
- **Fib Level Parity (live)**: PENDING — operator corpus required

---

## Route Parity

| Contract | MQL5 EA | PHP Plugin | Status |
|----------|---------|-----------|--------|
| Route | POST /ea/market-stream | register_rest_route sniper/v1, ea/market-stream | MATCH ✓ |
| Auth header | X-EA-API-Key | get_ea_api_key() checks 4 aliases | MATCH ✓ |
| Auth secret | SMC_SF_EA_API_KEY constant / env | defined('SMC_SF_EA_API_KEY') ? constant : getenv() | MATCH ✓ |
| user_id | In JSON body | ea_request_value() reads from JSON | MATCH ✓ |

---

## Payload Field Parity

| Field | MQL5 EA (MarketDataEngine.mqh) | PHP Handler | Status |
|-------|-------------------------------|------------|--------|
| symbol | normalized via SymbolNormalizer | map_symbol_aliases() + normalize | MATCH ✓ |
| normalized_symbol | optional broker alias | Accepted if present | MATCH ✓ |
| timeframe | M1, M15, H1, D1 | normalize_mt5_timeframe() | MATCH ✓ |
| source | "MT5" string | Accepted, not validated as required | MATCH ✓ |
| quote_time | ISO 8601 UTC | normalize_market_timestamp() via !empty() | MATCH ✓ |
| timestamp | Legacy alias for quote_time | Accepted as fallback | MATCH ✓ |
| bid | float (double) | (float) cast + is_finite guard | MATCH ✓ |
| ask | float (double) | (float) cast + is_finite guard | MATCH ✓ |
| spread | float (pips) | Phase 3: required; Phase 1/2: optional | MATCH ✓ |
| freshness | LIVE/DELAYED/STALE/CLOSED/DISCONNECTED | normalize_mt5_freshness_value() | MATCH ✓ |
| session | London/New York/Tokyo/Sydney/Overlap/Closed | normalize_mt5_session_value() | MATCH ✓ |
| candle | Object with time/open/high/low/close/volume | Validated with OHLC + epoch guards | MATCH ✓ |
| candles | Array (canonical contract) | candles[0] promoted to candle | MATCH ✓ |
| candle_m15 | Phase 3 M15 candle object | Validated same as M1 | MATCH ✓ |
| tick_volume | Non-negative integer | guard_tick_volume() clamps | MATCH ✓ |

---

## Timestamp Parity (UTC)

| Check | EA | Plugin | Status |
|-------|-----|--------|--------|
| All timestamps UTC | Yes (broker server time + MqlDateTime UTC) | normalize_market_timestamp() appends Z if no TZ | MATCH ✓ |
| ISO 8601 format | gmdate() MQL5 equivalent | strtotime() + gmdate('c') | MATCH ✓ |
| Staleness guard | FreshnessEngine 300s threshold | age_seconds > 300 → 422 | MATCH ✓ |

---

## Fib Level Parity (Phase 4)

| Symbol | TF | Family | Fixtures | Delta Max | Status |
|--------|----|--------|---------|-----------|--------|
| EURUSD | 15min | LTF_SF | 16 | 0.00000 | PASS ✓ |
| EURUSD | 15min | HTF_AF | 16 | 0.00000 | PASS ✓ |
| EURUSD | 1h | LTF_SF | 16 | 0.00000 | PASS ✓ |
| EURUSD | 1h | HTF_AF | 16 | 0.00000 | PASS ✓ |
| EURUSD | 1day | LTF_SF | 16 | 0.00000 | PASS ✓ |
| EURUSD | 1day | HTF_AF | 16 | 0.00000 | PASS ✓ |
| USDJPY | 15min | LTF_SF | 16 | 0.00000 | PASS ✓ |
| USDJPY | 15min | HTF_AF | 16 | 0.00000 | PASS ✓ |
| USDJPY | 1h | LTF_SF | 16 | 0.00000 | PASS ✓ |
| USDJPY | 1h | HTF_AF | 16 | 0.00000 | PASS ✓ |
| USDJPY | 1day | LTF_SF | 16 | 0.00000 | PASS ✓ |
| USDJPY | 1day | HTF_AF | 16 | 0.00000 | PASS ✓ |
| XAUUSD | 15min | LTF_SF | 16 | 0.00000 | PASS ✓ |
| XAUUSD | 15min | HTF_AF | 16 | 0.00000 | PASS ✓ |
| XAUUSD | 1h | LTF_SF | 16 | 0.00000 | PASS ✓ |
| XAUUSD | 1h | HTF_AF | 16 | 0.00000 | PASS ✓ |
| XAUUSD | 1day | LTF_SF | 16 | 0.00000 | PASS ✓ |
| XAUUSD | 1day | HTF_AF | 16 | 0.00000 | PASS ✓ |

**Parity Validator Self-Test**: 288/288 exact matches — 100% — PASS

---

## Signal Readiness Parity

| Check | Backend | Dashboard | Status |
|-------|---------|----------|--------|
| Signal truth authority | ensure_engine_snapshot() PHP | Dashboard renders, never computes | PASS ✓ |
| Freshness gate | is_live = freshness === 'LIVE' && source === 'mt5' | FreshnessBadge displays backend state | PASS ✓ |
| Stale data gate | quote_time age checked before upsert | age_sec from backend in snapshot | PASS ✓ |

---

## Known Issues

| ID | Description | Status |
|----|-------------|--------|
| BUG-001 | Invalid bid/ask returned 200 OK instead of 422 | FIXED 2026-05-26 |
| MIGRATION-P4-001 | Live MT5 corpus for fib parity validation | PENDING — operator action |

---

## Acceptance Criteria

- [x] Route contract match: EA sends to same URL plugin registers
- [x] Auth model match: X-EA-API-Key shared secret validated by hash_equals
- [x] user_id match: required at auth layer, bound via wp_set_current_user
- [x] Payload fields: all MQL5 field names match PHP handler expectations
- [x] Timestamp: UTC handled correctly end-to-end
- [x] Stale rejection: 300s threshold consistent between EA and backend
- [x] bid/ask validation: structured error on invalid values (BUG-001 patch)
- [x] Symbol alias: broker names (GOLD, US Tech 100, Wall Street 30) correctly resolved
- [x] Fib levels: 100% fixture parity (live corpus pending)
- [ ] Live MT5 parity corpus: PENDING — required for Phase 4 gate
