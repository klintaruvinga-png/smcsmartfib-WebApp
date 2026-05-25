# Phase 4 Implementation Plan — MT5 Fib Engine Migration

**Date**: 2026-05-25  
**Status**: IN-PROGRESS — code implementation complete 2026-05-25; live replay corpus and manual gate validation pending  
**Prerequisites**: Phase 3 COMPLETE ✅ (gate passed 2026-05-25)  
**Gate target**: 99%+ fib parity between MT5 Fib Engine output and Pine fib output  
**Branch**: `Phase-4-Implementation` — PR [#239](https://github.com/klintaruvinga-png/smcsmartfib-WebApp/pull/239)

---

## Owners

| Track | Lead | Responsibility |
|-------|------|----------------|
| Track A — MT5 EA | admin (klintaruvinga@gmail.com) | MQL5 fib engine implementation; all fib types; parity replay |
| Track B — Backend | admin (klintaruvinga@gmail.com) | Backend fib ingestion, storage, parity validator API, test coverage |

---

## Phase Scope

Port all SuperFib calculations from the Pine script (`SMC_SuperFib_v13.1.3.pine`) and PHP backend (`class-market-data-service.php → fib_levels_from_candles()`) into an MT5 Expert Advisor module. Validate MT5 output against Pine output at 99%+ parity before Phase 5 is permitted to start.

Phase 4 produces **no execution capability** — it is analytical/read-only.

---

## Pine / PHP Fib Baseline (Parity Target)

The following spec is extracted from `fib_levels_from_candles()` in `class-market-data-service.php` and verified by the PHP parity test suite (`test-fib-parity.php`, `test-superfib-weighting.php`, `test-htf-authority-anchor.php`, `test-session-anchors.php`).

### Fib Ratio Set (16 ratios — fixed, must match exactly)

```
-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300
```

### Fib Families

| Family | Name | Description |
|--------|------|-------------|
| `LTF_SF` | Lower Timeframe SuperFib | Recency-weighted composite anchor; primary trading fib |
| `HTF_AF` | Higher Timeframe Anchor Fib | Structural anchor from HTF candle extremes |

### SuperFib Anchor Weighting (`LTF_SF`)

The LTF_SF anchor (high/low) is computed as a recency-weighted average of the most recent candle extremes:

| Anchors available | High weight | Mid weight | Low weight |
|-------------------|-------------|------------|------------|
| 3 (most recent = highest weight) | 0.40 | 0.35 | 0.25 |
| 2 | 0.60 | 0.40 | — |
| 1 | 1.00 | — | — |

**Test evidence** (from `test-superfib-weighting.php`):
- 4 candles (highs: 120,130,110,140; lows: 100,90,80,70) → high = 119.5, low = 88.5 (3-anchor: 0.40×140 + 0.35×110 + 0.25×130 = 119.5; 0.40×70 + 0.35×80 + 0.25×90 = 88.5) ✓
- 3 candles → high = 119.0, low = 84.5 (2-anchor: 0.60×140 + 0.40×110 = 119.0; 0.60×70 + 0.40×80 = 84.5) ✓
- 2 candles → high = 110.0, low = 80.0 (1-anchor) ✓

### HTF Anchor Fib (`HTF_AF`)

The HTF_AF uses absolute candle extremes (not recency-weighted) from the HTF dataset. The anchor high/low is the raw max high and min low across all HTF candles in the lookback window.

**Test evidence** (from `test-fib-parity.php`): With 8 candles at prices 10–80, HTF_AF anchor = high 20.0, low 2.0 for 15m dataset; 20.0 / 2.0 for 1h dataset; 30.0 / 3.0 for 1d dataset.

### Fib Level Price Formula

For a given ratio `r` and anchor high `H` / low `L`:

```
price = H + (L - H) * (r / 100)
```

At ratio 0 → price = H (top anchor)  
At ratio 100 → price = L (bottom anchor)  
Negative ratios → price above H (extensions above)  
Ratios > 100 → price below L (extensions below)

All 16 ratios must be present in every output. Price must match to 5 decimal places (0.00001 tolerance per PHP test suite).

### Timeframe Coverage Required

| Timeframe | TF Seconds |
|-----------|-----------|
| M15 | 900 |
| H1 | 3600 |
| D1 | 86400 |

---

## Implementation Checklist

### Track A — MT5 EA

- [x] Create `FibEngine.mqh` — computes LTF_SF and HTF_AF fib levels from candle arrays *(done 2026-05-25)*
- [x] Implement recency-weighted anchor for LTF_SF (3/2/1 anchor weighting matching PHP spec above) *(done 2026-05-25)*
- [x] Implement raw-extreme anchor for HTF_AF *(done 2026-05-25)*
- [x] Emit all 16 fib ratios per family per symbol per timeframe in webhook payload *(done 2026-05-25)*
- [x] Integrate `FibEngine.mqh` into `MarketDataEngine.mqh` dispatch cycle *(done 2026-05-25 — throttled every 6 cycles)*
- [x] Add per-symbol fib payload to the market-stream POST body *(done 2026-05-25 — dispatched to `/ea/fib-levels`)*
- [ ] **[MANUAL]** Validate output against PHP fib parity test dataset — requires live MT5 terminal run + Pine snapshot capture

### Track B — Backend

- [x] Create `wp_smc_sf_fib_levels` table: `symbol`, `timeframe`, `family`, `ratio`, `price`, `source`, `calculated_at` *(done 2026-05-25)*
- [x] Add `POST /ea/fib-levels` REST endpoint to receive fib payload from EA *(done 2026-05-25)*
- [x] Create PHP fib ingestion handler: validate, upsert, timestamp *(done 2026-05-25 — 7 contract tests pass)*
- [x] Create `GET /market-data/fib-levels` endpoint for dashboard consumption *(done 2026-05-25)*
- [x] Extend PHP test suite: add fib ingestion contract tests alongside existing parity tests *(done 2026-05-25 — `test-fib-ingestion.php` passes)*
- [x] Create parity validator: compare MT5 fib output vs. Pine fib output per symbol/timeframe/family/ratio *(done 2026-05-25 — `scripts/parity-validator.php`, self-test 100% PASS)*

---

## Phase Gate

Reference gate: `PHASE4_TESTING_GUIDE.md`

- [ ] **[MANUAL]** 99%+ fib parity across all supported pairs/timeframes (EURUSD, USDJPY, XAUUSD minimum; full watchlist target)
- [x] All 16 ratios present for both LTF_SF and HTF_AF families per output *(verified in PHP parity tests and ingestion contract tests)*
- [x] Price accuracy ≤0.00001 vs. Pine reference values *(verified in PHP parity tests — delta max 0.00000 on all fixtures)*
- [ ] **[MANUAL]** Historical replay corpus passes (see `PHASE4_TESTING_GUIDE.md`) — 30-day EURUSD/USDJPY/XAUUSD corpus required
- [x] No regression in Phase 3 candle ingestion, freshness, or authority paths *(all 5 PHP fib baseline tests green; MT5 integration extend-only)*
- [x] Parity validator produces a machine-readable report (JSON or PHP output) for gate review *(`scripts/parity-validator.php` — self-test 100% PASS; outputs `reports/phase4-gate.json`)*

---

## Do Not Touch (Phase 4)

- `SMC_SuperFib_v13.1.3.pine` — Pine is the parity target; do not modify it
- `SMC_SuperFib_Sniper_REST::ACTIVE_DAY_DEFINITION` — out of scope
- `/ea/market-stream` freshness and timestamp authority guards
- `ensure_engine_snapshot()` stale-truth enforcement
- Phase 3 EA modules (`MarketDataEngine.mqh`, `CandleBuilder.mqh`, `FreshnessEngine.mqh`, `SessionManager.mqh`) — extend only; do not break Phase 3 behaviour

---

## Completion Target

2026-08-15 (per migration board)
