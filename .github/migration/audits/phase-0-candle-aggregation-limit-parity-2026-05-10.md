# Parity Audit Report — Phase 0

**Report Date**: 2026-05-10  
**Phase**: Phase 0 — Stabilization (M1 Candle Aggregation LIMIT Guard)  
**Auditor**: Claude Code automated sweep  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 100% (no engine logic changes; parity maintained by construction)
- **Pass/Fail**: ✓ PASS
- **Trend**: ↑ Improving (soak stability hardened; fake-live cold-start removed)

This audit covers three patches applied during the 2026-05-10 v2 sweep:

1. `fetch_aggregated_mt5_m1_candles()` — DESC LIMIT guard (mirrors existing `fetch_candles()` pattern) to prevent full-table scans during Phase 0 soak.
2. `FreshnessEngine::GetAccountFreshness()` — `symbolCount == 0` guard to prevent fake-live account state on cold start.
3. `post_snapshot()` — restored internal `permission_user()` defense-in-depth guard (reverted an incorrect PATCH 3 that broke test-harness direct invocation).

No Fib, regime, signal, gate, or Pine logic was modified. Parity across all existing parity dimensions is unchanged.

---

## Component Parity Metrics

### Fib Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|--------|-------------|-------------|-------|----------|
| Fib ratio set (16 ratios) | Unchanged | Unchanged | ✓ | 100% |
| LTF_SF / HTA_SF / F3 families | Unchanged | Unchanged | ✓ | 100% |
| Anchor computation | Unchanged | Unchanged | ✓ | 100% |
| Level prices | Unchanged | Unchanged | ✓ | 100% |
| **Fib Parity Score** | — | — | — | **100%** |

**Observations**: No Fib logic touched. `build_symbol_state()` and its callers are untouched.

---

### Regime Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|--------|-------------|-------------|-------|----------|
| Chop gate threshold (≥0.7) | Unchanged | Unchanged | ✓ | 100% |
| Bias classification (BULL/BEAR/RANGING) | Unchanged | Unchanged | ✓ | 100% |
| `run_engine_for_symbols()` gate | Unchanged | Unchanged | ✓ | 100% |
| MT5 freshness gate (source=mt5 && state=live) | Unchanged | Unchanged | ✓ | 100% |
| **Regime Parity Score** | — | — | — | **100%** |

**Observations**: No regime logic touched.

---

### Signal Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|--------|-------------|-------------|-------|----------|
| `backendConfirmed` = READY && data_live | Unchanged | Unchanged | ✓ | 100% |
| ARMED status when chop-gated | Unchanged | Unchanged | ✓ | 100% |
| Confluence detection | Unchanged | Unchanged | ✓ | 100% |
| Entry / SL / TP ladder computation | Unchanged | Unchanged | ✓ | 100% |
| **Signal Parity Score** | — | — | — | **100%** |

**Observations**: No signal logic touched.

---

### M1 Candle Aggregation (Modified)

| Metric | Before Patch | After Patch | Match | Notes |
|--------|-------------|-------------|-------|-------|
| Output bucket count (30 buckets, 450 M1 rows) | 30 | 30 | ✓ | DESC LIMIT fetches enough rows to satisfy full outputsize |
| OHLC field correctness | open/high/low/close/volume | open/high/low/close/volume | ✓ | Field set unchanged; aggregation logic identical |
| Chronological ordering | ASC (in original scan) | ASC (via array_reverse after DESC fetch) | ✓ | Ordering preserved; ksort() + array_slice() unchanged |
| Empty result for no-data symbol | Returned [] | Returns [] | ✓ | Early return path unchanged |
| Scan cost at 7-day soak depth | ~60,480 rows/symbol | max(200, ceil(30×15×1.2)) = 540 rows | ✓ | 112× scan reduction; functionally equivalent output |
| **Candle Aggregation Parity** | — | — | — | **100%** |

**Observations**: The DESC-LIMIT + array_reverse pattern is identical to the guard already applied in `fetch_candles()`. The 1.2× headroom factor ensures the most-recent `outputsize` complete buckets are always covered even when a boundary M1 bar spans two 15-min slots.

---

### MT5 Freshness (Modified)

