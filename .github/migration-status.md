# SMC SuperFIB → MT5 Migration Status Board

**Last Updated**: 2026-05-07  
**Current Phase**: 0 (Stabilization)  
**Overall Progress**: 18%
**Status**: In Progress

> Snapshot: v13.0.0 MT5 authority hardening verified. EA-authoritative symbols now ignore stale Twelve Data cooldown and key-status escalation in health/blocker paths, MT5-live symbols bypass Twelve Data, EA pushes clear same-symbol TD cooldown state, backendSync receives EA heartbeats, and MT5 day-change derives from UTC-day M1 opens. On 2026-05-07 the watchlist persistence path was hardened as well: watchlist writes now invalidate the cached engine snapshot, symbol-set parity is checked before snapshot freshness timestamps, and frontend watchlist mutations are centralized with optimistic rollback/cancel guards to prevent flicker and ghost symbols. Phase 0 remains in stabilization pending live soak and candle-history aggregation verification.

---

## Phase Summary

| Phase | Objective | Status | % Complete | Blocker | Target End |
|-------|-----------|--------|-----------|---------|------------|
| 0 | Stabilize existing platform | IN-PROGRESS | 35% | Live soak + candle-history aggregation verification | 2026-05-17 |
| 1 | MT5 bridge infrastructure | NOT-STARTED | 0% | Phase 0 complete | 2026-06-01 |
| 2 | Read-only trade telemetry | NOT-STARTED | 0% | Phase 1 complete | 2026-06-15 |
| 3 | MT5 market data engine | NOT-STARTED | 0% | Phase 2 complete | 2026-07-15 |
| 4 | Fib engine migration | NOT-STARTED | 0% | Phase 3 complete | 2026-08-15 |
| 5 | Regime & chop engine | NOT-STARTED | 0% | Phase 4 complete | 2026-09-15 |
| 6 | Signal engine dual-run | NOT-STARTED | 0% | Phase 5 complete | 2026-10-15 |
| 7 | Controlled manual execution | NOT-STARTED | 0% | Phase 6 parity >95% | 2026-11-15 |
| 8 | Semi-automation layer | NOT-STARTED | 0% | Phase 7 complete | 2026-12-01 |
| 9 | SaaS & licensing system | NOT-STARTED | 0% | Phase 8 complete | 2026-12-15 |
| 10 | Pine transition strategy | NOT-STARTED | 0% | Phase 9 complete | 2027-01-01 |

---

## Track Assignments

| Track | Lead | Phase Focus | Status |
|-------|------|------------|--------|
| **Track A — MT5 EA** | *TBD* | Phases 1–7 (bridge, telemetry, candle engine, fib, regime, signal, execution) | NOT-STARTED |
| **Track B — Backend** | *TBD* | Phases 1–9 (APIs, freshness, telemetry, licensing) | NOT-STARTED |
| **Track C — Dashboard** | *TBD* | Phases 2–9 (visualization, execution console, analytics) | NOT-STARTED |

---

## Phase 0: Stabilize Existing Platform

**Objective**: Fix current dashboard/backend instability before migration  
**Owner**: Track B  
**Status**: IN-PROGRESS
**Completion Target**: 2026-05-17

### Deliverables
- [x] Refresh stability hardening: server-time MT5 snapshots, MT5-live TD bypass, same-symbol TD cooldown clearing, and no stale-timestamp corruption in the covered paths
- [x] EA authority hardening: stale Twelve Data rate-limit/key-status state no longer overrides EA-owned symbol health or engine blocker decisions
- [x] Watchlist persistence hardening: watchlist writes invalidate engine snapshot cache and dashboard watchlist mutations no longer race against stale local/query state
- [ ] Signal engine stability: deterministic LIVE/STALE states, proper regime gating, valid freshness rules
- [ ] Backend parity: Pine/backend/dashboard alignment verified

### Success Criteria
- [ ] Price feed stable for 72h+
- [ ] Signal engine remains consistent
- [x] No false LIVE states in covered MT5 snapshot/feed-health regression paths
- [x] No stale-loop deadlocks in covered same-symbol MT5/TD cooldown regression paths
- [x] No false `rate-limited` or `blocked` state for EA-authoritative symbols from stale Twelve Data cooldown/key status
- [x] No stale engine snapshot reuse in covered watchlist add/remove/save paths after symbol-set changes

