# Phase 4 Testing Guide — MT5 Fib Engine Parity Validation

**Date**: 2026-05-25  
**Phase**: 4 — Fib Engine Migration  
**Gate target**: 99%+ fib parity across all supported pairs and timeframes  
**Authority**: Pine script (`SMC_SuperFib_v13.1.3.pine`) is the parity reference. MT5 must match it.

---

## Parity Threshold

| Category | Required | Rationale |
|----------|----------|-----------|
| Fib level price accuracy | ≤0.00001 per ratio (5 decimal places) | Matches existing PHP test suite tolerance; sub-pip on all major pairs |
| Overall parity rate | ≥99% across replay corpus | Fib levels are execution-adjacent; higher threshold than regime/signal (95%) |
| Ratio coverage | 100% — all 16 ratios must be present | Missing ratios = incomplete fib family = gate fail regardless of price accuracy |
| Family coverage | 100% — both LTF_SF and HTF_AF per symbol/timeframe | Missing family = gate fail |

---

## Parity Validator Design

### Inputs

```
MT5 output:  JSON fib payload from EA webhook (symbol, timeframe, family, ratio, price)
Pine output: Captured Pine fib levels (symbol, timeframe, family, ratio, price) from reference snapshots
```

### Match Logic

For each `(symbol, timeframe, family, ratio)` tuple:

1. Find the MT5 price for that tuple
2. Find the Pine price for that tuple
3. Compute `drift = abs(mt5_price - pine_price)`
4. Classify:
   - `drift ≤ 0.00001` → **EXACT MATCH**
   - `drift ≤ 0.001` → **ACCEPTABLE DRIFT** (flag, count toward parity %)
   - `drift > 0.001` → **CRITICAL MISMATCH** (gate fail candidate)

### Parity % Calculation

```
parity_pct = (exact_match_count + acceptable_drift_count) / total_tuples * 100
```

Gate passes when `parity_pct ≥ 99` AND `critical_mismatch_count = 0` for any single symbol/timeframe.

### Output

The validator must produce a machine-readable JSON report:

```json
{
  "run_date": "YYYY-MM-DD",
  "overall_parity_pct": 99.2,
  "gate": "PASS",
  "by_symbol": {
    "EURUSD": { "M15": { "parity_pct": 100, "mismatches": [] }, ... },
    ...
  },
  "critical_mismatches": [],
  "acceptable_drift": []
}
```

---

## Historical Replay Methodology

### Why Replay

MT5 computes fibs from live streaming candle data. To validate parity against Pine, we must replay a known historical candle sequence through both engines and compare outputs. The candle sequence must be identical to ensure the comparison is fair.

### Corpus Definition

| Pair | Timeframes | Lookback | Candle count (approx) | Session coverage |
|------|-----------|----------|----------------------|-----------------|
| EURUSD | M15, H1, D1 | 30 days | ~2,880 M15 / ~720 H1 / ~30 D1 | London, NY, Asian |
| USDJPY | M15, H1, D1 | 30 days | ~2,880 / ~720 / ~30 | Asian, London |
| XAUUSD | M15, H1, D1 | 30 days | ~2,880 / ~720 / ~30 | London open |
| GBPUSD | M15, H1 | 14 days | ~1,344 / ~336 | London, NY |
| BTCUSD | M15 | 14 days | ~1,344 | 24/7 |

Minimum viable corpus for gate: EURUSD + USDJPY + XAUUSD across M15/H1/D1.

### Replay Steps

1. **Capture Pine reference**: Export Pine fib levels (all 16 ratios, both families) for each symbol/timeframe from a known candle snapshot (timestamp-anchored). Record as JSON.
2. **Feed same candles to MT5**: Send the identical candle sequence to the MT5 fib engine via the backend candle store (or direct EA input).
3. **Capture MT5 output**: Record MT5 fib webhook payload for same symbol/timeframe/timestamp.
4. **Run parity validator**: Compare Pine JSON vs. MT5 JSON using the validator above.
5. **Record in gate report**: Include validator JSON in the Phase 4 gate closeout document.