| Metric | Before Patch | After Patch | Match | Notes |
|--------|-------------|-------------|-------|-------|
| Cold-start `GetAccountFreshness()` (symbolCount=0) | FRESHNESS_LIVE (incorrect) | FRESHNESS_DISCONNECTED (correct) | ✓ Drift removed | DISCONNECTED is the safe/conservative state |
| Normal operation (symbolCount>0, all LIVE) | FRESHNESS_LIVE | FRESHNESS_LIVE | ✓ | Loop unchanged; worst-state aggregation identical |
| Normal operation (mixed LIVE + STALE) | FRESHNESS_STALE | FRESHNESS_STALE | ✓ | Worst-state wins; unchanged |
| Normal operation (DISCONNECTED terminal) | FRESHNESS_DISCONNECTED | FRESHNESS_DISCONNECTED | ✓ | UpdatePeriodic() sets DISCONNECTED before GetAccountFreshness() reads it |
| **MT5 Freshness Parity** | — | — | — | **100%** (cold-start drift removed) |

**Observations**: `GetFreshnessState()` for an unregistered symbol already returned `FRESHNESS_DISCONNECTED`. `GetAccountFreshness()` now follows the same conservative contract before any symbol is registered.

---

### EA Auth (`post_snapshot()`)

| Metric | Before Incorrect Patch | After Revert | Match | Notes |
|--------|------------------------|-------------|-------|-------|
| Unauthenticated call → WP_Error(401) | BROKEN (returned success) | Correct (WP_Error 401) | ✓ | Route-layer callback unchanged; internal guard restored |
| Authenticated call → success | Was unaffected | Correct (ok response) | ✓ | Logic path after auth unchanged |
| Test-harness direct invocation | FAILING | PASSING | ✓ | All 6 new assertions + prior assertions pass |
| **Auth Parity** | — | — | — | **100%** (regression removed) |

---

## Critical Issues Found

| Issue | Severity | Resolution | Blocker |
|-------|----------|-----------|---------|
| `fetch_aggregated_mt5_m1_candles()` unbounded M1 scan | HIGH | DESC LIMIT guard added | No (patched) |
| `GetAccountFreshness()` fake-live on cold start | MEDIUM | `symbolCount == 0` guard added | No (patched) |
| PATCH 3 broke `post_snapshot()` unauthenticated rejection | LOW | Internal permission guard restored | No (reverted) |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Session killzone windows (07-11 / 12-16) vs MT5 full sessions (07-15 / 12-20) | Display-only | Killzones are for signal-entry display timing only; MT5 SessionManager uses full sessions for freshness state | ✓ Known/pre-existing |
| EA `candle` key vs `post_snapshot()` `candle_m1` key | Very low risk | EA uses `post_ea_market_stream()` not `post_snapshot()` for live production data | ✓ Pre-existing, tracked |
| `TimeToIso8601()` broker-offset calculation in `MarketDataEngine.mqh` | MEDIUM risk | Uses `TimeCurrent() - TimeGMT()` which may drift on DST transitions; no observed impact in soak | ✓ Tracked for Phase 1 |

---

## Recommendations

1. Monitor M1 row counts in `smc_sf_candles` during the next 24h soak cycle to confirm LIMIT guard prevents runaway growth.
2. After Phase 0 soak is complete, consider adding a composite index `(user_id, symbol, timeframe, source, candle_time DESC)` to make the DESC scan fully index-covered.
3. The `symbolCount == 0` cold-start guard in `FreshnessEngine` should be verified visually on the dashboard after next EA restart — the freshness badge should show "offline/disconnected" briefly before the first tick, not "live".

---

## Verification Checklist

- [x] All 7 scan stages completed (Runtime, Wiring, Data Contracts, Freshness, Signal Engine, Migration Parity, Cleanup)
- [x] `fetch_aggregated_mt5_m1_candles()` parity verified: 450 M1 rows → 30 complete 15-min buckets, same result before and after LIMIT guard
- [x] `GetAccountFreshness()` cold-start guard verified: `symbolCount == 0` → `FRESHNESS_DISCONNECTED`
- [x] `post_snapshot()` internal auth guard verified: unauthenticated → `WP_Error(401)` in both test and route contexts
- [x] No engine logic, Fib, regime, or signal paths modified
- [x] No Pine Script changes
- [x] `test-mt5-snapshot-contract.php` — all assertions PASS (including 6 new LIMIT regression assertions)
- [x] Drift items documented and accepted
- [ ] M1 row count stabilisation observed in production soak (pending)
- [ ] MT5 EA cold-start freshness badge verified on dashboard (pending)

---

## Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-10-v2.md`
- Plugin file patched: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- MT5 freshness engine patched: `mt5/FreshnessEngine.mqh`
- Regression tests: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- Prior parity audit: `.github/migration/audits/phase-0-db-pruning-dead-code-parity-2026-05-10.md`
