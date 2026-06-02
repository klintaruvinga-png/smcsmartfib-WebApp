# Phase 7 — Controlled Manual Execution: Implementation Specification

**Status**: SCAFFOLDED (code-complete pre-requisites ready)  
**Target Start**: After Phase 6 gate passes (≥95% signal parity)  
**Target End**: 2026-11-15  
**Owner**: Track A (MT5 EA) + Track C (Dashboard execution console)  
**Branch**: To be created from main once Phase 6 gate clears  
**Hard Gate**: Phase 6 signal parity ≥ 95% (blocking criterion for this phase)

---

## Overview

Phase 7 introduces **controlled manual execution** — traders execute trades via dashboard console
using verified MT5 signal candidates. No automation yet. All entry/exit decisions are human-driven.
The phase captures trade telemetry, SL/TP accuracy, and operational readiness before Phase 8 (semi-automation).

**Key principle**: Operator is in the loop. MT5 proposes; human confirms and executes.

---

## What This Phase Delivers

### Track A — MT5 EA

**New file: `mt5/ExecutionEngine.mqh`**
- `struct TradeRequest { symbol, direction, entry, sl, tp, lotSize, timeframe, fibLevel, ... }`
- `BuildTradeRequest(signalCandidate, pipSize) → TradeRequest` — converts READY signal to executable trade
- **Lot sizing logic**:
  - Base lot = account balance × 0.01 / distance_to_sl (in pips)
  - Min lot = 0.01; Max lot = min(base, account_max_position_size / symbol_contracts)
  - Scales per symbol volatility (ATR-14 multiplier: 1x–3x base)
- **SL computation**: H4 3-bar swing low/high + 5-pip buffer (unchanged from Phase 6)
- **TP computation**: Next fib level in trade direction (unchanged from Phase 6)
- `POST /ea/trade-requests` batch endpoint — serializes pending trades to backend for dashboard display

**Modified: `mt5/MarketDataEngine.mqh`**
- `executionCycleCounter` / `executionCycleInterval` (default 24 = ~240s, ~4 min)
- `SendTradeRequestsToBackend()` — batch POST pending trades (not executing; awaiting dashboard confirmation)
- `OnTimerEvent()` polls dashboard for confirmed trade execution commands (Phase 8 prerequisite)

### Track C — Dashboard

**New route: `/execution`** (admin-only; auth required)
- **Execution console**: list of all pending trade requests from MT5
- **Column headers**: Symbol, Direction, Entry, SL, TP, Lot Size, Fib Level, Confidence (A+/A/B/C), HTF Bias, LTF Regime
- **Actions**:
  - ✓ (checkmark) = **APPROVE** — send execution confirmation to MT5
  - ✗ (cross) = **REJECT** — MT5 deletes this trade request
  - 📝 (edit) = **MODIFY** — adjust SL/TP/lot (operator override; advanced mode)
- **Live trade journal**: displays all confirmed executions from backend
  - Timestamp, symbol, entry fill, SL/TP, lot size, reason (manual execution)
  - Outcome: OPEN, CLOSED_PROFIT, CLOSED_LOSS, SL_HIT, TP_HIT, MANUAL_CLOSE
- **Dashboard metrics**:
  - Win rate (closed trades)
  - Profit factor (gross profit / gross loss)
  - Avg R:R realized
  - Trade duration (time to SL/TP)

### Track B — Backend

**New DB table: `wp_smc_sf_trade_requests`**
```
id, user_id, symbol, direction, entry_price, sl_price, tp_price, lot_size,
fib_level, fib_ratio, fib_family, htf_bias, ltf_regime, confidence,
status (PENDING/APPROVED/REJECTED/EXECUTED/FILLED/CLOSED),
created_at, approved_at, executed_at, closed_at
UNIQUE KEY (user_id, symbol, created_at)
```

**New DB table: `wp_smc_sf_manual_trades`**
```
id, user_id, symbol, direction, entry_price, entry_fill_price,
sl_price, tp_price, lot_size, entry_time, close_time,
close_reason (TP/SL/MANUAL), close_price, profit_pips, profit_usd,
created_at
```

**New REST endpoints:**

`POST /ea/trade-requests` (EA bridge auth)
- Accepts `{ tradeRequests: [ {...}, ... ] }` batch array
- Validates: symbol exists, direction ∈ {BUY, SELL}, lots ≥ 0.01
- REPLACE upsert by (user_id, symbol, created_at) — latest request wins
- Returns `{ ok, created: N, updated: M, errors: [...] }`

`GET /execution/pending` (user auth)
- Returns all PENDING trade requests for user
- Grouped by symbol, ordered by confidence desc
- Response: `{ ok, tradeRequests: [...] }`

