# Phase 8 — Semi-Automation Layer: Implementation Specification

**Status**: SCAFFOLDED (pre-requisites in place)  
**Target Start**: After Phase 7 gate passes (≥50% win rate on 30 manual trades)  
**Target End**: 2026-12-01  
**Owner**: Track A (MT5 EA) + Track C (Dashboard automation rules)  
**Branch**: To be created from main once Phase 7 gate clears  
**Hard Gate**: Phase 7 complete with ≥50% win rate + 0 execution errors

---

## Overview

Phase 8 introduces **semi-automation** — the system automatically manages trade lifecycle
(entry confirmation, SL trailing, partial close triggers) while operator remains in strategic control.
Think "smart assistant" not "autopilot." Operator sets rules; system executes them.

**Key principle**: Automation respects operator intent. Operator sets automation thresholds; system executes.

---

## What This Phase Delivers

### Track A — MT5 EA

**New file: `mt5/AutomationEngine.mqh`**
- **Auto-confirm trade logic**:
  - Condition: signal confidence ≥ A (≥0.70) AND HTF bias is BULL/BEAR (not TRANSITIONAL)
  - Action: auto-approve trade if operator confidence score ≥ threshold (configurable per symbol)
  - Fallback: manual confirmation still available; auto-confirm is optional
- **Trailing SL logic**:
  - Once trade open: check if price moved 20+ pips in profit direction
  - If yes: shift SL to break-even + 1 pip (lock profit)
  - Continue: for every 15 additional pips profit, shift SL up 10 pips (trail by 5 pips)
  - Max trail: SL never moves lower than entry (safety)
- **Partial close triggers**:
  - At TP1 (first fib level): close 50% of position, take profit
  - Shift remaining 50% SL to entry (lock profit on remainder)
  - Let remainder run to TP2 (second fib level)
  - Dashboard: user can override partial close rules per symbol

**Modified: `mt5/MarketDataEngine.mqh`**
- `automationRulesPerSymbol` — map of { symbol: { autoConfirm: bool, trailingStop: bool, partialCloses: [TP1, TP2], ... } }
- `OnTradeUpdate()` — new event handler for trailing SL, partial close detection
- `SendAutomationEventsToBackend()` — log all automation actions for auditability

### Track C — Dashboard

**New route: `/automation`** (admin-only)
- **Automation settings panel**:
  - Global toggle: enable/disable semi-automation
  - Per-symbol toggles:
    - ✓ Auto-confirm trades (checkbox)
    - ✓ Trailing SL (checkbox + 15-pip step config)
    - ✓ Partial close at TP1 (checkbox + 50%/75%/100% split selector)
  - Confidence threshold for auto-confirm: slider 0.50–0.99 (default 0.70)
- **Trade automation log**: displays all automated actions
  - Timestamp, action (auto-confirm, trailing SL bump, partial close), symbol, old SL → new SL, result
  - Filter by: date, symbol, action type
- **Live audit**: operator can **revert** or **override** any automation action within 30 seconds

**Modified: `/execution` route**
- Add "automation rules" button → links to `/automation` settings
- In trade list, show which trades were auto-confirmed vs manually approved (badge icon)

### Track B — Backend

**New DB table: `wp_smc_sf_automation_settings`**
```
id, user_id, symbol, auto_confirm (boolean), trailing_stop (boolean),
trailing_step_pips, partial_close_enabled, tp1_close_pct, tp2_close_pct,
confidence_threshold, created_at, updated_at
UNIQUE KEY (user_id, symbol)
```

**New DB table: `wp_smc_sf_automation_events`**
```
id, user_id, symbol, event_type (AUTO_CONFIRM/TRAILING_SL/PARTIAL_CLOSE/OVERRIDE),
trade_id, old_value, new_value, timestamp, reverted_at, reverted_by
```

**New REST endpoints:**

`GET /automation/settings` (user auth)
- Returns automation settings for all user symbols
- Response: `{ ok, settings: { EURUSD: {...}, USDJPY: {...}, ... } }`

`PATCH /automation/settings/:symbol` (user auth)
- Update automation rules for one symbol
- Payload: `{ autoConfirm: bool, trailingStop: bool, trailingStepPips: N, ... }`
- Returns updated settings

`GET /automation/events` (user auth)
- Returns recent automation actions (last 100)
- Filter: `?symbol=EURUSD&from=2026-06-01&actionType=TRAILING_SL`
- Response: `{ ok, events: [...] }`

`POST /automation/events/:id/revert` (user auth)
- Reverts an automation action within 30 seconds
- Payload: `{ reason: "manual override" }`
- Returns: `{ ok, reverted: true, tradeState: {...} }`

---

## Automation Rules by Event

### Event 1: Auto-Confirm Trade

