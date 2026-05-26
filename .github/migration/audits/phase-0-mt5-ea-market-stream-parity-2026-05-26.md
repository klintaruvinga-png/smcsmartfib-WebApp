# Phase 0/4 — MT5 EA Market Stream Parity Audit

**Date**: 2026-05-26  
**Phase**: Cross-phase (covers EA market-stream contract as it applies to Phase 0 route stability + Phase 4 fib delivery)  
**Auditor**: Claude Code (stabilize-ea-2026-05-26 workflow)  
**Threshold Required**: 100% for auth/payload contracts; 99% for live parity (Phase 4 fib pending corpus)
# Parity Audit Report — Phase 4 MT5 EA Market-Stream

**Report Date**: 2026-05-26  
**Phase**: Phase 4 — Fib Engine Migration  
**Auditor**: Claude Code (automated)  
**Status**: PASS (code baseline) | PENDING (live corpus)

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
- **Overall Parity**: PASS across all code-testable surfaces
- **Threshold Required**: 99% (live corpus gate)
- **Pass/Fail**: PASS (code) | PENDING (live)
- **Trend**: Stable — no regressions introduced by commit 6b4c544 (MAX_SESSIONS enum, non-functional)
- **Delta from prior audit (2026-05-25)**: Zero — one non-functional MQL5 change, 0 PHP changes, 0 TS changes

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
| Route | Method | Auth | Status |
|-------|--------|------|--------|
| `/ea/market-stream` | POST | X-EA-API-Key + user_id | PASS ✅ |
| `/ea/heartbeat` | POST | X-EA-API-Key + user_id | PASS ✅ |
| `/ea/account-sync` | POST | X-EA-API-Key + user_id | PASS ✅ |
| `/ea/symbol-sync` | POST | X-EA-API-Key + user_id | PASS ✅ |
| `/ea/license-check` | POST | X-EA-API-Key + user_id | PASS ✅ |
| `/ea/fib-levels` | POST | X-EA-API-Key + user_id | PASS ✅ |
| `/market-data/fib-levels` | GET | WP session | PASS ✅ |
| `/authority-diagnostics` | GET | WP session (401 unauth) | PASS ✅ |
| `/admin/health` | GET | manage_options | PASS ✅ |

---

## Payload Parity (MQL5 → PHP field names)

| MQL5 Field | PHP Handler Field | Match | Notes |
|-----------|------------------|-------|-------|
| `user_id` | `user_id` | ✅ | auth layer |
| `symbol` | `symbol` | ✅ | + `normalized_symbol` alias |
| `timeframe` | `timeframe` | ✅ | normalized via `normalize_mt5_timeframe()` |
| `source` | `source` | ✅ | |
| `quote_time` | `quote_time` | ✅ | alias for `timestamp` |
| `bid` | `bid` | ✅ | |
| `ask` | `ask` | ✅ | |
| `spread` | `spread` | ✅ | computed if absent |
| `freshness` | `freshness` | ✅ | normalized to LIVE\|DELAYED\|STALE\|CLOSED\|DISCONNECTED |
| `session` | `session` | ✅ | normalized to Sydney\|Tokyo\|London\|New York\|Overlap\|Closed |
| `candles[0]` | `candle` | ✅ | shim: candles[0] promoted when candle absent |
| `candle_m15` | `candle_m15` | ✅ | M15 candle |
| `tick_volume` | `tick_volume` → `volume` | ✅ | remapped in candles[] shim |
| `schema_version` | `schema_version` | ✅ | Phase 2 telemetry gate |

---

## Timestamp Parity (UTC handling)

| Surface | UTC | Notes | Status |
|---------|-----|-------|--------|
| MQL5 EA `TimeGMT()` | Yes | `brokerUtcOffset = TimeCurrent() - TimeGMT()` in FibEngine | PASS ✅ |
| PHP `normalize_market_timestamp()` | Yes | Appends `Z` when no TZ suffix; handles MQL5 dot-format | PASS ✅ |
| PHP `iso_age_sec()` | Yes | Handles UTC/GMT aliases; non-UTC TZ preserved for PHP conversion | PASS ✅ |
| DB storage | Yes | `gmdate('Y-m-d H:i:s')` throughout | PASS ✅ |
| API response | Yes | `gmdate('c')` throughout | PASS ✅ |

---

## Fib Parity (Phase 4)

