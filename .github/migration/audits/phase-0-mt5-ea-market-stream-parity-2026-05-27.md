# Parity Audit Report — Phase 0 / EA Market Stream

**Report Date**: 2026-05-27  
**Phase**: Phase 0 stabilization (final) + Phase 3→4 handoff  
**Auditor**: Stabilize-EA-2026-05-27 workflow  
**Status**: PASS — No drift detected

---

## Scope

Validate parity across:
- MT5 EA MQL5 → PHP plugin REST contract
- PHP plugin → Dashboard rendering
- Symbol normalization
- Timestamp handling
- Freshness/session classification

---

## Route Parity

| Route | PHP Handler | Auth | Status |
|-------|-------------|------|--------|
| POST `/ea/market-stream` | `post_ea_market_stream()` | `permission_ea_market_stream` → `permission_ea_bridge` | PASS |
| GET `/authority-diagnostics` | `get_authority_diagnostics()` | `permission_user` (WP session) | PASS |
| GET `/admin/health` | `get_admin_health()` | `permission_admin` | PASS |
| GET `/admin/soak-report` | `get_admin_soak_report()` | `permission_admin` | PASS |
| GET `/snapshot` | TanStack poll via `apiClient.getSnapshot()` | `permission_user` | PASS |
| GET `/ea/heartbeat` | `post_ea_heartbeat()` | `permission_ea_bridge` | PASS |

---

## Payload Parity (MQL5 → PHP field mapping)

| MQL5 field | PHP field | Accepted aliases | Status |
|-----------|-----------|-----------------|--------|
| `symbol` | `symbol` | `normalized_symbol` (overrides) | PASS |
| `bid` | `bid` | — | PASS |
| `ask` | `ask` | — | PASS |
| `spread` | `spread` | (computed if absent) | PASS |
| `quote_time` / `timestamp` | `quote_time` → `timestamp` fallback | Both accepted | PASS |
| `freshness` | `freshness` | (normalized to LIVE/etc.) | PASS |
| `session` | `session` | (normalized to Sydney/Tokyo/etc.) | PASS |
| `candle.time` | `candle.time` → `candle.timestamp` alias | — | PASS |
| `candle.open/high/low/close` | `candle.open/high/low/close` | `candle_open/high/low/close` flat aliases | PASS |
| `candle.tick_volume` | `candle.volume` (remapped) | Both `volume` and `tick_volume` accepted | PASS |
| `candles[]` (array) | `candles[0]` promoted to `candle` | Multi-candle batch truncated (Phase 3 scope) | PASS |
| `candle_m15.*` | `candle_m15.*` | Phase 3 M15 keys | PASS |

---

## Timestamp Parity

| Aspect | MQL5 | PHP | Status |
|--------|------|-----|--------|
| Timezone | UTC (MT5 broker server time) | UTC (normalized via `normalize_market_timestamp()`) | PASS |
| Format | ISO 8601 or `YYYY.MM.DD HH:MM:SS` | Both parsed; dot-dates converted to dash | PASS |
| Stale threshold | EA-side: broker server controls | PHP: 300s reject, 120s warn | PASS |
| Future candle guard | EA: closed bar only | PHP: `candle_time < stream_timestamp` | PASS |
| Epoch guard | EA: initialized MqlRates | PHP: >2000-01-01 (Unix 946684800) | PASS |

---

## Symbol Normalization Parity

| Broker alias | PHP alias map | MQL5 SymbolNormalizer.mqh | Status |
|-------------|---------------|--------------------------|--------|
| `NASDAQ` / `NASDAQ100` | → `NAS100` | `US Tech 100` → `NAS100` | PASS |
| `USTECH100` / `USTECH` | → `NAS100` | (space-stripped variant) | PASS |
| `WALLSTREET` / `WALLSTREET30` | → `US30` | `Wall Street 30` → `US30` | PASS |
| `DOW30` / `DJ30` | → `US30` | — | PASS |
| `GOLD` | → `XAUUSD` | — | PASS |
| `SILVER` | → `XAGUSD` | — | PASS |

---

## Freshness State Parity

| State | MQL5 FreshnessEngine.mqh | PHP normalize_mt5_freshness_value() | class-market-data-service normalize_freshness() | Status |
|-------|--------------------------|-------------------------------------|------------------------------------------------|--------|
| `LIVE` | ✓ | ✓ | ✓ | PASS |
| `DELAYED` | ✓ | ✓ | ✓ | PASS |
| `STALE` | ✓ | ✓ | ✓ | PASS |
| `CLOSED` | ✓ | ✓ | ✓ | PASS |
| `DISCONNECTED` | ✓ | ✓ | ✓ | PASS |

---

## Session Classification Parity

| Session name | MQL5 SessionManager.mqh | PHP normalize_mt5_session_value() | Status |
|-------------|------------------------|----------------------------------|--------|
| `Sydney` | ✓ | `SYDNEY` → `Sydney` | PASS |
| `Tokyo` | ✓ | `TOKYO`/`ASIAN` → `Tokyo` | PASS |
| `London` | ✓ | `LONDON` → `London` | PASS |
| `New York` | ✓ | `NEW_YORK`/`NEWYORK` → `New York` | PASS |
| `Overlap` | ✓ | `OVERLAP` → `Overlap` | PASS |
| `Closed` | ✓ | `CLOSED`/`WEEKEND` → `Closed` | PASS |

---

## Fib Parity

Not re-audited this workflow (no fib code changed). Last fib parity validation:
- `phase-4-fib-engine-parity-2026-05-25.md` — Phase 4 fib engine planning audit

---

## Signal Readiness Parity

| Gate | Backend | Dashboard | Status |
|------|---------|-----------|--------|
| Candle freshness required | PHP: `insert_mt5_candle()` age guard | Frontend: reads `is_live` from backend | PASS |
| Chop blocking | PHP: `sequence_state()` + regime | Frontend: reads backend gates array | PASS |
| `is_live` source of truth | Backend (`freshness === LIVE && source === mt5`) | Frontend: never overrides | PASS |
| `age_sec` source of truth | Backend: derived from `quote_time` | Frontend: `normalizeSnapshot()` uses backend `age_sec` | PASS |

---

## Known Parity Limits

1. Phase 4 fib engine (MT5 `FibEngine.mqh`) parity with PHP plugin is Phase 4 scope — not yet validated in live conditions.
2. Phase 5B regime and Phase 6 signal parity (EMA-20, ATR-14, proximity 15 pips, displacement 8 pips) confirmed at constant level in `phase-6-mt5-parity-2026-05-26.md` but full live parity pending Phase 5B/6 operator gate.
3. Pine script parity for regime/signal thresholds not directly validated — this is the Phase 5/6 scope.

---

## Acceptance Criteria

- [x] All EA payload fields map correctly to PHP handler
- [x] Timestamp UTC normalization aligned both sides
- [x] Symbol normalization covers all known broker aliases
- [x] Freshness states consistent across all layers
- [x] Session classification consistent
- [x] OHLC validation enforced on both EA side and PHP side
- [x] Stale rejection consistent (300s threshold)
- [x] Audit trail present for all rejection paths
- [x] Dashboard does not fake live state
- [ ] Phase 4 fib engine MT5↔PHP parity (Phase 4 scope)
- [ ] Phase 5B/6 regime/signal live parity (Phase 5/6 scope)
