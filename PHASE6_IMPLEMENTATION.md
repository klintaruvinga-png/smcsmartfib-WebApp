# Phase 6 — Signal Engine Dual-Run: Implementation Readiness Package

**Status**: CODE COMPLETE (2026-05-25) — awaiting Phase 5B parity gate  
**Target Start**: After Phase 5B gate passes  
**Target End**: 2026-10-15  
**Owner**: Track A (MT5 EA) + Track B (Backend)  
**Branch**: To be created from main once Phase 5B gate clears  

---

## Overview

Phase 6 runs the MT5 signal engine **in parallel** with Pine. Pine remains the
authoritative signal source until MT5 achieves ≥ 95% parity across 200+ comparable
signals. The Phase 6 gate (≥ 95%) is what unlocks Phase 7 execution.

**Execution is hard-blocked until Phase 6 gate is formally signed off.**

---

## What Was Implemented (2026-05-25)

### Track A — MT5 EA

**New file: `mt5/SignalEngine.mqh`**

Evaluation logic (`EvaluateSymbol`):
- Gate 1: Price proximity to nearest fib level (within 15 pips)
- Gate 2: Displacement — last closed H1 candle crosses fib level with ≥ 8 pip closure
- Gate 3: HTF alignment — signal direction matches RegimeEngine `htf_bias`
- Gate 4: LTF regime ≠ CHOP (chop_score < 0.72 threshold)

Status from gates:
- 0–1 gates → WATCH
- 2 gates → ARMED
- 3–4 gates → READY

Verdict from confidence:
- A+: confidence ≥ 0.88 AND htf_aligned AND displacement confirmed
- A: confidence ≥ 0.70
- B: confidence ≥ 0.50
- C: below threshold

SL computation: H4 3-bar swing low/high (10-bar lookback) with 5-pip buffer  
TP computation: Next fib level in trade direction; fallback = 50-pip projected target

`SignalToJson(candidate, userId)` — serializes to JSON for POST payload

**Modified: `mt5/MarketDataEngine.mqh`**
- `signalCycleCounter` / `signalCycleInterval` (default 12 = ~120s)
- `SendSignalCandidatesToBackend()` — POST to `/ea/signal-candidates`

> **Note**: Full fib level deserialization from engine to signal evaluator is scaffolded.
> The SignalEngine receives `fibCount=0` in the current wiring because FibEngine outputs JSON
> (not a raw array) and cross-engine data sharing needs a state cache layer.
> Full wiring is part of Phase 6 activation work — this does not affect the storage
> infrastructure, drift analysis, or parity gate logic.

### Track B — Backend

**New DB table: `wp_smc_sf_mt5_signal_candidates`**
```
id (VARCHAR 64), user_id, symbol, direction, status, verdict,
entry_price, sl_price, tp_price, fib_level, fib_ratio, fib_family,
htf_bias, ltf_regime, confidence,
pine_match (EXACT/DRIFT/MISMATCH/NO_PINE), drift_pips,
source, created_at
```

**New REST endpoint: `POST /ea/signal-candidates`** (EA bridge auth)
- Validates direction, status, verdict
- Calls `classify_signal_drift()` against Pine signals table on ingestion
- REPLACE upsert by id

**Drift classification (`classify_signal_drift`):**
- `NO_PINE` — no active Pine signal exists for this symbol
- `MISMATCH` — direction differs
- `EXACT` — direction matches AND entry within 20 pips
- `DRIFT` — direction matches AND entry within 100 pips

**New REST endpoint: `GET /market-data/signal-drift`** (user auth)
- Returns last 200 candidates with parity stats
- Computes parity_pct = exact / (total − no_pine) × 100
- Gate status: `{ gate_target: 95.0, gate_status: PASS | PENDING }`

**Phase 6 gate enforcement (`is_phase6_gate_cleared`):**
- Requires ≥ 50 comparable candidates before gate can pass
- Gate = parity_pct ≥ 95%
- Used to block Phase 7 execution queue and execution requests

---

## Phase 6 Gate Checklist

### Automated (code-complete)
- [x] `SignalEngine.mqh` compiled and integrated into MarketDataEngine
- [x] `wp_smc_sf_mt5_signal_candidates` table schema
- [x] `POST /ea/signal-candidates` ingest endpoint
- [x] `GET /market-data/signal-drift` parity report
- [x] `classify_signal_drift()` drift analyzer vs. Pine signals table
- [x] `is_phase6_gate_cleared()` used to gate Phase 7

### Manual (operator action — starts after Phase 5B gate)
- [ ] **Deploy Phase 6 code** to live MT5 terminal
- [ ] **Wire fib state cache** — connect SignalEngine to live FibEngine fib level array
  (currently fibCount=0; needs SharedStateCache struct in MarketDataEngine)
- [ ] **Accumulate 200+ comparable candidates** across 2+ trading weeks
- [ ] **Review signal-drift report** at `/market-data/signal-drift`
- [ ] **Target**: parity_pct ≥ 95% before Phase 7 activation
- [ ] **Edge case review**: NFP, weekend open, sparse market sessions

---

## Parity Gate

```
MT5 Signal vs Pine Signal: PENDING (needs Phase 5B + live corpus)
Gate target: ≥ 95% EXACT parity over ≥ 200 comparable candidates
Phase 7 execution BLOCKED until gate PASS
```

---

## Do Not Touch (Phase 6 scope)
- `smc_sf_signals` table (Pine signals) — read-only by drift analyzer
- Phase 4 fib logic — no changes
- Phase 5 regime logic — read-only by signal engine