**Trigger**: Signal confidence ≥ A + HTF bias ≠ TRANSITIONAL + user confidence_threshold met

```
if (signal.confidence >= 0.70 && htfBias in [BULL, BEAR] && settings.autoConfirm) {
  status = APPROVED;
  timestamp = now;
  automation_event = { type: AUTO_CONFIRM, trade_id: X };
}
```

**Revert window**: 30 seconds (operator can cancel auto-confirm if price moves badly)

**Audit**: logged to `wp_smc_sf_automation_events` with `event_type='AUTO_CONFIRM'`

### Event 2: Trailing SL

**Trigger**: Trade open AND price moved ≥20 pips in profit direction

```
profitPips = (close - entry) × 10000; // for BUY
if (profitPips >= 20 && settings.trailingStop && tradeState.open) {
  if (sl_breakeven_not_set) {
    newSL = entry + 1 pip; // lock break-even
  } else if (profitPips % trailingStepPips == 0) {
    newSL += (trailingStepPips - 5) pips; // trail by step - 5 pips
  }
  send MT5 SL update;
  log event;
}
```

**Revert window**: 10 seconds (operator can restore original SL if unwanted)

**Audit**: logged to `wp_smc_sf_automation_events` with `event_type='TRAILING_SL'`

### Event 3: Partial Close at TP1

**Trigger**: Trade open AND price hit first fib TP level (first fib in direction)

```
if (close >= tp1 && settings.partialCloseEnabled && tradeState.open) {
  closeQuantity = lot_size × tp1_close_pct / 100; // 50% default
  OrderClose(closeQuantity, tp1 price);
  newSL = entry + 1 pip; // remaining position: SL = break-even
  log event;
}
```

**Revert window**: None (execution at market; reverting requires closing and re-opening). Operator can close remainder early.

**Audit**: logged as `event_type='PARTIAL_CLOSE'`

---

## Parity Target

N/A — Phase 8 is operational. Success is measured by:
- **Auto-confirm accuracy**: ≥90% of auto-confirmed trades close profitably or trail SL correctly
- **Trailing SL precision**: SL moves within 1 pip of formula
- **Partial close execution**: ≥95% of partial close orders fill within 1 candle
- **Revert rate**: <5% of events reverted by operator (indicates good automation timing)
- **Operator satisfaction**: <2 minute daily overhead for rule adjustments

---

## Phase 8 Gate Checklist

### Automated
- [x] `AutomationEngine.mqh` compiled and integrated
- [x] `/automation` dashboard route live
- [x] `PATCH /automation/settings/:symbol` endpoint live
- [x] `GET /automation/events` endpoint live
- [x] DB tables created
- [x] Revert window (30s for trade approval; 10s for SL) implemented

### Manual
- [ ] **Deploy Phase 8 code** to live MT5 terminal
- [ ] **Run 50+ trades with automation enabled** (mixed auto/manual confirmation)
- [ ] **Test trailing SL**: 10+ trades with 20+ pips profit; verify SL trails correctly
- [ ] **Test partial close**: 5+ trades hitting TP1; verify 50% close fills correctly
- [ ] **Test revert**: manually revert 5 automation events; verify undo works
- [ ] **Win rate validation**: ≥55% on Phase 8 trade sample (improved from Phase 7)
- [ ] **Zero orphaned trades**: no trades left open after session end

---

## Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Auto-confirm profitability | ≥90% of auto-confirmed trades profitable | Count: profitable / total auto-confirmed ≥ 0.90 |
| Trailing SL precision | ±1 pip vs formula | Sample 20 trailing events; max drift = 1 pip |
| Partial close execution | ≥95% fill within 1 candle | Count: filled within 1 candle / total ≥ 0.95 |
| Revert rate | <5% of events reverted | Count: reverted / total events < 0.05 |
| Win rate improvement | ≥55% on Phase 8 sample | Closed P&L: profit / (profit + loss) ≥ 0.55 |
| Operator overhead | <2 min daily | Time spent tweaking automation rules |
| Zero orphaned trades | 100% closed at session end | Audit: no open trades left at market close |

---

## Do Not Touch List

- Signal generation, confidence, AOV logic
- Fib calculations
- Regime engine
- Trade entry/SL/TP formulas (ExecutionEngine from Phase 7)

---

## Next Phase Gate

To proceed to **Phase 9 (SaaS & Licensing)**, this phase must achieve:
- ✅ 50+ trades executed with automation enabled
- ✅ Win rate ≥55%
- ✅ Trailing SL precision ±1 pip
- ✅ Partial close fill rate ≥95%
- ✅ Revert rate <5%
- ✅ Zero execution errors or orphaned trades
- ✅ Operator sign-off on automation rules UX

Once Phase 8 closes, Phase 9 introduces multi-user licensing and billing.
