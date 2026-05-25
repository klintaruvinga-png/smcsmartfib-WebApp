# Parity Audit — MT5 EA Market Stream — 2026-05-24

**Report date**: 2026-05-24  
**Phase**: Phase 3 — MT5 Market Data Engine (72h soak in progress)  
**Status**: PASS  
**Overall parity**: 100% across all sampled regression suites  
**Threshold required**: 95%  

---

## Executive Summary

Full stabilization audit of the EA market-stream ingest path, authentication model, payload contract, freshness/stale-data guards, signal engine wiring, and dashboard rendering truth. All 14 EA market-stream regression tests pass. No parity drift detected in Fib, session anchor, watchlist, or signal authority paths.

---

## Route Parity

| Route | Method | Expected Auth | Actual Auth | Parity |
|-------|--------|--------------|-------------|--------|
| `/sniper/v1/ea/market-stream` | POST | X-EA-API-Key shared secret | `permission_ea_market_stream` → `permission_ea_bridge` | PASS |
| `/sniper/v1/authority-diagnostics` | GET | WP session (permission_user) | `permission_user` — 401 for unauth | PASS |
| `/sniper/v1/admin/health` | GET | manage_options | `permission_admin` | PASS |
| All `/sniper/v1/user/*` routes | GET/POST | WP session | `permission_user` | PASS |

No duplicate routes. No public exposure of protected endpoints.

---

## Payload Parity — MQL5 Field Names vs PHP Handler Field Names

| MQL5 Field | PHP Handler Field | Mapping | Status |
|-----------|------------------|---------|--------|
| `user_id` | `user_id` | Direct | PASS |
| `symbol` | `symbol` | Direct + normalize via `map_symbol_aliases()` | PASS |
| `normalized_symbol` | `normalized_symbol` | Override symbol if present | PASS |
| `timeframe` | `timeframe` | Normalized via `normalize_mt5_timeframe()` | PASS |
| `timestamp` | `timestamp` | Legacy field; still accepted | PASS |
| `quote_time` | `quote_time` | Canonical alias; takes precedence over `timestamp` | PASS |
| `server_time` | `server_time` | Stored for diagnostics | PASS |
| `bid` | `bid` | Direct; is_finite() + >0 guard | PASS |
| `ask` | `ask` | Direct; is_finite() + >0 guard; bid <= ask | PASS |
| `spread` | `spread` | Direct | PASS |
| `freshness` | `freshness` | Normalized via `normalize_mt5_freshness_value()` | PASS |
| `session` | `session` | Normalized via `normalize_mt5_session_value()` | PASS |
| `candle` | `candle` | Legacy single-object form | PASS |
| `candles[]` | `candles` | Array form; candles[0] promoted to candle object; tick_volume → volume | PASS |
| `candle.time` | `candle['time']` | ISO 8601; epoch/pre-2000 rejected; >180s stale rejected | PASS |
| `candle.open` | `candle['open']` | Finite float | PASS |
| `candle.high` | `candle['high']` | Finite float; high >= max(open,close) | PASS |
| `candle.low` | `candle['low']` | Finite float; low <= min(open,close) | PASS |
| `candle.close` | `candle['close']` | Finite float | PASS |
| `candle.tick_volume` | `candle['volume']` | Mapped; clamped to max(0, int) | PASS |
| `candle_m15` | `candle_m15` | M15 candle; same OHLC/time rules | PASS |
| `schema_version` | `schema_version` | Required for Phase 2 trade telemetry batches | PASS |

---

## Timestamp Parity — UTC Handling

| Path | MQL5 | PHP | Parity |
|------|-------|-----|--------|
| Candle time | `TimeToString(rates[i].time, TIME_DATE|TIME_MINUTES|TIME_SECONDS)` converted to ISO UTC | `normalize_market_timestamp()` parses ISO 8601 UTC | PASS |
| Quote time | UTC ISO 8601 string | `normalize_market_timestamp()` → `strtotime()` → stored as MySQL UTC | PASS |
| Server time | UTC ISO 8601 string | Stored for diagnostics | PASS |
| Staleness check | EA sends current broker time | PHP computes `time() - strtotime(quote_time)` in server UTC | PASS |

---

## Fib Parity

