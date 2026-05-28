# Phase 4 Implementation Plan - MT5 Fib Engine Migration

**Date**: 2026-05-28  
**Status**: IN-PROGRESS - code implementation complete 2026-05-25; timeframe contract corrected 2026-05-28; live replay corpus and manual gate validation pending  
**Prerequisites**: Phase 3 COMPLETE (gate passed 2026-05-25)  
**Gate target**: 99%+ fib parity between MT5 Fib Engine output and Pine fib output  
**Branch**: `Phase-4-Implementation` - PR [#239](https://github.com/klintaruvinga-png/smcsmartfib-WebApp/pull/239)  
**Contract correction addendum**: `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`

---

## Owners

| Track | Lead | Responsibility |
|-------|------|----------------|
| Track A - MT5 EA | admin (klintaruvinga@gmail.com) | MQL5 fib engine implementation; all fib types; parity replay |
| Track B - Backend | admin (klintaruvinga@gmail.com) | Backend fib ingestion, storage, parity validator API, test coverage |

---

## Phase Scope

Port all SuperFib calculations from the Pine script (`SMC_SuperFib_v13.1.3.pine`) and PHP backend (`class-market-data-service.php -> fib_levels_from_candles()`) into an MT5 Expert Advisor module. Validate MT5 output against Pine output at 99%+ parity before Phase 5 is permitted to start.

Phase 4 produces **no execution capability** - it is analytical/read-only.

---

## Pine / PHP Fib Baseline (Parity Target)

The following spec is extracted from `fib_levels_from_candles()` in `class-market-data-service.php` and verified by the PHP parity test suite (`test-fib-parity.php`, `test-superfib-weighting.php`, `test-htf-authority-anchor.php`, `test-session-anchors.php`).

### Fib Ratio Set (16 ratios - fixed, must match exactly)

```text
-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300
```

### Fib Families

| Family | Name | Description |
|--------|------|-------------|
| `LTF_SF` | Lower Timeframe SuperFib | Recency-weighted composite anchor; primary trading fib |
| `HTF_AF` | Higher Timeframe Anchor Fib | Structural anchor from HTF candle extremes |

### Fib Level Price Formula

For a given ratio `r` and anchor high `H` / low `L`:

```text
price = H + (L - H) * (r / 100)
```

At ratio `0` -> price = `H`  
At ratio `100` -> price = `L`

### Timeframe Coverage Required

| Timeframe | TF Seconds |
|-----------|------------|
| M15 | 900 |
| H1 | 3600 |
| H4 | 14400 |
| D1 | 86400 |

---

## Implementation Checklist

### Track A - MT5 EA

- [x] Create `FibEngine.mqh` - computes LTF_SF and HTF_AF fib levels from candle arrays *(done 2026-05-25)*
- [x] Implement recency-weighted anchor for LTF_SF *(done 2026-05-25)*
- [x] Implement raw-extreme anchor for HTF_AF *(done 2026-05-25)*
- [x] Emit all 16 fib ratios per family per symbol per timeframe in webhook payload *(done 2026-05-25; corrected to M15/H1/H4/D1 on 2026-05-28)*
- [x] Integrate `FibEngine.mqh` into `MarketDataEngine.mqh` dispatch cycle *(done 2026-05-25 - throttled every 6 cycles)*
- [x] Add per-symbol fib payload to the market-stream POST body *(done 2026-05-25 - dispatched to `/ea/fib-levels`)*
- [x] **[MANUAL]** Deploy `Phase-4-Implementation` to the live MT5 terminal *(operator confirmed 2026-05-27; live corpus accumulation started)*
- [x] **[MANUAL]** Capture Phase 4 T0 admin baseline (`PHASE_4_30_DAY`) *(operator confirmed 2026-05-27; export committed at `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`)*
- [ ] **[MANUAL]** Redeploy the corrected H4 build and confirm `levels_written=128` for a complete symbol payload
- [ ] **[MANUAL]** Validate output against PHP fib parity test dataset - requires live MT5 terminal run + Pine snapshot capture

### Track B - Backend

- [x] Create `wp_smc_sf_fib_levels` table: `symbol`, `timeframe`, `family`, `ratio`, `price`, `source`, `calculated_at` *(done 2026-05-25)*
- [x] Add `POST /ea/fib-levels` REST endpoint to receive fib payload from EA *(done 2026-05-25; corrected to accept H4 on 2026-05-28)*
- [x] Create PHP fib ingestion handler: validate, upsert, timestamp *(done 2026-05-25; H4 contract correction 2026-05-28)*
- [x] Create `GET /market-data/fib-levels` endpoint for dashboard consumption *(done 2026-05-25)*
- [x] Extend PHP test suite: add fib ingestion contract tests alongside existing parity tests *(corrected on 2026-05-28 to require 128 rows and H4 retrieval)*
- [x] Create parity validator: compare MT5 fib output vs. Pine fib output per symbol/timeframe/family/ratio *(done 2026-05-25; corrected on 2026-05-28 to require the full 384-tuple contract and fail symmetric omissions)*

---

## Phase Gate

Reference gate: `PHASE4_TESTING_GUIDE.md`

- [ ] **[MANUAL]** 99%+ fib parity across all supported pairs/timeframes (EURUSD, USDJPY, XAUUSD minimum; full watchlist target)
- [x] All 16 ratios present for both LTF_SF and HTF_AF families per output *(verified in PHP parity tests and ingestion contract tests)*
- [x] Price accuracy <= 0.00001 vs. Pine reference values *(verified in PHP parity tests - delta max 0.00000 on all fixtures)*
- [ ] **[MANUAL]** Historical replay corpus passes (see `PHASE4_TESTING_GUIDE.md`) - 30-day EURUSD/USDJPY/XAUUSD corpus required across M15/H1/H4/D1
- [ ] **[MANUAL]** Operator export acceptance: `384` rows across `24` `(symbol,timeframe,family)` groups before gate closeout
- [x] No regression in Phase 3 candle ingestion, freshness, or authority paths *(all 5 PHP fib baseline tests green; MT5 integration extend-only)*
- [x] Parity validator produces a machine-readable report for gate review *(`scripts/parity-validator.php` - self-test 100% PASS on `384/384`; outputs `reports/phase4-gate.json`)*

---

## Do Not Touch (Phase 4)

- `SMC_SuperFib_v13.1.3.pine` - Pine is the parity target; do not modify it
- `SMC_SuperFib_Sniper_REST::ACTIVE_DAY_DEFINITION` - out of scope
- `/ea/market-stream` freshness and timestamp authority guards
- `ensure_engine_snapshot()` stale-truth enforcement
- Phase 3 EA modules (`MarketDataEngine.mqh`, `CandleBuilder.mqh`, `FreshnessEngine.mqh`, `SessionManager.mqh`) - extend only; do not break Phase 3 behaviour

---

## Completion Target

2026-08-15 (per migration board)
