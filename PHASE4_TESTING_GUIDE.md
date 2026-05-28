# Phase 4 Testing Guide - MT5 Fib Engine Parity Validation

**Date**: 2026-05-28  
**Phase**: 4 - Fib Engine Migration  
**Gate target**: 99%+ fib parity across all supported pairs and timeframes  
**Authority**: Pine script (`SMC_SuperFib_v13.1.3.pine`) is the parity reference. MT5 must match it.  
**Contract correction addendum**: `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`

---

## Parity Threshold

| Category | Required | Rationale |
|----------|----------|-----------|
| Fib level price accuracy | <=0.00001 per ratio (5 decimal places) | Matches existing PHP test suite tolerance; sub-pip on all major pairs |
| Overall parity rate | >=99% across replay corpus | Fib levels are execution-adjacent; higher threshold than regime/signal (95%) |
| Ratio coverage | 100% - all 16 ratios must be present | Missing ratios = incomplete fib family = gate fail regardless of price accuracy |
| Family coverage | 100% - both LTF_SF and HTF_AF per symbol/timeframe | Missing family = gate fail |

---

## Parity Validator Design

### Inputs

```text
MT5 output:  JSON fib payload from EA webhook (symbol, timeframe, family, ratio, price)
Pine output: Captured Pine fib levels (symbol, timeframe, family, ratio, price) from reference snapshots
```

### Match Logic

For each required `(symbol, timeframe, family, ratio)` tuple:

1. Verify the tuple exists in both MT5 and Pine inputs.
2. Compute `drift = abs(mt5_price - pine_price)` when both sides are present.
3. Classify:
   - `drift <= 0.00001` -> **EXACT MATCH**
   - `drift <= 0.001` -> **ACCEPTABLE DRIFT**
   - `drift > 0.001` -> **CRITICAL MISMATCH**
4. Missing required tuples on either side are **CRITICAL MISMATCHES**.

### Required Coverage

- Symbols: `EURUSD`, `USDJPY`, `XAUUSD`
- Timeframes: `M15`, `H1`, `H4`, `D1`
- Families: `LTF_SF`, `HTF_AF`
- Ratios per group: `16`
- Required export: `384` rows across `24` `(symbol,timeframe,family)` groups

---

## Historical Replay Methodology

### Corpus Definition

| Pair | Timeframes | Lookback | Candle count (approx) | Session coverage |
|------|------------|----------|-----------------------|------------------|
| EURUSD | M15, H1, H4, D1 | 30 days | ~2,880 M15 / ~720 H1 / ~180 H4 / ~30 D1 | London, NY, Asian |
| USDJPY | M15, H1, H4, D1 | 30 days | ~2,880 / ~720 / ~180 / ~30 | Asian, London |
| XAUUSD | M15, H1, H4, D1 | 30 days | ~2,880 / ~720 / ~180 / ~30 | London open |
| GBPUSD | M15, H1, H4 | 14 days | ~1,344 / ~336 / ~84 | London, NY |
| BTCUSD | M15, H1, H4 | 14 days | ~1,344 / ~336 / ~84 | 24/7 |

Minimum viable corpus for gate: EURUSD + USDJPY + XAUUSD across M15/H1/H4/D1.

### Replay Steps

1. Capture Pine reference: export all 16 ratios for both families across the required M15/H1/H4/D1 matrix.
2. Feed the same candles to MT5.
3. Capture MT5 output at the same UTC snapshot.
4. Run `php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json`.
5. Confirm `384` rows across `24` `(symbol,timeframe,family)` groups before gate closeout.

---

## Existing Test Suite (Baseline - must remain green throughout Phase 4)

| Test file | What it covers |
|-----------|----------------|
| `test-fib-parity.php` | 16-ratio LTF_SF/HTF_AF output for EURUSD/USDJPY/XAUUSD across M15/H1/H4/D1 |
| `test-superfib-weighting.php` | 1/2/3 anchor recency weighting for LTF_SF high/low |
| `test-htf-authority-anchor.php` | HTF_AF raw-extreme anchor logic |
| `test-session-anchors.php` | Session boundary anchor detection |
| `test-fib-ingestion.php` | MT5 fib ingestion contract, including H4 persistence and grouped retrieval |

---

## Gate Checklist

- [x] Parity validator implemented and producing JSON report - `scripts/parity-validator.php` (self-test 100% PASS on `384/384` 2026-05-28)
- [x] **[MANUAL]** Live MT5 deployment confirmed for `Phase-4-Implementation` - live soak active 2026-05-27
- [x] **[MANUAL]** T0 admin baseline captured/exported for `PHASE_4_30_DAY` - `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`
- [x] **[MANUAL]** Runtime verification re-run after the 2026-05-28 contract correction - backend confirmed `levels_written=128` for `XAUUSD` at `15:14:35 UTC`
- [ ] **[MANUAL]** Historical replay corpus captured (EURUSD + USDJPY + XAUUSD minimum) - requires 30-day live MT5 data
- [ ] **[MANUAL]** Replay run across M15, H1, H4, D1 for each corpus pair
- [ ] **[MANUAL]** Overall parity >=99% per pair/timeframe
- [ ] **[MANUAL]** Zero critical mismatches (drift >0.001) on any pair/timeframe
- [ ] **[MANUAL]** Export acceptance confirmed at `384` rows across `24` `(symbol,timeframe,family)` groups
- [x] All 16 ratios present for both LTF_SF and HTF_AF families - verified in PHP contract tests and parity tests
- [ ] **[MANUAL]** Weekend gap and sparse-data scenarios tested and passing
- [x] All existing PHP fib parity tests remain green (no regression in Pine-authoritative path)
