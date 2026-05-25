# Phase 5 — Regime & Chop Engine: Implementation Readiness Package

**Status**: CODE COMPLETE (2026-05-25) — awaiting Phase 4 live parity gate  
**Target Start**: After Phase 4 gate passes  
**Target End**: 2026-09-15  
**Owner**: Track A (MT5 EA) + Track B (Backend)  
**Branch**: To be created from main once Phase 4 gate clears  

---

## Overview

Phase 5 ports regime and chop classification from Pine Script into MT5. The regime
engine computes per-symbol directional bias and chop conditions from raw broker
candles, mirrors the PHP `build_symbol_state()` regime output, and feeds the
Phase 6 signal dual-run engine.

---

## What Was Implemented (2026-05-25)

### Track A — MT5 EA

**New file: `mt5/RegimeEngine.mqh`**
- `ComputeRegimeJson(symbol, normalizedSymbol, userId)` — computes one symbol, returns JSON object
- `BuildBatchPayload(rawSymbols[], normSymbols[], count, userId)` — batches all symbols into one JSON array
- **HTF Bias** (BULL / BEAR / TRANSITIONAL):
  - EMA-20 on D1 close prices (custom EMA implementation — no external indicators)
  - Bull: close > EMA × 1.0005; Bear: close < EMA × 0.9995; else Transitional
- **LTF Regime** (TRENDING / RANGING / CHOP):
  - Efficiency ratio (Perry Kaufman) on H1 close prices over 14 bars
  - chop_score < 0.35 → TRENDING; 0.35–0.65 → RANGING; > 0.65 → CHOP
- **Chop Score** (0.00–1.00): net move ÷ path length; 1.0 = pure chop
- **Volatility metrics**: EMA-20 D1 and ATR-14 H1 stored for dashboard display

**Modified: `mt5/MarketDataEngine.mqh`**
- Includes `RegimeEngine.mqh`, `SignalEngine.mqh`, `ExecutionEngine.mqh`
- `regimeEngine`, `signalEngine`, `executionEngine` member instances
- `regimeCycleCounter` / `regimeCycleInterval` (default 6 = ~60s on 10s timer)
- `SendRegimeToBackend()` — batch POST to `/ea/regime-snapshot`
- `OnPeriodic()` extended: fib → regime → signal → execution (Phase 7 no-op)

### Track B — Backend

**New DB table: `wp_smc_sf_regime_snapshots`**
```
id, user_id, symbol, htf_bias, ltf_regime, chop_score,
ema20_d1, atr14_h1, source, calculated_at
UNIQUE KEY (user_id, symbol)
```

**New REST endpoint: `POST /ea/regime-snapshot`** (EA bridge auth)
- Accepts `{ regimes: [ {...}, ... ] }` batch array
- Validates: htf_bias ∈ {BULL,BEAR,TRANSITIONAL}, ltf_regime ∈ {TRENDING,RANGING,CHOP}
- REPLACE upsert on (user_id, symbol) — always latest snapshot wins
- Logs written/failed counts

**New REST endpoint: `GET /market-data/regime`** (user auth)
- Optional `?symbol=EURUSD` filter
- Returns all regime snapshots for user
- Grouped camelCase response: `{ ok, regimes: [...] }`

---

## Parity Target

The `run_engine_for_symbols()` function currently returns hardcoded `bias: RANGING, chop: 1`
for offline symbols. Phase 5 will enrich this with MT5 regime data from the DB.

| Check | Target |
|-------|--------|
| HTF bias direction match (Bull/Bear) | ≥ 95% |
| LTF regime category match (Trending/Ranging/Chop) | ≥ 90% |
| Chop score delta vs Pine | ≤ 0.15 |

---

## Phase 5 Gate Checklist

### Automated (code-complete, no operator action needed)
- [x] `RegimeEngine.mqh` compiled and integrated into MarketDataEngine
- [x] `POST /ea/regime-snapshot` endpoint live and validated
- [x] `GET /market-data/regime` endpoint live
- [x] DB table `wp_smc_sf_regime_snapshots` schema created
- [x] Dispatch throttled to ~60s (no performance regression on market-stream)
- [x] Batch dispatch (all symbols in one POST — not per-symbol)

### Manual (operator action required — cannot start until Phase 4 gate clears)
- [ ] **Deploy Phase 5 code** to live MT5 terminal on `Phase-5-Implementation` branch
- [ ] **48h regime accumulation** — let EA capture regime data for all 27 symbols
- [ ] **Regime parity validation** — compare MT5 htf_bias vs Pine bias for 10+ historical sessions
- [ ] **Chop score spot-check** — verify 5+ CHOP and 5+ TRENDING classifications are accurate
- [ ] **Weekend freeze test** — confirm regime engine returns TRANSITIONAL/RANGING for closed markets
- [ ] **High-volatility test** — verify TRENDING classification during NFP/CPI session

---

## Data Flow

```
MT5 EA
  RegimeEngine.ComputeRegimeJson()
    ↳ CopyClose(D1) → EMA-20 → htf_bias
    ↳ CopyRates(H1) → ATR-14 + Efficiency Ratio → ltf_regime, chop_score
  BuildBatchPayload() → POST /ea/regime-snapshot
    ↳ wp_smc_sf_regime_snapshots (REPLACE upsert)
      ↳ GET /market-data/regime
        ↳ Dashboard regime chips, chop overlay
```

---

## Do Not Touch (Phase 5 scope)
- `build_symbol_state()` Pine computation — do not modify until Phase 5 parity confirmed
- `run_engine_for_symbols()` return structure — extend-only
- Any Phase 4 fib logic — no changes
- `FibEngine.mqh`, `CandleBuilder.mqh`, `FreshnessEngine.mqh` — no changes

---

## Parity Status

```
MT5 htf_bias vs Pine bias:    PENDING (Phase 4 gate must clear first)
MT5 ltf_regime vs Pine regime: PENDING
MT5 chop_score vs Pine chop:  PENDING
```