### Test Checklist
- [ ] Refresh for 24h+
- [ ] Market-open session testing
- [ ] Weekend behavior
- [ ] Disconnect/reconnect testing
- [ ] Backend restart testing
- [ ] MT5 M1 -> 15min aggregation verification for symbols previously showing `insufficient candle history`
- [x] Repo soak tracker added: `.github/migration/PHASE0_SOAK_TRACKER.md`
- [x] Repo log instrumentation added for `PHASE0_SOAK` backend + Live Radar console warnings

### Parity Status
```
Pine ↔ Backend Signal: [PENDING]
Backend → Dashboard: [PENDING]
Freshness Logic: [PENDING]
```

### Blockers
- Live 24h/72h soak evidence not complete
- MT5 M1 -> 15min candle-history aggregation path still needs focused verification
- Phase 0 completion log and final parity audit are not yet written to `.github/migration/phase-updates/` and `.github/migration/audits/`

---

## Phase 1: MT5 Bridge Infrastructure

**Objective**: Create stable communication between MT5 and backend  
**Owner**: Track A + Track B  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 0 complete  
**Completion Target**: 2026-06-01

### Deliverables
- [ ] MT5 Bridge EA: heartbeat, account sync, symbol sync, terminal telemetry
- [ ] Backend APIs: `POST /heartbeat`, `POST /account-sync`, `POST /symbol-sync`, `GET /license-check`

### Success Criteria
- [ ] Heartbeat stable for 48h+
- [ ] No dropped sessions
- [ ] Reconnect works automatically

### Test Checklist
- [ ] Terminal restart
- [ ] VPS restart
- [ ] Internet interruption
- [ ] Duplicate heartbeat protection
- [ ] Invalid license rejection

### Blockers
- *Phase 0 not complete*

---

## Phase 2: Read-Only Trade Telemetry

**Objective**: Pull real account/trade state into backend/dashboard  
**Owner**: Track A + Track B + Track C  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 1 complete  
**Completion Target**: 2026-06-15

### Deliverables
- [ ] EA Sync Systems: open positions, pending orders, account metrics, trade history
- [ ] Dashboard Panels: account card, live positions, floating P/L, hedge grouping, sync health

### Success Criteria
- [ ] Dashboard matches MT5 terminal exactly
- [ ] No stale positions
- [ ] No duplicate tickets

### Test Checklist
- [ ] Manual trade open/close
- [ ] Partial close
- [ ] SL/TP modification
- [ ] Broker reconnect
- [ ] Weekend reopen

### Blockers
- *Phase 1 not complete*

---

## Phase 3: MT5 Market Data Engine

**Objective**: EA becomes authoritative market-data collector  
**Owner**: Track A + Track B  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 2 complete  
**Completion Target**: 2026-07-15

### Deliverables
- [ ] EA Candle Engine: OHLC, spreads, sessions, tick movement, volatility metrics
- [ ] Backend Freshness Layer: `quote_updated_at`, `last_seen_at`, stagnation state, feed health

### Success Criteria
- [ ] No fake-live states
- [ ] No frozen live feeds
- [ ] Fresh/stale detection accurate

### Test Checklist
- [ ] Low/high volatility
- [ ] Weekend freeze
- [ ] Broker lag
- [ ] Symbol suffix handling

### Blockers
- *Phase 2 not complete*

---

## Phase 4: Fib Engine Migration

**Objective**: Port fib calculations into MT5, validate against Pine  
**Owner**: Track A  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 3 complete  
**Completion Target**: 2026-08-15

### Deliverables
- [ ] MT5 Fib Engine: Swap Fib 1, Bull Run Fib, Swap Fib 2, extensions, premium/discount zones
- [ ] Fib Parity Validator comparing anchors, levels, zones, extensions

### Success Criteria
- [ ] 99%+ fib parity across all supported pairs/timeframes

### Test Checklist
- [ ] Historical replay
- [ ] Volatile markets
- [ ] Weekend gaps
- [ ] Missing candles
- [ ] Broker suffix normalization

### Parity Status
```
MT5 Fib vs Pine Fib: [PENDING]
Anchor Consistency: [PENDING]
Zone Accuracy: [PENDING]
```

### Blockers
- *Phase 3 not complete*

---

## Phase 5: Regime & Chop Engine Migration

**Objective**: Move regime classification into MT5, validate against Pine  
**Owner**: Track A  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 4 complete  
**Completion Target**: 2026-09-15

### Deliverables
- [ ] MT5 Regime Engine: trending, ranging, chop detection, volatility gating
- [ ] Regime Parity Reports tracking disagreements, edge cases, stale classifications

