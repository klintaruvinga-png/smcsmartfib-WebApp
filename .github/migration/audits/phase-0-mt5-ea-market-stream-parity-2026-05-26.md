# Parity Audit Report — Phase 4 MT5 EA Market-Stream

**Report Date**: 2026-05-26  
**Phase**: Phase 4 — Fib Engine Migration  
**Auditor**: Claude Code (automated)  
**Status**: PASS (code baseline) | PENDING (live corpus)

---

## Executive Summary

- **Overall Parity**: PASS across all code-testable surfaces
- **Threshold Required**: 99% (live corpus gate)
- **Pass/Fail**: PASS (code) | PENDING (live)
- **Trend**: Stable — no regressions introduced by commit 6b4c544 (MAX_SESSIONS enum, non-functional)
- **Delta from prior audit (2026-05-25)**: Zero — one non-functional MQL5 change, 0 PHP changes, 0 TS changes

---

## Route Parity

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