---

## Test Scenarios

### Scenario 1 — Normal Market (Trending)

- Symbol: EURUSD M15
- Condition: Clear trending candle sequence, recent swing highs/lows well-defined
- Expected: LTF_SF and HTF_AF anchors align with recent extremes; 3-anchor weighting applied correctly

### Scenario 2 — Volatile Markets

- Symbol: XAUUSD during news event (e.g., NFP, CPI release window)
- Condition: Large-body candles, rapid high/low shifts in short window
- Expected: LTF_SF recency weighting adapts to most recent extreme; no stale anchor carryover

### Scenario 3 — Weekend Gap

- Symbol: EURUSD D1 over a weekend
- Condition: Friday close → Monday open with gap
- Expected: MT5 does not fabricate a weekend candle; fib anchors based on Friday close candle; Monday gap reflected correctly

### Scenario 4 — Missing Candles (Sparse Data)

- Symbol: Any pair during illiquid session
- Condition: Gaps in M15 candle sequence (missed ticks during broker outage)
- Expected: 1-anchor weighting falls back correctly when fewer than 2 anchor candles are available; no nil/zero price emitted

### Scenario 5 — Broker Symbol Suffix Normalization

- Symbol: EA emits `EURUSDm` or `EURUSD.pro`; backend expects `EURUSD`
- Condition: Broker-specific suffix attached to symbol name
- Expected: `SymbolNormalizer.mqh` strips suffix; fib output keyed to normalized symbol; parity validator matches on normalized symbol

### Scenario 6 — Multi-Pair Concurrent

- Symbols: Full watchlist (13+ symbols) firing simultaneously
- Condition: EA dispatching fib payloads for all watchlist symbols on a single timer cycle
- Expected: No payload collision; each symbol/timeframe combination produces independent correct fib output

---

## Existing Test Suite (Baseline — must remain green throughout Phase 4)

| Test file | What it covers |
|-----------|---------------|
| `test-fib-parity.php` | 16-ratio LTF_SF/HTF_AF output for EURUSD/USDJPY/XAUUSD across M15/H1/D1 |
| `test-superfib-weighting.php` | 1/2/3 anchor recency weighting for LTF_SF high/low |
| `test-htf-authority-anchor.php` | HTF_AF raw-extreme anchor logic |
| `test-session-anchors.php` | Session boundary anchor detection |

These tests define the parity target. MT5 fib output must produce identical results to PHP `fib_levels_from_candles()` for the same candle input.

---

## Gate Checklist

- [x] Parity validator implemented and producing JSON report — `scripts/parity-validator.php` (self-test 100% PASS 2026-05-25)
- [x] **[MANUAL]** Live MT5 deployment confirmed for `Phase-4-Implementation` — live soak active 2026-05-27
- [x] **[MANUAL]** T0 admin baseline captured/exported for `PHASE_4_30_DAY` — `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`
- [x] **[MANUAL]** Runtime verification completed — `ea_version=1.00`, fib POST OK for EURUSD/USDJPY/XAUUSD, plugin `13.0.3`, backend ingest confirmed
- [ ] **[MANUAL]** Historical replay corpus captured (EURUSD + USDJPY + XAUUSD minimum) — requires 30-day live MT5 data
- [ ] **[MANUAL]** Replay run across M15, H1, D1 for each corpus pair
- [ ] **[MANUAL]** Overall parity ≥99% per pair/timeframe
- [ ] **[MANUAL]** Zero critical mismatches (drift >0.001) on any pair/timeframe
- [x] All 16 ratios present for both LTF_SF and HTF_AF families — verified in PHP contract tests and parity tests
- [ ] **[MANUAL]** Scenario 3 (weekend gap) and Scenario 4 (sparse data) tested and passing
- [x] All existing PHP fib parity tests remain green (no regression in Pine-authoritative path) — 5/5 PASS 2026-05-25
- [x] Phase 3 regression suite passes unchanged (`npx vitest run`, PHP sweep) — confirmed no regressions 2026-05-25