| Metric | Result |
|--------|--------|
| Fib anchor (F1/F2/F3) computation | PASS — test-fib-parity.php |
| Composite anchor (weighted average) | PASS |
| HTF anchor (higher timeframe authority) | PASS — test-htf-authority-anchor.php |
| Session anchor parity | PASS — test-session-anchors.php |
| SuperFIB weighting | PASS — test-superfib-weighting.php |

No drift between PHP backend fib calculations and expected parity values.

---

## Signal Readiness Parity

| Gate | Status |
|------|--------|
| Stale-quote block | PASS — backend rejects signals when quote age > staleThresholdSec |
| Stale candle block | PASS — insert_mt5_candle() rejects candles >180s old |
| Candle history requirement | PASS — candle count gate enforced before signal eligibility |
| False-LIVE detection | PASS — TD rate-limit transients cleared on every MT5 push; freshness gated by broker timestamp age |
| Dashboard live state | PASS — FreshnessBadge reads backend state only; no local derivation |
| Verdict truth | PASS — VerdictBadge renders backend verdict only |

---

## Symbol Normalization

| Alias | Resolves To | Mechanism | Status |
|-------|------------|-----------|--------|
| GOLD | XAUUSD | PHP `map_symbol_aliases()` + SymbolNormalizer.mqh | PASS |
| SILVER | XAGUSD | PHP `map_symbol_aliases()` | PASS |
| WALLSTREET | US30 | PHP `map_symbol_aliases()` | PASS |
| USTECH100 | NAS100 | PHP `map_symbol_aliases()` | PASS |
| Broker suffixes (e.g. EURUSDm) | EURUSD | SymbolNormalizer.mqh `ResolveBrokerSymbol()` | PASS |

---

## Known Blockers

| ID | Phase | Description | Status |
|----|-------|-------------|--------|
| MIGRATION-P3-001 | Phase 3 | 72h stability soak window open since 2026-05-22 | RESOLVED — soak CLOSED 2026-05-25; gate CONDITIONAL PASS |
| MIGRATION-P3-002 | Phase 3 | ~~NAS100/US30 not in EA Symbols input~~ — **RESOLVED 2026-05-25**: NAS100/US30 ARE in EA as Deriv broker names `US Tech 100`/`Wall Street 30`; normalization alias resolves correctly; offline in closeout snapshot = expected pre-market (04:17 UTC) | RESOLVED |

---

## Acceptance Criteria

- [x] EA auth model confirmed correct (X-EA-API-Key, hash_equals, user_id binding)
- [x] EA payload field names match PHP handler field names
- [x] Timestamp handling UTC-correct in both MQL5 and PHP
- [x] Fib/session anchor parity green
- [x] Signal readiness parity confirmed on sampled paths
- [x] Symbol normalization covers all known broker aliases
- [x] Stale-data rejection functional (422 for >300s; warn at 120–300s)
- [x] Dashboard does not inject live state locally
- [x] authority-diagnostics remains 401 for unauthenticated requests
- [ ] Dedicated regime replay parity suite (gap from 2026-05-23 audit — deferred to Phase 4)
- [ ] Dedicated signal replay parity suite (gap from 2026-05-23 audit — deferred to Phase 4)

---

## Regression Test Results

| Test | Scope | Result |
|------|-------|--------|
| test-ea-market-stream.php | 14 scenarios: auth, payload, staleness, OHLC, aliases | 14/14 PASS |
| test-fib-parity.php | Fib anchor calculation | PASS |
| test-session-anchors.php | Session anchor derivation | PASS |
| test-htf-authority-anchor.php | HTF anchor authority | PASS |
| test-mt5-snapshot-contract.php | MT5 timestamp and source storage | PASS |
| test-watchlist-snapshot-regression.php | Watchlist-driven cache invalidation | PASS |
| test-market-data-service-source-filter.php | Source authority routing | PASS |
| test-superfib-weighting.php | SuperFIB composite weighting | PASS |
| test-cors-regression.php | CORS header contract | PASS |

---

## Migration Readiness

- Phase 3 code is correct and all parity tests pass.
- 72h soak window is the only remaining gate for Phase 3 completion.
- Phase 4 (Fib Engine Migration) can begin planning immediately; gate requires Phase 3 soak completion.
- Regime/signal replay suites are the most important coverage gap to address in Phase 4 prep.