### Success Criteria
- [ ] 95%+ regime parity
- [ ] Stable chop detection

### Test Checklist
- [ ] Ranging/breakout markets
- [ ] High-news volatility
- [ ] Illiquid sessions

### Parity Status
```
MT5 Regime vs Pine Regime: [PENDING]
Chop Detection: [PENDING]
Volatility Gating: [PENDING]
```

### Blockers
- *Phase 4 not complete*

---

## Phase 6: Signal Engine Dual-Run

**Objective**: MT5 generates signals in parallel with Pine; Pine authoritative  
**Owner**: Track A + Track B  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 5 complete  
**Completion Target**: 2026-10-15

### Deliverables
- [ ] MT5 Signal Engine: entries, SL, TP, confluence, regime alignment
- [ ] Signal Drift Analyzer classifying: exact match, acceptable drift, critical mismatch

### Success Criteria
- [ ] 95%+ signal parity over large sample size

### Test Checklist
- [ ] Live sessions
- [ ] Historical replay
- [ ] Multi-pair testing
- [ ] Edge-case fib conditions

### Parity Status
```
MT5 Entry vs Pine Entry: [PENDING]
SL/TP Parity: [PENDING]
Confluence Detection: [PENDING]
```

### Blockers
- *Phase 5 not complete*
- **GATE**: Phase 7+ execution blocked until Phase 6 parity ≥95%

---

## Phase 7: Controlled Manual Execution

**Objective**: Enable safe dashboard-triggered execution (NOT auto)  
**Owner**: Track A + Track B + Track C  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 6 parity ≥95%  
**Completion Target**: 2026-11-15

### Deliverables
- [ ] Execution Engine: buy/sell, pending orders, SL/TP updates, cancel order
- [ ] Risk Guardrails rejecting: oversize lots, invalid SL, no-trade-zone entries, duplicate family entries

### Success Criteria
- [ ] 100% execution reconciliation accuracy

### Test Checklist
- [ ] Market execution
- [ ] Pending orders
- [ ] Requotes/slippage
- [ ] Disconnect during execution

### Execution Audit Trail
- *To be implemented*

### Blockers
- *Phase 6 parity not confirmed (≥95% required)*

---

## Phase 8: Semi-Automation Layer

**Objective**: Allow signal approval workflows  
**Owner**: Track B + Track C  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 7 complete  
**Completion Target**: 2026-12-01

### Deliverables
- [ ] Workflow: Signal generated → approval queue → execute → terminal confirmation
- [ ] Approval Console: risk, regime, exposure, hedge impact

### Success Criteria
- [ ] No unauthorized execution
- [ ] Full audit visibility

### Blockers
- *Phase 7 not complete*

---

## Phase 9: SaaS & Licensing System

**Objective**: Commercialize platform  
**Owner**: Track B  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 8 complete  
**Completion Target**: 2026-12-15

### Deliverables
- [ ] License Server: users, accounts, subscriptions, EA sessions
- [ ] Anti-Piracy Layer: account lock, heartbeat validation, remote disable
- [ ] Tier System (Basic | Pro | Elite | Institutional)

### Success Criteria
- [ ] Stable license enforcement
- [ ] No duplicate account abuse

### Blockers
- *Phase 8 not complete*

---

## Phase 10: Pine Transition Strategy

**Objective**: Reduce Pine from core engine to companion layer  
**Owner**: Track A  
**Status**: NOT-STARTED  
**Prerequisites**: Phase 9 complete  
**Completion Target**: 2027-01-01

### Final Role of Pine
- Marketing layer
- Lightweight chart visualization
- Onboarding product
- Signal preview tool
- **NOT**: Primary execution authority

### Blockers
- *Phase 9 not complete*

---

## Automated Escalations & Critical Issues

| Issue | Severity | Detected | Phase Impact | Status |
|-------|----------|----------|--------------|--------|
| `engine_runs` heartbeat row growth needs pruning policy | Low | 2026-05-05 v13 verification | Phase 0 maintenance | Deferred; add WP-Cron cleanup after live soak sets retention window |
| Non-EA watchlist symbols can still show TD `rate-limited` | Medium | 2026-05-05 v13 verification | Health display for TD-dependent symbols | Accepted behavior; do not clear globally from EA pushes |

> **New escalations automatically flagged** by phase monitoring agent when:
> - Parity drops below threshold
> - Critical bug scan report ingested
> - Branch stalled (7+ days no commits)
> - Success criteria verification fails

---

## Recent Bug Scan Reports