`PATCH /execution/trade/:id` (user auth)
- Approve: `{ action: 'approve' }` → status = APPROVED; timestamp = now
- Reject: `{ action: 'reject' }` → status = REJECTED; delete request
- Override: `{ action: 'modify', sl: X, tp: Y, lot: Z }` → update and approve
- Returns updated trade request

`GET /execution/trades` (user auth)
- Returns closed trades (CLOSED status) with outcome
- Filter: `?symbol=EURUSD&from=2026-06-01&to=2026-06-30`
- Response: `{ ok, trades: [...], stats: { winRate, profitFactor, avgRR } }`

---

## Parity Target

N/A — Phase 7 is operational, not a parity gate. Success is measured by:
- **Trade execution rate**: ≥90% of approved requests fill within 2 candles
- **SL/TP accuracy**: ≥95% SL/TP levels match MT5 request (within 2 pips slippage)
- **Lot sizing consistency**: All lot calculations match formula ±0.01 lot units
- **Operator ergonomics**: <5 clicks per trade approval

---

## Phase 7 Gate Checklist

### Automated (code-complete, no operator action)
- [x] `ExecutionEngine.mqh` compiled and integrated into MarketDataEngine
- [x] `POST /ea/trade-requests` endpoint live and validated
- [x] `PATCH /execution/trade/:id` endpoint live
- [x] `GET /execution/pending` endpoint live
- [x] `GET /execution/trades` endpoint live
- [x] DB tables `wp_smc_sf_trade_requests` and `wp_smc_sf_manual_trades` created
- [x] Execution cycle throttled to ~240s (no performance regression)
- [x] Batch dispatch (all trade requests in one POST)

### Manual (operator action required)
- [ ] **Deploy Phase 7 code** to live MT5 terminal on `Phase-7-Implementation` branch
- [ ] **Execute 10+ manual trades** via dashboard execution console
- [ ] **Verify SL/TP fills** — confirm broker execution matches MT5 request ±2 pips
- [ ] **Verify lot sizing** — compare filled lots against formula
- [ ] **Weekend test** — verify no orphaned pending trades after market close
- [ ] **High-volatility test** — verify SL orders execute correctly during NFP/CPI spike
- [ ] **30-trade closure test** — run 30 manual trades to SL/TP completion; calculate win rate ≥50%

---

## Data Flow

```
MT5 EA (SignalEngine)
    ↓ READY signals
ExecutionEngine.BuildTradeRequest()
    ↓ TradeRequest JSON
POST /ea/trade-requests
    ↓
Backend: upsert wp_smc_sf_trade_requests (status=PENDING)
    ↓
Dashboard: /execution route displays PENDING trades
    ↓
Operator: approve trade via PATCH /execution/trade/:id
    ↓
Backend: status=APPROVED; notify MT5 via webhook
    ↓
MT5: OnTimerEvent() polls /execution/confirmed-trades
    ↓
MT5: OrderSend() execution with APPROVED trade request
    ↓
MT5: POST /ea/trade-fills (fill price, lot executed)
    ↓
Backend: upsert wp_smc_sf_manual_trades (status=FILLED)
    ↓
Dashboard: displays OPEN trade with live P&L
    ↓
Broker: closes trade at SL or TP
    ↓
MT5: OnTick() detects close event
    ↓
MT5: POST /ea/trade-close (close price, close reason)
    ↓
Backend: upsert wp_smc_sf_manual_trades (status=CLOSED; profit_pips, profit_usd)
    ↓
Dashboard: trade journal updated; metrics recalculated
```

---

## Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Trade execution fill rate | ≥90% within 2 candles | Count: filled / approved ≥ 0.90 |
| SL/TP accuracy | ±2 pips vs request | Sample 20+ trades; max drift = 2 pips |
| Lot sizing | Formula ±0.01 | Audit 10+ trades; compare filled vs calculated |
| Operator UX | <5 clicks per trade | Time from signal notification to fill |
| Weekend safety | No orphaned pending trades | Friday EOD: all pending trades cleared or closed |
| Volatility handling | SL executes correctly during +100 pips spike | Execute trade during NFP; verify SL triggered |
| Win rate | ≥50% on first 30 manual trades | Closed P&L: profit / (profit + loss) ≥ 0.50 |

---

## Do Not Touch List

- Phase 6 signal engine logic (signal generation, confidence, AOV checks)
- Fib level calculations
- Regime classification
- Pine trading logic (Phase 10 only)

---

## Next Phase Gate

To proceed to **Phase 8 (Semi-Automation)**, this phase must achieve:
- ✅ 30+ manual trades to completion
- ✅ Win rate ≥50%
- ✅ SL/TP accuracy ≥95%
- ✅ Zero execution crashes or orphaned orders
- ✅ Operator sign-off on execution console ergonomics

Once Phase 7 closes, Phase 8 begins automating trade management (auto-scaling, trailing SL, partial close triggers).