| Surface | Status | Evidence |
|---------|--------|----------|
| 16-ratio set (MQL5 vs PHP) | PASS ✅ | Ratios: -200,-162.5,-100,-62.5,-25,0,25,50,62.5,75,100,125,162.5,200,262.5,300 — identical in FibEngine.mqh and PHP |
| Session grouping logic | PASS ✅ | Both use UTC; PHP `resolve_session_anchors()` test suite passes |
| HTF authority anchor | PASS ✅ | `resolve_htf_authority_anchor()` test suite passes |
| Ingestion contract (32 levels/TF/family) | PASS ✅ | `test-fib-ingestion.php` 7/7 pass |
| Parity validator self-test | PASS ✅ | `scripts/parity-validator.php` 288/288 (100%) |
| Live corpus parity | PENDING ⏳ | Requires 30-day MT5 live data accumulation |

---

## Signal-Readiness Parity

| Component | Status | Notes |
|-----------|--------|-------|
| Engine skips non-MT5 sources | PASS ✅ | `price_source !== 'mt5'` guard |
| Engine skips non-live state | PASS ✅ | `price_state !== 'live'` guard |
| Engine skips stale by age | PASS ✅ | `price_age > engine_stale_threshold_sec` guard |
| Candle freshness gate | PASS ✅ | `candle_age_sec <= 7200` gate |
| Backend as source of truth | PASS ✅ | Frontend reads `state` and `age_sec` from API |
| No fake-live from fetch time | PASS ✅ | `age_sec` derived from `updated_at` (= `quote_time`) |

---

## Chop and Regime Parity

| Component | Status |
|-----------|--------|
| Regime blocked for stale/non-mt5 | PASS ✅ |
| Chop = 1 when price guard fails | PASS ✅ |
| Gate = BLOCKED when price guard fails | PASS ✅ |

---

## Symbol Normalization Parity

| Alias | PHP map_symbol_aliases | MQL5 SymbolNormalizer | Status |
|-------|----------------------|----------------------|--------|
| GOLD → XAUUSD | ✅ | ✅ | PASS |
| SILVER → XAGUSD | ✅ | ✅ | PASS |
| NASDAQ/NASDAQ100/USTECH100 → NAS100 | ✅ | ✅ | PASS |
| WALLSTREET/WALLSTREET30/DOW30/DJ30 → US30 | ✅ | ✅ | PASS |
| SPX/US500 → SPX500 | — | ✅ | MQL5 only; PHP handles if needed |
| GER40/GERMANY40 → GER40 | — | ✅ | MQL5 only |
| Broker suffixes (.PRO, .ECN, .MICRO, .STP, .RAW) | — | ✅ | MQL5 stripping |

---

## Known Drift (Acceptable)

| Surface | Drift | Accepted |
|---------|-------|---------|
| `get_session()` endpoint killzone windows (London 07-11, NY 12-16) vs MT5 `SessionManager.mqh` full sessions (London 07-15, NY 12-20) | Display-only divergence | YES — documented in plugin comment |
| Multi-candle batch (candles[] > 1) | Only candles[0] stored | YES — deferred, current EA sends 1 at a time |
| Live fib parity | Pending (fixture baseline = 100%) | YES — gate cannot close until live corpus captured |

---

## Known Blockers

| Blocker | Impact | Resolution |
|---------|--------|-----------|
| Phase 4 live corpus pending | Phase 4 gate cannot advance | Operator: deploy EA, wait 30 days, capture Pine snapshots, run parity validator |
| T0 admin baseline pending | Phase 3 RISK-06 blocker not cleared | Operator: /admin → Soak Workspace → create PHASE_4_IMPLEMENTATION_START baseline |

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
| Criterion | Status |
|-----------|--------|
| All PHP test suites pass (15/15) | ✅ PASS |
| PHP syntax clean | ✅ PASS |
| MQL5 include verification | ✅ PASS |
| EA auth all error cases correct | ✅ PASS |
| Payload validation complete | ✅ PASS |
| Stale data rejection at 300s | ✅ PASS |
| Signal engine guards correct | ✅ PASS |
| Backend is source of truth | ✅ PASS |
| Live corpus parity ≥99% | ⏳ PENDING |

---

## Evidence References

- `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` — 14/14 pass
- `wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` — 7/7 pass
- `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` — pass
- `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` — pass
- `scripts/parity-validator.php` — 288/288 self-test (100%)
- `reports/snapshots/stabilize-ea-2026-05-26/FINDINGS-20260526T000100Z.json`
- `reports/snapshots/stabilize-ea-2026-05-26/FINAL-20260526T000300Z.json`