| Report | Date | Phase | Issues Found | Status |
|--------|------|-------|--------------|--------|
| `BUG_SWEEP_REPORT_2026-05-05_V13-MT5-Authority-Verification.md` | 2026-05-05 | 0 | 0 blockers; 2 deferred maintenance items | Verified |
| `BUG_SWEEP_REPORT_2026-05-05_MT5-Candle-Ingestion-Verification.md` | 2026-05-05 | 0 | Candle ingestion verified; hourly/reconnect checks pending | Verified |
| `BUG_SWEEP_REPORT_2026-05-04_POST_PATCH_VERIFICATION.md` | 2026-05-04 | 0 | 40/40 regression pass; 3 deferred risks | Verified |

> **Auto-ingested from**: `.github/docs/BUG_SWEEP_REPORT_*.md`

---

## Weekly Status Snapshots

| Week | Generated | Phases On-Track | Phases At-Risk | Phases Blocked | Action Items |
|------|-----------|-----------------|----------------|----------------|--------------|
| 2026-W18 | Pending | — | — | — | — |

> **Auto-generated**: Every Sunday by migration project manager agent
> **Location**: `.github/migration/weekly-status-[YYYY-MM-DD].md`

---

1. ✋ **Never migrate multiple engines simultaneously** — phases are sequential gates
2. ✋ **Every migration phase must achieve parity before next phase** — slip parity = prevent advancement
3. ✋ **Never remove Pine authority until MT5 parity proven** — dual-run validation is mandatory
4. ✋ **Execution only comes after analytical parity** — no trades before Phase 6 validation

---

## Migration Velocity

| Phase Group | Duration | Buffer |
|-------------|----------|--------|
| Phases 0–2 | 2–4 weeks | 1 week |
| Phases 3–5 | 4–8 weeks | 1 week |
| Phases 6–7 | 4–6 weeks | 1 week |
| Phases 8–10 | 4–8 weeks | 1 week |
| **TOTAL** | **~4–6 months** | **Recommended** |

---

## Document Links

- Migration Plan: [See root migration specification]
- Parity Audit Archives: `.github/migration-audits/`
- Phase Checklists: `.github/migration/checklists/`
- Test Logs: `.github/migration/test-logs/`
- Risk Register: `.github/migration/risk-register.md`

---

## How to Use This Board

### Manual Phase Diagnostics
- **Status Sync**: Run `/mt5-migration Phase [X] readiness check` to audit phase success criteria, parity, active branches, and risk
- **Status Overview**: Run `/mt5-migration Phase status board` to see all 11 phases at a glance
- **Parity Check**: Run `/mt5-migration Validate parity Phase [X]` to audit fib/regime/signal consistency from latest reports
- **Risk Assessment**: Run `/mt5-migration Risk assessment` to identify all blockers, dependencies, and team track conflicts
- **Generate Checklist**: Run `/mt5-migration Create Phase [X] checklist` to get detailed task list with success criteria
- **Update Status**: Run `/mt5-migration Update Phase [X] status: [in-progress|blocked|complete]` to record progress

### Automated Operations
- **Weekly Reports** (auto-generated every Sunday):
  - Location: `.github/migration/weekly-status-[YYYY-MM-DD].md`
  - Contains: All phases, trends, go/no-go gates, action items
  
- **Branch Monitoring** (polled every 30 min):
  - Tracks: `mt5-*`, `backend-*`, `dashboard-*` branch activity
  - Flags: Stalled branches (7+ days), commit velocity per track
  - Run: `/mt5-migration Branch activity report` to see current status
  
- **Critical Escalations** (immediate):
  - Triggered when: Parity drops, blocker detected, criteria fails
  - Format: Includes severity, impact, corrective actions
  - Review: `/mt5-migration Review blockers` to see all active escalations

### Data Ingestion
- **Bug Scan Reports** (manual trigger):
  - Run: `/mt5-migration Ingest bug report [filename]` to parse automated scan outputs
  - Auto-extracted: Parity metrics, blockers, severity levels
  - Parsed from: `.github/docs/BUG_SWEEP_REPORT_*.md`

---

## Key Contacts & Team Tracks

| Track | Lead | Email | Scope | Status |
|-------|------|-------|-------|--------|
| Track A — MT5 EA | *TBD* | *TBD* | Phases 1–7 | NOT-STARTED |
| Track B — Backend | *TBD* | *TBD* | Phases 1–9 | NOT-STARTED |
| Track C — Dashboard | *TBD* | *TBD* | Phases 2–9 | NOT-STARTED |
