# SMC SuperFIB → MT5 Migration Status Board

**Last Updated**: 2026-07-15
**Current Phase**: BACKEND-2 WordPress-Free Restoration (Active) + Phase 4 (Read-Only Testing)
**Overall Progress**: 88% MT5 Migration + BACKEND-1 COMPLETE (foundation: auth, settings, market data) + BACKEND-2 WordPress-Free Restoration IN-PROGRESS (started 2026-07-17)
**Status**: Phase 0 COMPLETE — Phase 1 COMPLETE (2026-05-20) — Phase 2 COMPLETE (2026-05-22) — Phase 3 COMPLETE (2026-05-25; T0 admin baseline captured 2026-05-27, conditional closeout cleared) — Phase 4 READ-ONLY TESTING (code complete; corrected H4 runtime verified 2026-05-28; synthetic parity tooling PASS recorded; live paired exports plus weekend/sparse-data evidence still missing) — BACKEND-1 COMPLETE (2026-07-17; auth + settings + market-data endpoints, 47 tests) — BACKEND-2 IN-PROGRESS (2026-07-17; WordPress-free restoration, service-oriented architecture) — Phases 5/5B/6 CODE COMPLETE (pre-emptive; gated on Phase 4) — Phases 7–9 SCAFFOLDED (gated)

> **Strategy change (2026-07-17)**: WordPress is treated as **permanently down**. The prior shadow-mode / dual-write / WordPress-as-fallback strategy is retired. The new BACKEND-2 plan ([plans/backend-2-restoration-plan.md](../plans/backend-2-restoration-plan.md)) removes all WordPress references, standardizes on JWT, and rebuilds the backend around domain services. There is no WordPress cutover or decommission phase — WordPress compatibility is removed outright.

> Snapshot: Phase 0 gate passed 2026-05-15. Post-fix validation soak at 16:37 UTC confirmed NAS100 (29,263.70) and US30 (49,756.00) both LIVE during active US equity session; XAUUSD (4,556.34) LIVE with candle-history gate cleared. Backend soak: 259,464 engine runs / 0 errors / 69,262 candles over 24h. Frontend feed-status chip lag (BUG-001 staleTime:0) resolved. Watchlist persistence 100% parity. AUDUSD/ETHUSD chop-gate classified as correct live behavior — not a blocker. Full closeout evidence: `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`.

---

## Control Update - 2026-06-06

Phase 4 remains the active migration blocker. Do not reopen Phase 0-3 gates, and do not advance Phase 5 until the live paired MT5-vs-Pine fib gate passes.

Weekend control note: Phase 4 parity should not be rerun as a real gate during weekend market closure because the instruments in the test files will have stale M15 candles. Any parity failure during this window is expected and should not be treated as new fib/regime/signal evidence.

Next valid Phase 4 action: wait until markets reopen and MT5 has fresh closed M15 candles for every test symbol, then recapture a synchronized MT5 fib export snapshot and matching M15 candle set in the same broker/feed window before rerunning `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1`.

The latest evidence shows:

- Initial 2026-06-02/03 live paired-export artifacts (`reports/phase4-gate.json`, `reports/phase4-parity/phase4-gate.json`) failed at `40.89%` parity with `227` critical mismatches.
- Corrected 2026-06-03 evidence (`reports/phase4-parity/phase4-gate-2026-06-03-corrected.json`) failed at `0.26%` parity with `383` critical mismatches.
- Committed 2026-06-04 gate artifacts exist under `reports/phase4-parity/phase4-gate-2026-06-04_*.json`; for example `_173401` failed at `51.04%` parity with `47` critical mismatches across `96` tuples.
- A later 2026-06-04 stale-candle attempt was blocked before producing an additional gate artifact because Pine level generation rejected stale M15 candle exports before parity validation.
- Weekend gate attempts are data-invalid until all Phase 4 symbols have fresh newly closed M15 candles after market reopen.
- Final Phase 4 closeout still requires 99%+ paired-export parity, zero critical mismatches, weekend/sparse-data evidence, and operator export acceptance.

Phase 4A is authorized only as parallel hardening and contract work. It must not change fib math, regime scoring, signal gates, or dashboard signal truth during the active Phase 4 soak unless explicitly marked read-only.

---

## Architecture Refactor Alignment - 2026-06-17

Phase 4 remains the active migration blocker. The architecture review in `reports/architecture-review-clean-hexagonal-plan-2026-06-17.md` does not reopen any closed gate and does not change the current sequencing authority of this migration board.

The following controls apply immediately:

- Phases 0-3 remain closed and receive no new refactor tasks.
- Plugin-refactor work for Phases 1-4 is closed; Phases 5-9 refactor ownership is defined in the table below and gated on their respective migration phase prerequisites.
- Phase 4A is the only authorized parallel refactor lane during the active Phase 4 soak.
- No refactor task may imply that Phase 5 can start before Phase 4 closes, that Phase 6 can start before Phase 5B closes, or that Phase 7 can start before Phase 6 parity clears.

| Migration phase | Authorized refactor work                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4A              | Source-of-truth documentation, route-to-use-case mapping, projection/cache inventory, shared-contract duplication inventory, authority governance checklist |
| 5               | Regime truth consolidation                                                                                                                                  |
| 5B              | Macro overlay contract ownership                                                                                                                            |
| 6               | Signal truth and projection isolation                                                                                                                       |
| 7               | Trade-plan truth consolidation                                                                                                                              |
| 8               | Approval workflow separation                                                                                                                                |
| 9               | License truth consolidation                                                                                                                                 |

Not before:

- Shared contracts package runtime adoption is not authorized before Phase 5/6 readiness.
- MT5 transport/domain split is not authorized before Phase 6.
- WordPress monolith shrink work is not authorized before later post-authority stabilization (superseded by BACKEND-5 architecture refactoring and WordPress decommissioning phase)

> **2026-07-17 revision**: Because WordPress is permanently down, the "WordPress monolith shrink" restriction no longer applies — removing WordPress references is now the **first** step of BACKEND-2a, not a deferred post-stabilization task. The MT5/contract restrictions above remain in force.

Live planning artifacts for this alignment:

- `reports/source-of-truth-matrix-2026-06-17.md`
- `reports/route-to-use-case-map-2026-06-17.md`
- `reports/projection-and-contract-inventory-2026-06-17.md`
- `reports/codebase-refactor-log.md`

---

## Control Update - 2026-07-15

Backend migration is now the primary development focus. MT5 Phase 4 continues in read-only testing mode - no code changes to MT5 engines during backend migration.

Phase 4 parity validation continues as scheduled, but development resources shift to backend implementation.

**Note**: The backend migration plan (BACKEND-0 through BACKEND-5) supersedes the earlier WordPress decommissioning restriction in the Architecture Refactor Alignment section. The new plan provides a structured, phased approach to WordPress decommissioning as part of the overall backend migration.

---

## Control Update - 2026-07-17 (WordPress-Free BACKEND-2)

The WordPress backend (`https://trader.stokvelsociety.co.za/wp-json`) is **permanently down**; the dashboard currently cannot function against it. The backend migration strategy is revised accordingly:

- **No shadow-mode sync.** `GET /api/admin/shadow-validation` and the WordPress REST client are removed from scope. There is no live WordPress source to validate against.
- **No dual-write / WordPress-as-fallback.** The old BACKEND-2 ("MT5 integration and dual-write configuration") is redefined — see below.
- **WordPress compatibility removed outright.** `VITE_SNIPER_BACKEND_URL` → `VITE_API_URL`; WordPress-nonce fallback and `resolveDefaultBackendUrl()` removed; `WORDPRESS_API_URL` / `WORDPRESS_API_KEY` dropped from config.
- **JWT is the only auth model.** `X-EA-API-Key` remains for `/api/ea/*` ingest; no WordPress cookie/nonce path.
- **Service-oriented architecture.** Domain services (SnapshotService, SignalService, ChartService, MarketDataService, TelemetryService) own DB access, validation, and business logic; route handlers become thin wrappers.
- **MT5 ingestion is read-only first.** EA writes prices/heartbeats/account telemetry; order/execution endpoints deferred.

**Revised BACKEND phase map:**

| Phase | Old scope | New scope |
| ----- | --------- | --------- |
| BACKEND-0 | Foundation setup | COMPLETE (DB layer, shared contracts, provider wiring pending) |
| BACKEND-1 | Core API (auth, settings, market data) | COMPLETE (2026-07-17; 47 tests) |
| BACKEND-2 | MT5 dual-write + cutover prep | **REDEFINED** → WordPress-Free Restoration (7 sub-phases, 15–23 days) |
| BACKEND-3 | Signal & plan endpoints | Folded into BACKEND-2 (Phase 4) |
| BACKEND-4 | Transition & cutover | Obsolete — no WordPress to cut over from |
| BACKEND-5 | Architecture refactor + WP decommission | Obsolete — WP compatibility removed in BACKEND-2 Phase 1 |

BACKEND-3/4/5 as previously defined are **superseded**. Their intent (signal endpoints, architecture hardening) is absorbed into BACKEND-2.

---

## Phase Summary

| Phase | Objective                               | Status            | % Complete | Blocker                                                                                    | Target End            |
| ----- | --------------------------------------- | ----------------- | ---------- | ------------------------------------------------------------------------------------------ | --------------------- |
| 0     | Stabilize existing platform             | **COMPLETE**      | 100%       | None — gate passed 2026-05-15                                                              | 2026-05-15 ✅         |
| 1     | MT5 bridge infrastructure               | **COMPLETE**      | 100%       | None — gate passed 2026-05-20                                                              | 2026-06-01 ✅         |
| 2     | Read-only trade telemetry               | **COMPLETE**      | 100%       | None — gate passed 2026-05-22                                                              | 2026-05-22 ✅         |
| 3     | MT5 market data engine                  | **COMPLETE**      | 100%       | None — gate cleared; T0 admin baseline captured 2026-05-27                                 | 2026-05-25 ✅         |
| 4     | Fib engine migration                    | **READ-ONLY TESTING** | 75%        | Paired MT5/Pine exports + weekend/sparse-data evidence (no code changes during backend migration) | 2026-08-15            |
| 4A    | Production hardening + domain contracts | **READY**         | 0%         | Parallel only; no fib/regime/signal scoring changes during Phase 4 soak                    | Parallel with Phase 4 |
| 5     | Regime & chop engine                    | **CODE COMPLETE** | 70%        | Phase 4 live gate + operator deployment                                                    | 2026-09-15            |
| 5B    | Fundamentals regime feed                | **CODE COMPLETE** | 65%        | Phase 5 parity gate                                                                        | 2026-10-01            |
| 6     | Signal engine dual-run                  | **CODE COMPLETE** | 60%        | Phase 5B gate + fib→signal wiring sprint                                                   | 2026-10-15            |
| 7     | Controlled manual execution             | **SCAFFOLDED**    | 35%        | Phase 6 parity ≥ 95% (hard gate)                                                           | 2026-11-15            |
| 8     | Semi-automation layer                   | **SCAFFOLDED**    | 20%        | Phase 7 complete                                                                           | 2026-12-01            |
| 9     | SaaS & licensing system                 | **SCAFFOLDED**    | 20%        | Phase 8 complete                                                                           | 2026-12-15            |
| 10    | Pine transition strategy                | NOT-STARTED       | 0%         | Phase 9 complete                                                                           | 2027-01-01            |
| BACKEND-0 | Foundation setup (contracts, database, project structure) | COMPLETE | 90% | PostgreSQL provider wiring (non-blocking) | 2026-07-22 |
| BACKEND-1 | Core API implementation (auth, settings, market data) | COMPLETE | 100% | None — 47 integration tests green | 2026-07-17 ✅ |
| BACKEND-2 | **WordPress-Free Restoration** (service layer + app-boot/core-trading endpoints + MT5 read-only ingest + data migration) | IN-PROGRESS | 0% | BACKEND-1 complete; WordPress permanently down | 2026-08-09 (15–23 day window) |
| BACKEND-3 | _Superseded_ — signal/plan endpoints folded into BACKEND-2 Phase 4 | — | — | — | — |
| BACKEND-4 | _Superseded_ — no WordPress cutover to perform | — | — | — | — |
| BACKEND-5 | _Superseded_ — WP compatibility removed in BACKEND-2 Phase 1 | — | — | — | — |

---

## Track Assignments

| Track                   | Lead  | Phase Focus                                                                   | Status                                                                                     |
| ----------------------- | ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Track A — MT5 EA**    | admin | Phases 1–7 (bridge, telemetry, candle engine, fib, regime, signal, execution) | Phase 1 COMPLETE (2026-05-20) — Phase 2 implementation validated by Track A signoff        |
| **Track B — Backend**   | admin | Phases 1–9 (APIs, freshness, telemetry, licensing) + BACKEND MIGRATION (WordPress → Node.js) | Phase 1 COMPLETE (2026-05-20) — Phase 2 implementation validated by Track B signoff — BACKEND MIGRATION STARTED (2026-07-15) |
| **Track C — Dashboard** | admin | Phases 2–9 (visualization, execution console, analytics)                      | Phase 0 complete — Phase 2 dashboard read-only implementation validated by Track C signoff |

---

## Phase 0: Stabilize Existing Platform

**Objective**: Fix current dashboard/backend instability before migration  
**Owner**: Track B  
**Status**: COMPLETE  
**Completed**: 2026-05-15  
**Completion Target**: 2026-05-17

### Deliverables

- [x] Refresh stability hardening: server-time MT5 snapshots, MT5-live TD bypass, same-symbol TD cooldown clearing, and no stale-timestamp corruption in the covered paths
- [x] EA authority hardening: stale Twelve Data rate-limit/key-status state no longer overrides EA-owned symbol health or engine blocker decisions
- [x] Watchlist persistence hardening: watchlist writes invalidate engine snapshot cache and dashboard watchlist mutations no longer race against stale local/query state
- [x] 72h restart-soak evidence captured and closeout log written: `.github/migration/archive/phase-0-updates-prior-to-2026-05-15/phase-0-completion-2026-05-14.md`
- [x] Signal engine stability: NAS100/US30 LIVE confirmed at 16:37 UTC 2026-05-15 (active US equity session); XAUUSD LIVE with candle-history gate cleared
- [x] Backend parity: Pine/backend/dashboard alignment verified — 100% on all audited paths

### Success Criteria

- [x] Price feed stable for 72h+ — 259,464 engine runs / 0 errors / 69,262 candles/24h
- [x] Signal engine remains consistent — NAS100, US30, XAUUSD all LIVE and BACKEND-confirmed in Signal Engine
- [x] No false LIVE states in covered MT5 snapshot/feed-health regression paths
- [x] No stale-loop deadlocks in covered same-symbol MT5/TD cooldown regression paths
- [x] No false `rate-limited` or `blocked` state for EA-authoritative symbols from stale Twelve Data cooldown/key status
- [x] No stale engine snapshot reuse in covered watchlist add/remove/save paths after symbol-set changes

### Test Checklist

- [x] Refresh for 24h+ (72h soak completed; extended to T+96h+ for post-fix validation)
- [x] Market-open session testing — NAS100 (29,263.70) and US30 (49,756.00) LIVE at 16:37 UTC 2026-05-15 (US equity session active)
- [ ] Weekend behavior — deferred; no blocking evidence
- [ ] Disconnect/reconnect testing — deferred; no blocking evidence
- [x] Backend restart — EA alias fix reloaded; batch timestamps advanced past 16:37 UTC 2026-05-15
- [x] EA restart + 7.5h accumulation — XAUUSD candle-history gate cleared by 2026-05-15
- [x] Repo soak tracker added: `.github/migration/PHASE0_SOAK_TRACKER.md`
- [x] Repo log instrumentation added for `PHASE0_SOAK` backend + Live Radar console warnings
- [x] Frontend feed-status chip cache lag fixed: `staleTime: 0` on `useEngineHealth()`
- [x] Watchlist persistence: 100% parity audit, PHP + Vitest suites green

### Parity Status

```text
Pine <-> Backend Signal: [PASS on audited paths]
Backend -> Dashboard: [PASS on audited admin/dashboard surfaces]
Freshness Logic: [PASS - NAS100/US30/XAUUSD all live during active session]
Watchlist Authority: [PASS - 100% parity]
```

### Blockers

- ~~NAS100 / US30 freshness~~ — **RESOLVED 2026-05-15**: Both LIVE at 16:37 UTC during active US equity session.
- ~~XAUUSD candle-history readiness~~ — **RESOLVED 2026-05-15**: LIVE with BUY gate; candle-history gate cleared.
- **AUDUSD / ETHUSD chop-gate** — Classified as correct engine behavior (Explanation A). No code change. Not a blocker.
- ~~Frontend feed-status chip lag~~ — **RESOLVED 2026-05-15**: BUG-001 fixed with `staleTime: 0`.
- ~~Watchlist persistence~~ — **RESOLVED 2026-05-15**: 100% parity, regression suites green.

**Final closeout artifact**: `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`

---

## Phase 1: MT5 Bridge Infrastructure

**Objective**: Create stable communication between MT5 and backend  
**Owner**: Track A + Track B  
**Status**: COMPLETE  
**Completed**: 2026-05-20  
**Prerequisites**: Phase 0 complete ✅  
**Completion Target**: 2026-06-01 ✅

→ Detailed roadmap: [PHASE1_BRIDGE_ROADMAP.md](./migration/PHASE1_BRIDGE_ROADMAP.md)  
→ Live tracker: [PHASE1_TRACKER.md](./migration/PHASE1_TRACKER.md)  
→ Task checklist: [PHASE1_CHECKLIST.md](./migration/PHASE1_CHECKLIST.md)

### Deliverables

- [x] MT5 Bridge EA: heartbeat, account sync, symbol sync, terminal telemetry (deployed on branch `fix/gate-heartbeat-debug-log-behind-flag`; all 5 routes confirmed operational)
- [x] Backend APIs: `POST /ea/heartbeat`, `POST /ea/account-sync`, `POST /ea/symbol-sync`, `GET /ea/license-check` (implemented and regression-covered)

### Success Criteria

- [x] `GET /ea/license-check` — hard gate, blocks startup if denied (✅ PASS: confirmed 2026-05-18)
- [x] `POST /ea/account-sync` — persists account metadata (✅ PASS: account_id=32206603 stored)
- [x] `POST /ea/symbol-sync` — syncs all broker symbols (✅ PASS: 27 symbols upserted)
- [x] `POST /ea/heartbeat` — fires on configured throttle (✅ PASS: confirmed every ~480 sec = 8 min)
- [x] `POST /ea/market-stream` — existing route operational (✅ PASS: auth working; FX stale during weekend, crypto fresh = expected)
- [x] Heartbeat stable for 48h+ (✅ PASS: 48h+ confirmed 2026-05-20 per phase1-bridge-48h-continuity-complete-2026-05-20.md)
- [x] No dropped sessions observed in executed scenario-validation runs
- [x] Reconnect works automatically after restart/outage

### Test Checklist (All items complete)

- [x] License-check gate (✅ confirmed working)
- [x] Account-sync dispatch (✅ confirmed working)
- [x] Symbol-sync dispatch (✅ confirmed working)
- [x] Heartbeat dispatch (✅ confirmed working at ~8 min intervals)
- [x] Market-stream dispatch (✅ confirmed working; auth passing)
- [x] Terminal restart scenario
- [x] VPS restart scenario (validated via bundled outage-recovery test under shared-hosting constraints)
- [x] Internet interruption scenario (bundled with the shared-hosting outage-recovery test)
- [x] Duplicate heartbeat protection scenario
- [x] Invalid license rejection scenario

### Live Validation Evidence

```text
Heartbeat Confirmed:
- EA logs: [Heartbeat] Dispatch | user_id=1 | account_id=32206603 | [Heartbeat] OK. (2026-05-18 ~00:31, 01:47 UTC)
- PHP logs: SMC SuperFIB EA heartbeat received: user_id=1 account_id=32206603 terminal_id=FB9A56D617EDDDFE29EE54EBEFFE96C1 connected=1 (2026-05-17 22:51, 23:18, 23:37 UTC)
- SQL DB: wpup_smc_sf_engine_runs table shows 49 heartbeat rows with status=heartbeat, created_at 2026-05-18 00:07:13 → 00:07:34

Account Sync Confirmed:
- user_id=1, account_id=32206603, terminal_id=FB9A56D617EDDDFE29EE54EBEFFE96C1, broker=Deriv, connected=1

Symbol Sync Confirmed:
- 27 symbols upserted: EURUSD, USDJPY, GBPUSD, AUDUSD, XAUUSD, EURGBP, EURJPY, EURCHF, EURAUD, AUDJPY, AUDUSD, AUDCAD, USDCAD, USDCHF, USDZAR, CHFJPY, GBPJPY, NZDUSD, GBPUSD, NZDJPY, AUDNZD, CADJPY, CADUSD, BTCUSD, ETHUSD, SOLUSD, DXYUSD, USSP500, NAS100, US30

Market-Stream Auth:
- FX pairs: 422 STALE REJECTED (weekend market closure, expected; candles from 2026-05-15 20:42 UTC)
- Crypto pairs: 200 OK (24/7 trading, fresh candles)
- Note: Transport/auth validation already passed; weekend stale rejects were expected during closed FX sessions
```

### Blockers

- ~~Phase 0 closeout not complete~~ — **CLEARED 2026-05-15**
- ~~Live MT5 terminal verification still pending for `/ea/license-check`, `/ea/heartbeat`, `/ea/account-sync`, and `/ea/symbol-sync`~~ — **CLEARED 2026-05-18** (all routes confirmed operational)
- ~~48h continuity window pending~~ — **CLEARED 2026-05-20**: 48h+ heartbeat continuity confirmed. Full closeout: `.github/migration/phase-updates/phase1-bridge-48h-continuity-complete-2026-05-20.md`

---

## Phase 2: Read-Only Trade Telemetry

**Objective**: Pull real account/trade state into backend/dashboard  
**Owner**: Track A + Track B + Track C  
**Status**: COMPLETE (Phase 2 implementation complete; browser checks passed for live trade telemetry; `/progress` route and `/user/progress` backend contract live; active-day definition approved 2026-05-22 — `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` — streak truth is live)  
**Prerequisites**: Phase 1 complete  
**Readiness Package Target**: [PHASE2_IMPLEMENTATION.md](../PHASE2_IMPLEMENTATION.md)  
**Prerequisite Verified**: Phase 1 48h continuity gate passed on 2026-05-18  
**Completion Target**: 2026-06-15

### Deliverables

- [x] EA Sync Systems: open positions, pending orders, account metrics, trade history
- [x] Dashboard Panels: account card, live positions, floating P/L, hedge grouping, sync health

### Success Criteria

- [x] Dashboard matches MT5 terminal exactly
- [x] No stale positions
- [x] No duplicate tickets

### Test Checklist

- [x] Manual trade open/close
- [x] Partial close
- [x] SL/TP modification
- [x] Broker reconnect
- [x] Weekend reopen

### Blockers

- _Final manual staging/browser parity validation recommended before production deploy_
- _Active-day definition approved 2026-05-22. Definition: `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` (any completed engine run in `engine_runs` table counts as an active day; all historical records included in streak backfill). Streak truth is now live — `GET /user/progress` returns `streak.state = "LIVE"` and a non-zero `current_streak_days` for users with engine run history._

---

## Phase 3: MT5 Market Data Engine

**Objective**: EA becomes authoritative market-data collector  
**Owner**: Track A + Track B  
**Status**: COMPLETE — Track A EA candle engine COMPLETE; Track B backend freshness layer COMPLETE; browser verification PASSED 2026-05-22; 72h stability soak CLOSED 2026-05-25; T0 admin baseline captured 2026-05-27; gate fully closed
**Prerequisites**: Phase 2 complete ✅ (gate passed 2026-05-22)  
**Planning Branch**: `codex/smc-intake-create-phase3-implementation-md-and-o`
**Readiness Package Target**: [PHASE3_IMPLEMENTATION.md](../PHASE3_IMPLEMENTATION.md)
**Completion Target**: 2026-07-15

### Deliverables

- [x] EA Candle Engine: OHLC, spreads, sessions, tick movement, volatility metrics — `MarketDataEngine.mqh`, `CandleBuilder.mqh`, `FreshnessEngine.mqh`, `SessionManager.mqh` (PR #224, verified 2026-05-22)
- [x] Backend Freshness Layer: `quote_updated_at`, `last_seen_at`, stagnation state, feed health — `upsert_mt5_snapshot()`, freshness/session transients, TD clearing, engine_runs heartbeat (verified 2026-05-22)

### Success Criteria

- [x] No fake-live states — TD rate-limit transients cleared on every MT5 push; freshness gated by broker timestamp age; synthetic `updatedAt` fabrication in `build_symbol_state()` patched 2026-05-24 (commit `6f3c835`)
- [x] No frozen live feeds — 72h soak CLOSED 2026-05-25; 97,262 engine runs / 0 errors in final 24h; no frozen feeds detected
- [x] Fresh/stale detection accurate — LIVE/DELAYED/STALE/CLOSED enforced in EA + backend; parity audit PASS; browser confirmed 2026-05-22

### Test Checklist

- [x] Low/high volatility — FreshnessEngine thresholds handle tick gaps correctly
- [x] Weekend freeze — CONFIRMED 2026-05-25: FX/equity CLOSED, crypto LIVE, EA resumed Sunday open; offline root cause = broker session availability, not code failure
- [x] Broker lag — staleness guard rejects payloads >300s; warns at 120–300s with audit trail
- [x] Symbol suffix handling — `SymbolNormalizer.mqh` + `ResolveBrokerSymbol()` resolve broker-specific suffixes

### Blockers

- ~~Phase 2 closeout~~ — **CLEARED 2026-05-22**
- ~~EA candle engine (Track A)~~ — **CLEARED 2026-05-22**: All modules verified; parity tests passing
- ~~Backend freshness layer (Track B)~~ — **CLEARED 2026-05-22**: All storage paths confirmed
- ~~Live browser verification~~ — **CLEARED 2026-05-22**: MT5 authority Live ✅ · BACKEND LIVE ✅ · London session ✅ · 10/12 symbols live ✅ · Streak 8d LIVE ✅
- ~~NAS100/US30 config item~~ — **RESOLVED**: NAS100/US30 ARE present in EA as Deriv broker names (`US Tech 100`, `Wall Street 30`). SymbolNormalizer alias map correctly resolves both to canonical symbols. Offline status in closeout snapshot (04:17 UTC) is expected pre-market behaviour — equities open at 13:30 UTC.
- ~~72-hour stability soak~~ — **CLEARED 2026-05-25**: Soak window closed with 0 engine errors in final 24h
- ~~T0 admin baseline capture~~ — **CLEARED 2026-05-27**: Phase 4 soak workspace baseline captured and exported (`.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`)

---

## Phase 4: Fib Engine Migration

**Objective**: Port fib calculations into MT5, validate against Pine  
**Owner**: Track A + Track B (both admin)  
**Status**: READ-ONLY TESTING — code implementation complete 2026-05-25; no code changes permitted during backend migration; timeframe contract corrected 2026-05-28; EA deployed live and T0 soak baseline captured 2026-05-27; corrected runtime verification confirmed 2026-05-28; synthetic validator PASS artifact present; final paired-export gate still open  
**Prerequisites**: Phase 3 complete ✅  
**Completion Target**: 2026-08-15  
**Branch**: `Phase-4-Implementation` — [PR #239](https://github.com/klintaruvinga-png/smcsmartfib-WebApp/pull/239)
**Operator Checklist**: [phase4-next-actions-checklist-2026-05-27.md](./migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md)  
**Contract Correction**: [phase4-timeframe-contract-correction-2026-05-28.md](./migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md)

### Deliverables

- [x] `mt5/FibEngine.mqh` — `LTF*SF` (recency-weighted) + HTF_AF (raw-extreme) fib levels, all 16 ratios, M15/H1/H4/D1 _(corrected 2026-05-28)_
- [x] `FibEngine` integrated into `MarketDataEngine.mqh` — dispatches `/ea/fib-levels` every ~60s _(2026-05-25)_
- [x] `wp_smc_sf_fib_levels` DB table — UNIQUE upsert on (`user*id`, symbol, timeframe, family, ratio) _(2026-05-25)_
- [x] `POST /ea/fib-levels` + ingestion handler — validates against canonical 16-ratio whitelist and accepts H4 _(corrected 2026-05-28)_
- [x] `GET /market-data/fib-levels` — grouped response for dashboard consumption _(2026-05-25)_
- [x] `scripts/parity-validator.php` — machine-readable JSON gate report; synthetic self-test 100% PASS on `384/384` when run without paired inputs _(corrected 2026-05-28)_
- [x] `reports/phase4-gate.json` — repository PASS artifact exists, but it reflects the validator's synthetic no-input self-test rather than final live MT5-vs-Pine closeout
- [x] `test-fib-ingestion.php` — 7 contract tests all PASS _(corrected 2026-05-28 to require H4 and 128 rows)_
- [x] **[MANUAL]** Live EA deployment to MT5 terminal completed _(operator confirmed 2026-05-27; 30-day corpus accumulation started)_
- [x] **[MANUAL]** T0 admin soak baseline captured for `PHASE_4_30_DAY` _(baseline checkpoint exported 2026-05-27; see `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`)_
- [x] **[MANUAL]** Historical runtime verification captured _(2026-05-27 — pre-correction evidence only; backend ingest confirmed `levels_written=96` before H4 was added)_
- [x] **[MANUAL]** Redeploy the corrected H4 build and confirm backend ingest `levels_written=128` _(confirmed 2026-05-28; `XAUUSD` ingest logged at `15:14:35 UTC`)_
- [ ] **[MANUAL]** Historical replay corpus (EURUSD + USDJPY + XAUUSD, 30-day, M15/H1/H4/D1)
- [x] **[MANUAL]** Live parity validator run — MT5 output vs. Pine reference snapshots (initial 2026-06-02 artifact FAIL 40.89%; corrected 2026-06-03 artifact FAIL 0.26%; 2026-06-04 gate artifacts also FAIL; final gate remains open)
- [ ] **[MANUAL]** Weekend gap + sparse data scenario validation

### Success Criteria

- [x] 16-ratio completeness — verified in PHP contract tests
- [x] Price accuracy ≤0.00001 — verified in PHP parity fixture tests (delta max 0.00000)
- [ ] **[MANUAL]** 99%+ fib parity across EURUSD/USDJPY/XAUUSD live data
- [ ] **[MANUAL]** Zero critical mismatches (drift >0.001) on any pair/timeframe
- [ ] **[MANUAL]** Operator export acceptance: `384` rows across `24` `(symbol,timeframe,family)` groups

### Test Checklist

- [x] PHP parity fixture tests (all 5 pass green)
- [x] Fib ingestion contract tests (7/7 pass)
- [x] Parity validator self-test (100% PASS, 384/384 exact matches in synthetic no-input mode)
- [ ] **[MANUAL]** Historical replay (30-day corpus)
- [ ] **[MANUAL]** Volatile markets (XAUUSD NFP/CPI scenario)
- [ ] **[MANUAL]** Weekend gaps (EURUSD D1 Friday→Monday)
- [ ] **[MANUAL]** Missing candles (sparse data fallback)
- [x] Broker suffix normalization — handled by `SymbolNormalizer.mqh` (existing; no regression)

### Parity Status

```text
PHP Fixture Parity:        PASS (100%, 0.00000 delta max all 12 fixtures)
Ingestion Contract Tests:  PASS (7/7; 128-row H4 contract enforced)
Parity Validator Self-Test: PASS (synthetic no-input mode, 100%, 384/384 tuples)
MT5 Live vs Pine Live:     PENDING (initial 2026-06-02 artifact FAIL 40.89%; corrected 2026-06-03 artifact FAIL 0.26% with 383 critical mismatches; 2026-06-04 gate artifacts also FAIL, including _173401 at 51.04% with 47 critical mismatches; final gate remains open; weekend-gap and sparse-data evidence still required)
```

### Blockers

- ~~Phase 3 not complete~~ — **CLEARED 2026-05-25**
- ~~Track leads unassigned~~ — **CLEARED 2026-05-25** (both tracks: admin)
- ~~T0 admin baseline missing~~ — **CLEARED 2026-05-27**
- ~~Live EA/plugin build verification pending~~ — **CLEARED 2026-05-27**
- ~~**[OPERATOR]** Corrected H4 MT5 build not yet redeployed~~ — **CLEARED 2026-05-28**: corrected EA deployed; backend ingest confirmed `levels_written=128` for `XAUUSD` at `15:14:35 UTC`
- **[GOVERNANCE]** Synthetic PASS artifact is not the final gate — `reports/phase4-gate.json` currently proves validator tooling only because `scripts/parity-validator.php` was run without paired `--mt5-file` and `--pine-file` inputs
- **[OPERATOR]** Authenticated MT5 fib export path confirmed — operator capture succeeded for `EURUSD`, `USDJPY`, `XAUUSD` and snapshots were saved to `./snapshots/20260531_041253/`
- **[OPERATOR]** Live parity corpus not yet complete — no committed paired `mt5-levels.json` or `pine-levels.json` artifacts exist yet, and MT5 must continue running against real market data until the 30-day capture window and manual scenario checks are complete before the gate can be validated

---

## Backend Migration: WordPress → Node.js/TanStack Start

**Objective**: Migrate from WordPress REST backend to standalone Node.js/TanStack Start backend on Cloudflare Workers with PostgreSQL

**Status**: IN-PROGRESS (Started 2026-07-15)

**Strategy** (revised 2026-07-17 — WordPress-free):
- WordPress is treated as permanently down; no compatibility, shadow sync, dual-write, or fallback
- Frontend reconfigured to `VITE_API_URL`; JWT is the sole auth model
- Domain services (SnapshotService, SignalService, ChartService, MarketDataService, TelemetryService) own DB access, validation, and business logic; route handlers are thin wrappers
- Endpoints implemented in dependency order: app boot → core trading → MT5 read-only ingest → data migration → testing
- MT5 ingestion is read-only first; order/execution endpoints deferred

**Prerequisites**: Phase 0-3 COMPLETE ✅ · BACKEND-1 COMPLETE ✅

**Implementation Plan**: See the BACKEND-0 / BACKEND-1 (complete) and BACKEND-2 (WordPress-Free Restoration) sections below. BACKEND-3/4/5 are superseded — their intent is absorbed into BACKEND-2. Canonical plan: [plans/backend-2-restoration-plan.md](../plans/backend-2-restoration-plan.md).

### Phase BACKEND-0: Foundation Setup

**Objective**: Set up shared contracts, database, and project structure
**Status**: IN-PROGRESS — Database Layer COMPLETE (2026-07-16); shared contracts authored; provider wiring pending
**Target**: 2026-07-22
**Blockers**: PostgreSQL provider wiring

#### BACKEND-0 · Database Layer (2026-07-16) — COMPLETE
- Restructured `backend/src/db/` → `backend/src/lib/db/` (canonical layout); repointed `drizzle.config.ts`.
- Extended Drizzle schema + `001_init.sql`: `users.password_hash` (TEXT) and `fib_levels.trend` (TEXT) to support the new query functions.
- Hand-authored `backend/src/lib/db/types.ts` (Supabase `Database` type) — `supabase gen types --local` is unavailable here (no Docker); mirrors the extended migration.
- Implemented 8 query functions across `queries/{fib-levels,users,ea-sessions}.ts` + `queries/index.ts` (single entry point).
  - fib-levels: `createFibLevel` (batch upsert, WordPress `wpdb->replace` parity), `getLatestFibLevels`, `getMarketData`.
  - users: `createUser` (bcrypt-hashed `password_hash`), `getUserByApiKey`, `getUserById`, `verifyUserPassword`.
  - ea-sessions: `createEaSession`, `updateEaSessionPing`, `getActiveEaSessions`.
- Added `backend/vitest.config.ts` + mocked integration tests (`tests/integration/*`) — 14/14 passing; `tsc --noEmit` clean.
- **Evidence**: `node node_modules/vitest/vitest.mjs run tests/integration` → 14 passed; `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
- **Caveat**: Local Supabase/Docker not running, so tests mock the Drizzle client; live-DB validation deferred to when a Supabase instance is available. `users.id` FK to `auth.users` means the auth user must pre-exist in production (custom `password_hash` is query-layer only).

### Phase BACKEND-1: Core API Implementation

**Objective**: Implement auth, settings, and market data endpoints
**Status**: COMPLETE — Auth + market-data endpoints COMPLETE (2026-07-16); settings endpoint COMPLETE (2026-07-17)
**Target**: 2026-08-05
**Blockers**: None (BACKEND-0 database layer sufficient for current endpoints; provider wiring non-blocking)

#### BACKEND-1 · Auth + Critical Endpoints (2026-07-16) — COMPLETE
- Auth utilities (`src/lib/auth/index.ts`): `jose` HS256 access tokens (15m), random refresh tokens, bcrypt password hashing, SHA-256 token hashing. `JWT_SECRET` read lazily from env.
- Middleware (`src/lib/auth/middleware.ts`): `requireAuth` (Bearer JWT → `event.context.authUser`), `requireEaAuth` (X-EA-API-Key + role `ea` → `event.context.eaUser`).
- `refresh_sessions` table added to `schema.ts` + `migrations/002_add_refresh_sessions.sql` (indexes + RLS read/delete policies).
- 4 auth endpoints: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/refresh` — business logic extracted to `src/lib/auth/handlers.ts` (pure, testable) with thin h3 wrappers.
- True refresh-token rotation: `refresh` invalidates the old session and issues a new access+refresh pair.
- 2 critical endpoints: `POST /api/ea/fib-levels` (zod-validated, per-ratio `VALID_RATIOS` check, WordPress grouped payload) and `GET /api/market-data/fib-levels` (groups by timeframe → family → levels, parity with WordPress).
- Tests: 21 new integration tests (auth 18, ea-endpoints 3, market-data 4) + 14 from Phase 1 = 39 passing; `tsc --noEmit` clean.
- **Caveat**: Live-DB validation deferred (no Docker/Supabase available locally). `npm run typecheck` and `npm run test:integration` now run green (47 tests) against the in-memory `dbMock`; the earlier `.bin` shim breakage is resolved. Real-DB validation (schema push + JSONB merge) must be confirmed in staging.

#### BACKEND-1 · Settings Endpoint (2026-07-17) — COMPLETE
- `settings JSONB` column added to `users` (`schema.ts` + `migrations/004_add_user_settings.sql`, default `'{}'::jsonb`). Normalizes the WordPress `wp_usermeta` key/value store into one structured object (notifications / theme / watchlist / risk).
- PATCH semantics via an atomic transaction with a row-locking read (`SELECT ... FOR UPDATE`) and an application-level deep merge — the row lock serializes concurrent updates, and partial nested updates preserve untouched keys.
- Zod validation (`lib/user/settings-schema.ts`): every field optional; `theme` enum (`light|dark|system`); `risk.maxRiskPercent` validated to 0–100 range.
- Route `src/routes/api/user/settings.ts`: `GET` returns settings (404 if the user row is absent), `PUT`/`POST`/`PATCH` validates + merges; `requireAuth` + no-store cache headers; mirrors `market-data/fib-levels.ts` conventions.
- `SettingsError` (404 user-not-found) thrown from `lib/db/queries/users.ts`, converted to `createError` at the route.
- Tests: 8 new integration tests (query merge wiring + Zod schema) — 47 total passing; `tsc --noEmit` clean.
- **Parity note**: API/schema parity only; WordPress `usermeta` full data mapping is owned by BACKEND-2 Phase 6 (Data Migration) — migrate the backup if available, otherwise seed test data. No shadow-sync phase.

### Phase BACKEND-2: WordPress-Free Restoration

**Objective**: Restore frontend functionality with a service-oriented, zero-WordPress backend
**Status**: IN-PROGRESS (started 2026-07-17)
**Target**: 2026-08-09 (15–23 day total window)
**Blockers**: None (BACKEND-1 complete; WordPress permanently down)
**Canonical Plan**: [plans/backend-2-restoration-plan.md](../plans/backend-2-restoration-plan.md)

#### BACKEND-2a · Architecture Cleanup & Configuration

- [ ] Rename `VITE_SNIPER_BACKEND_URL` → `VITE_API_URL` (`.env.example` + `sniperClient.ts`)
- [ ] Remove WordPress nonce fallback + `resolveDefaultBackendUrl()` from `sniperClient.ts`
- [ ] Drop `WORDPRESS_API_URL` / `WORDPRESS_API_KEY` from `backend/.env.example` + `nitro.config.ts`
- [ ] Add Phase 1/2 tables (snapshots, regimes, gates, candles, signals, trade_plans, engine_runs, account_telemetry) — migration `005_add_phase1_tables.sql` + Drizzle schema
- **Acceptance**: Frontend builds/runs on `VITE_API_URL`; no runtime or configuration dependency on WordPress remains

#### BACKEND-2b · Service Layer Foundation

- [ ] Create `backend/src/lib/services/{snapshot,signal,chart,market,telemetry}/` (index + queries + validators)
- [ ] Base pattern: each service owns DB access, validation, business logic; returns domain objects
- [ ] Refactor `lib/market-data/handlers.ts`, `lib/ea/handlers.ts`, `lib/auth/handlers.ts` into services
- [ ] Thin route wrappers; integration tests target services directly
- **Acceptance**: Service layer structure present; existing handlers call services

#### BACKEND-2c · App-Boot Endpoints

- [ ] `GET /api/snapshot/unified` → `SnapshotService.getUnifiedSnapshot(userId)`
- [ ] `GET /api/charts` (symbol, timeframe) → `ChartService.getChartSnapshot(...)`
- [ ] `GET /api/session` → market session detection
- **Acceptance**: Frontend boots and loads initial data; tests pass

#### BACKEND-2d · Core Trading Endpoints

- [ ] `GET /api/signals` (board_size, scope) → `SignalService.getLiveSignals(...)`
- [ ] `GET /api/ladders` → `SignalService.getLadders(...)`
- [ ] `GET /api/health` (engine health) → `TelemetryService.getEngineHealth(...)`
- [ ] `GET /api/account-telemetry` → `TelemetryService.getAccountTelemetry(...)`
- **Acceptance**: Signals, ladders, engine health, account telemetry render

#### BACKEND-2e · MT5 Read-Only Ingestion

- [ ] `POST /api/ea/market-stream` → `MarketDataService.ingestMarketStream(...)` (updates `market_snapshots`)
- [ ] `POST /api/ea/heartbeat` → `TelemetryService.recordHeartbeat(...)` (updates `ea_sessions`)
- [ ] `POST /api/ea/account-sync` → `TelemetryService.syncAccount(...)` (updates `account_telemetry`)
- [ ] `POST /api/ea/symbol-sync` → `MarketDataService.syncSymbols(...)`
- **Acceptance**: MT5 writes market data; no execution endpoints yet

#### BACKEND-2f · Data Migration

- [ ] If WordPress backup exists: transform `wp_users`/`wp_usermeta`/`wp_smc_sf_*` → PostgreSQL; validate; rollback plan
- [ ] Else: seed test users, watchlists, fib levels, signals, trade plans, snapshots, telemetry
- **Acceptance**: Production data migrated OR test data seeded and displayed

#### BACKEND-2g · Testing & Validation

- [ ] Integration tests for all new endpoints + services in isolation
- [ ] E2E: boot, login, MT5 data load, signal display, settings persistence
- [ ] Performance (<500ms most endpoints) + security (JWT, EA key, injection, CORS)
- **Acceptance**: All tests green; MT5 pipeline stable 24h+

> **Superseded**: The prior BACKEND-3 (signal/plan endpoints), BACKEND-4 (cutover), and BACKEND-5 (WP decommission) are obsolete under the WordPress-free strategy — their intent is absorbed into BACKEND-2c/2d (endpoints) and 2a (WP removal).

---

## Phase 5: Regime & Chop Engine Migration

**Objective**: Move regime classification into MT5, validate against Pine  
**Owner**: Track A + Track B  
**Status**: CODE COMPLETE (2026-05-25) — gated on Phase 4 live parity; no operator activation yet  
**Prerequisites**: Phase 4 complete  
**Completion Target**: 2026-09-15  
**Readiness Package**: [PHASE5_IMPLEMENTATION.md](../PHASE5_IMPLEMENTATION.md)  
**Update**: [phase5-code-complete-2026-05-25.md](./phase-updates/phase5-code-complete-2026-05-25.md)

### Deliverables

- [x] **`mt5/RegimeEngine.mqh`** — EMA-20 D1 HTF bias, efficiency-ratio chop score, ATR-14 H1 _(2026-05-25)_
- [x] **`MarketDataEngine.mqh` integration** — `SendRegimeToBackend()` every ~60s _(2026-05-25)_
- [x] **`wp_smc_sf_regime_snapshots` DB table** — UNIQUE upsert on (`user*id`, symbol) _(2026-05-25)_
- [x] **`POST /ea/regime-snapshot`** — batch ingestion, EA bridge auth _(2026-05-25)_
- [x] **`GET /market-data/regime`** — grouped response for dashboard _(2026-05-25)_
- [ ] **[MANUAL]** 48h+ regime accumulation on live MT5 terminal
- [ ] **[MANUAL]** Regime parity validation vs. Pine (≥ 95% bias direction match)
- [ ] **[MANUAL]** Chop score spot-check (5+ CHOP and 5+ TRENDING classifications)

### Success Criteria

- [x] MT5 code dispatches regime for all symbols (automated verification via dispatch logs)
- [ ] **[MANUAL]** ≥ 95% regime direction (Bull/Bear) parity vs Pine
- [ ] **[MANUAL]** Stable chop detection across illiquid/volatile sessions

### Test Checklist

- [ ] Ranging/breakout markets
- [ ] High-news volatility (NFP/CPI)
- [ ] Illiquid sessions (Asian session EURUSD)
- [ ] Weekend freeze (all symbols → TRANSITIONAL)

### Parity Status

```text
MT5 htf_bias vs Pine bias:    PENDING (Phase 4 gate must clear first)
MT5 ltf_regime vs Pine regime: PENDING
MT5 chop_score delta:         PENDING (target: ≤ 0.15)
Volatility Gating:            PENDING
```

### Blockers

- **Phase 4 live parity corpus** — must clear before Phase 5 operator deployment

---

## Phase 5B: Fundamentals Regime Feed

**Objective**: Integrate macro-economic data as a numerical bias overlay that filters and weights technical regime and signal conditions  
**Owner**: Track B (data ingestion + normalization) + Track A (MT5 conviction propagation) + Track C (dashboard display)  
**Status**: CODE COMPLETE (2026-05-25) — backend only; gated on Phase 5  
**Prerequisites**: Phase 5 complete  
**Completion Target**: 2026-10-01  
**Readiness Package**: [PHASE5B_IMPLEMENTATION.md](../PHASE5B_IMPLEMENTATION.md)  
**Update**: [phase5b-code-complete-2026-05-25.md](./phase-updates/phase5b-code-complete-2026-05-25.md)

### Design Principle

Fundamentals do not replace fib/regime/signal logic — they filter and weight it:

- **Technicals** = precision entries/exits
- **Fundamentals** = directional conviction multiplier

A fundamental bias score is computed per currency from economic events, normalized into a numeric value, and injected as a macro overlay into the regime engine. The signal engine then applies a conviction weight based on alignment between the technical setup and the fundamental bias.

### Deliverables

- [x] **Data Ingestion Layer** (Track B) _(2026-05-25)_
  - Economic calendar feed (Twelve Data economic events API — `GET /economic_calendar`) ✅
  - Central bank policy state parser: rate decision → hawkish (+1) / hold (0) / dovish (−1) ✅
  - Backend storage: `smc_sf_fundamental_events` + `smc_sf_fundamental_bias` ✅
  - Cron-based pull every 30 min (`twicehourly` WP-Cron) + on-demand `POST /fundamentals/refresh` ✅

- [x] **Normalization Engine** (Track B) _(2026-05-25)_
  - CPI surprise score: `(actual − forecast) / forecast` → mapped to −2/−1/0/+1/+2 ✅
  - Rate decision bias: +1 hike, 0 hold, −1 cut ✅
  - Composite per-currency bias with time decay (30d=1.0×, 30–90d=0.25×, 90d+=excluded) ✅
  - Bias categories: BULLISH / NEUTRAL / BEARISH ✅

- [ ] **Regime Integration** (Track A + Track B)
  - `FundamentalBiasEngine` module reads composite bias score at regime evaluation time
  - Fundamental bias score appended to regime state payload as `fundamental_bias: { base, quote, composite, category }`
  - Backend `ensure_engine_snapshot()` reads and includes fundamental bias at snapshot generation time
  - MT5 EA: `FreshnessEngine` can optionally receive bias score from backend via heartbeat response (read-only; does not affect MT5 data emission)

- [ ] **Signal Conviction Weighting** (Track B)
  - Signal generation reads fundamental bias alignment before computing conviction
  - Conviction multiplier: aligned (1.0×) / neutral (0.7×) / opposed (0.3× — requires stronger technical threshold to qualify)
  - Opposed signals not suppressed outright — flagged with reduced conviction so operator can decide
  - `conviction_weight` field added to signal output payload

- [ ] **Dashboard Visualization** (Track C)
  - Fundamentals bias chip per currency on watchlist row (BULLISH / NEUTRAL / BEARISH)
  - Per-pair bias breakdown panel (base vs. quote currency bias)
  - Upcoming economic events widget (next 24h, filtered by watched pairs)
  - Conviction weight indicator on signal cards
  - Manual bias override toggle (operator can pin a pair to NEUTRAL in edge cases, e.g., pre-NFP blackout)

### Success Criteria

- [ ] Economic calendar events ingested and scored within 15 min of release
- [ ] Composite bias score per currency accurate on known historical test events (NFP, CPI, rate decisions ≥ 2025)
- [ ] Signal conviction weighting applied and visible in dashboard without breaking existing Phase 5 regime parity
- [ ] Existing fib/regime/signal parity thresholds unchanged after Phase 5B overlay
- [ ] Manual bias override does not affect engine snapshot authority or MT5 data emission

### Test Checklist

- [ ] CPI surprise normalization — positive/negative/zero surprise score correctly derived
- [ ] Rate decision parser — hike / cut / hold correctly classified for Fed, ECB, SARB
- [ ] Composite bias decay — 7-day-old event vs. same-day event carry different weights
- [ ] Signal conviction weighting — aligned vs. opposed vs. neutral setups each receive correct multiplier
- [ ] Regime parity regression — Phase 5 parity suites pass unchanged after 5B overlay is live
- [ ] Dashboard conviction chip — renders correctly on all watchlist symbols including pairs with no recent events (defaults to NEUTRAL)

### Data Sources

All sources below are **free tier** — no paid subscriptions required for Phase 5B implementation.

| Feed                                         | Data Covered                                                                                            | Cost                                   | Key Required                                                    | Status                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| **Twelve Data `/economic_calendar`**         | CPI, NFP, GDP, interest rate decisions, all G10 currencies                                              | Free (800 credits/day)                 | Existing TD key already in backend                              | ✅ Ready — same key as `/time_series` + `/quote` already in use |
| **MT5 EA feed — `DXYUSD`**                   | US Dollar Index (DXY) for USD conviction                                                                | Free                                   | None — already streaming                                        | ✅ Ready — EA symbol already tracked                            |
| **MT5 EA feed — `Volatility 75(1s) Index`**  | VIX proxy for risk-on/risk-off regime filter                                                            | Free                                   | None — already streaming                                        | ✅ Ready — EA symbol already tracked                            |
| **MT5 EA feed — `GOLD`**                     | Commodity driver / safe-haven sentiment                                                                 | Free                                   | None — already streaming                                        | ✅ Ready — EA symbol already tracked                            |
| **MT5 EA feed — equity indices**             | `US SP 500`, `US Tech 100`, `Wall Street 30`, `Germany 40` — risk appetite proxy                        | Free                                   | None — already streaming                                        | ✅ Ready — EA symbols already tracked                           |
| **FRED API** (Federal Reserve Economic Data) | US CPI series, Fed Funds Rate history, 10Y Treasury Yield, VIX daily close (`VIXCLS`) — deeper US macro | Free (no rate limits for standard use) | Free API key at fred.stlouisfed.org — new registration required | ⏳ Pending — register key when Phase 5B starts                  |

**Sources evaluated and ruled out for now (paid or too limited):**

- Trading Economics — free tier severely limited; revisit if FRED + TD coverage is insufficient
- Alpha Vantage — 25 req/day free tier; insufficient for real-time event scoring
- Refinitiv / Bloomberg — paid only

**Coverage gap acknowledged:** ECB, SARB, BoE, RBA central bank _statement text_ parsing (for hawkish/dovish NLP scoring beyond rate decision events) is not covered by free feeds. For Phase 5B initial implementation, the Twelve Data economic calendar `interest_rate` event type covers the rate decision outcome (+1/0/−1 bias) for all G10 central banks without requiring statement text parsing. NLP statement parsing is a Phase 5B v2 enhancement.

### Parity Status

```text
Fundamental bias accuracy vs. known events: [PENDING]
Signal conviction weighting regression: [PENDING]
Regime engine parity post-overlay: [PENDING]
```

### Blockers

- _Phase 5 (Regime Engine) not complete_

---

## Phase 6: Signal Engine Dual-Run

**Objective**: MT5 generates signals in parallel with Pine; Pine authoritative  
**Owner**: Track A + Track B  
**Status**: CODE COMPLETE (2026-05-25) — gated on Phase 5B; fib→signal wiring sprint pending  
**Prerequisites**: Phase 5B complete  
**Completion Target**: 2026-10-15  
**Readiness Package**: [PHASE6_IMPLEMENTATION.md](../PHASE6_IMPLEMENTATION.md)  
**Update**: [phase6-code-complete-2026-05-25.md](./phase-updates/phase6-code-complete-2026-05-25.md)

### Deliverables

- [x] **`mt5/SignalEngine.mqh`** — 4-gate evaluation, verdict A+/A/B/C, SL/TP from H4 swing + fib _(2026-05-25)_
- [x] **`mt5/ExecutionEngine.mqh`** — Phase 7 scaffold, `phase6Cleared=false` hard gate _(2026-05-25)_
- [x] **`wp_smc_sf_mt5_signal_candidates` DB table** _(2026-05-25)_
- [x] **`POST /ea/signal-candidates`** — batch ingestion with drift classification _(2026-05-25)_
- [x] **`GET /market-data/signal-drift`** — parity report with `gate*status` _(2026-05-25)_
- [x] **`classify_signal_drift()`** — MT5 vs Pine: EXACT/DRIFT/MISMATCH/`NO*PINE` _(2026-05-25)_
- [x] **`is_phase6_gate_cleared()`** — ≥50 comparables AND `parity*pct` ≥ 95% _(2026-05-25)_
- [ ] **[ACTIVATION SPRINT]** Fib→Signal SharedStateCache wiring (fibCount currently=0)
- [ ] **[MANUAL]** 200+ comparable candidates across 2+ weeks
- [ ] **[MANUAL]** Parity ≥ 95% confirmed in drift report

### Success Criteria

- [x] Drift analyzer logic implemented and correct
- [x] Phase 7 hard gate implemented
- [ ] **[MANUAL]** ≥ 95% signal parity across EURUSD/USDJPY/XAUUSD

### Parity Status

```text
MT5 Entry vs Pine Entry: PENDING (needs Phase 5B live + fib wiring sprint)
SL/TP Parity: PENDING
Confluence Detection: PENDING
Phase 7 GATE: BLOCKED (hard gate in is_phase6_gate_cleared)
```

### Blockers

- **Phase 5B gate** — must clear before Phase 6 activation
- **Fib→Signal wiring** — Phase 6 activation sprint (1–2 days work)
- **GATE**: Phase 7+ execution hard-blocked until Phase 6 parity ≥ 95%

---

## Phase 7: Controlled Manual Execution

**Objective**: Enable safe dashboard-triggered execution (NOT auto)  
**Owner**: Track A + Track B + Track C  
**Status**: SCAFFOLDED (2026-05-25) — hard-gated on Phase 6 parity ≥ 95%  
**Prerequisites**: Phase 6 parity ≥ 95%  
**Completion Target**: 2026-11-15  
**Update**: [phase7-9-scaffold-2026-05-25.md](./phase-updates/phase7-9-scaffold-2026-05-25.md)

### Deliverables

- [x] **`mt5/ExecutionEngine.mqh`** scaffold — `phase6Cleared=false`, risk guardrails, OrderSend, ack _(2026-05-25)_
- [x] **`wp_smc_sf_execution_audit` DB table** — full audit trail _(2026-05-25)_
- [x] **`GET /ea/execution-queue`** — returns pending requests (empty until Phase 6 gate) _(2026-05-25)_
- [x] **`POST /ea/execution-ack`** — EA acknowledges fill/rejection _(2026-05-25)_
- [x] **`POST /user/execution-request`** — dashboard submits, risk guardrails enforced _(2026-05-25)_
- [x] **`GET /user/execution-audit`** — audit trail for dashboard _(2026-05-25)_
- [x] Risk guardrails: SL required, lots 0–10, valid direction, Phase 6 gate check _(2026-05-25)_
- [ ] **[ACTIVATION]** `SetPhase6Cleared(true)` in EA after Phase 6 sign-off
- [ ] Dashboard execution console UI
- [ ] Disconnect-during-execution handling

### Blockers

- **Phase 6 parity ≥ 95%** — `is_phase6_gate_cleared()` controls the queue
- Execution engine `phase6Cleared = false` — must be explicitly flipped after sign-off

---

## Phase 8: Semi-Automation Layer

**Objective**: Allow signal approval workflows  
**Owner**: Track B + Track C  
**Status**: SCAFFOLDED (2026-05-25) — gated on Phase 7  
**Prerequisites**: Phase 7 complete  
**Completion Target**: 2026-12-01  
**Update**: [phase7-9-scaffold-2026-05-25.md](./phase-updates/phase7-9-scaffold-2026-05-25.md)

### Deliverables

- [x] **`wp_smc_sf_approval_queue` DB table** — signal + regime + fundamental + risk context _(2026-05-25)_
- [x] **`GET /user/approval-queue`** — returns PENDING items; auto-expires stale _(2026-05-25)_
- [x] **`POST /user/approval-queue/review`** — APPROVED/REJECTED with operator note _(2026-05-25)_
- [ ] Auto-enqueue signals from engine into approval queue (Phase 8 activation sprint)
- [ ] Dashboard approval console UI

### Blockers

- _Phase 7 not complete_

---

## Phase 9: SaaS & Licensing System

**Objective**: Commercialize platform  
**Owner**: Track B  
**Status**: SCAFFOLDED (2026-05-25) — gated on Phase 8  
**Prerequisites**: Phase 8 complete  
**Completion Target**: 2026-12-15  
**Update**: [phase7-9-scaffold-2026-05-25.md](./phase-updates/phase7-9-scaffold-2026-05-25.md)

### Deliverables

- [x] **`wp_smc_sf_license_tiers` DB table** — Basic/Pro/Elite/Institutional _(2026-05-25)_
- [x] **`GET /user/license`** — returns current tier; defaults to Basic _(2026-05-25)_
- [x] **`POST /admin/license/set-tier`** — admin assigns tier + expiry _(2026-05-25)_
- [x] Tier config: `max*symbols`, max_ea_sessions, execution_enabled, api_access_enabled _(2026-05-25)_
- [ ] Anti-piracy: max_ea_sessions enforcement in heartbeat
- [ ] License-check integration (tier limits in `/ea/license-check` response)
- [ ] Subscription/payment integration (Stripe or WooCommerce)
- [ ] Remote disable endpoint

### Blockers

- _Phase 8 not complete_

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

- _Phase 9 not complete_

---

## Automated Escalations & Critical Issues

| Issue                                                     | Severity | Detected                    | Phase Impact                            | Status                                                                                                              |
| --------------------------------------------------------- | -------- | --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `engine_runs` heartbeat row growth needs pruning policy   | Low      | 2026-05-05 v13 verification | Phase 0 maintenance                     | **RESOLVED 2026-05-10**: WP-Cron daily pruning job added (7-day retention for engine_runs, 14-day for audit_events) |
| Non-EA watchlist symbols can still show TD `rate-limited` | Medium   | 2026-05-05 v13 verification | Health display for TD-dependent symbols | Accepted behavior; do not clear globally from EA pushes                                                             |

> **New escalations automatically flagged** by phase monitoring agent when:
>
> - Parity drops below threshold
> - Critical bug scan report ingested
> - Branch stalled (7+ days no commits)
> - Success criteria verification fails

---

## Recent Bug Scan Reports

| Report                                                             | Date       | Phase | Issues Found                                                                                                                                                      | Status   |
| ------------------------------------------------------------------ | ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `BUG_SWEEP_REPORT_2026-05-29_mt5-signal-lifecycle-suppression.md`  | 2026-05-29 | 4/6   | Same-range duplicate candidate suppression hardened; parity validator self-test remained green; no new Phase 4 blocker removed the paired-export gate requirement | Verified |
| `BUG_SWEEP_REPORT_2026-05-29_mt5-multitf-aov-signal-hardening.md`  | 2026-05-29 | 4/6   | MT5 signal-input hardening landed; repository parity validator self-test still PASS; did not produce final live paired-export evidence                            | Verified |
| `BUG_SWEEP_REPORT_2026-05-29_live-signals-freshness-contract.md`   | 2026-05-29 | 4     | Backend/dashboard freshness contract hardened; Phase 4 remained gated on paired exports and manual closeout evidence                                              | Verified |
| `BUG_SWEEP_REPORT_2026-05-27_us30-nas100-symbolselect.md`          | 2026-05-27 | 4     | Explicit MT5 `SymbolSelect()` startup hardening for US30/NAS100 verified                                                                                          | Verified |
| `BUG_SWEEP_REPORT_2026-05-27_admin-health-feedstatus-typeerror.md` | 2026-05-27 | 4     | Admin health payload guard shipped; missing health objects now resolve to `unknown` without masking state truth                                                   | Verified |
| `BUG_SWEEP_REPORT_2026-05-25.md`                                   | 2026-05-25 | 3     | 3 confirmed (2 HIGH, 1 MEDIUM) — all in regression harness, not production logic; admin soak DOM restored, Vitest scope hardened, streak fixture corrected        | Verified |
| `BUG_SWEEP_REPORT_2026-05-24.md`                                   | 2026-05-24 | 2/3   | 1 confirmed (HIGH synthetic quote timestamp in `build_symbol_state()`) — patched; `updatedAt=null` for missing-price path; GBPUSD candle-only regression added    | Verified |
| `BUG_SWEEP_REPORT_2026-05-22.md`                                   | 2026-05-22 | 2     | 1 confirmed (LOW lint/Prettier) — patched; 0 critical/high; all core systems confirmed correct                                                                    | Verified |
| `BUG_SWEEP_REPORT_2026-05-10.md`                                   | 2026-05-10 | 0     | 3 confirmed (1 high DB growth, 2 low dead methods) — all patched                                                                                                  | Verified |
| `BUG_SWEEP_REPORT_2026-05-09.md`                                   | 2026-05-09 | 0     | 2 confirmed (charts route lockfile + backendReady gate) — all patched                                                                                             | Verified |
| `BUG_SWEEP_REPORT_2026-05-05_V13-MT5-Authority-Verification.md`    | 2026-05-05 | 0     | 0 blockers; 2 deferred maintenance items                                                                                                                          | Verified |
| `BUG_SWEEP_REPORT_2026-05-05_MT5-Candle-Ingestion-Verification.md` | 2026-05-05 | 0     | Candle ingestion verified; hourly/reconnect checks pending                                                                                                        | Verified |
| `BUG_SWEEP_REPORT_2026-05-04_POST_PATCH_VERIFICATION.md`           | 2026-05-04 | 0     | 40/40 regression pass; 3 deferred risks                                                                                                                           | Verified |

> **Auto-ingested from**: `.github/docs/BUG_SWEEP_REPORT_*.md`

---

## Weekly Status Snapshots

| Week     | Generated  | Phases On-Track                            | Phases At-Risk                           | Phases Blocked | Action Items                                                                                                                  |
| -------- | ---------- | ------------------------------------------ | ---------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-W29 | 2026-07-16 | BACKEND-0 Database Layer COMPLETE           | PostgreSQL provider wiring    | None           | DB layer restructured to `src/lib/db`; 8 query fns + types + 14 mocked integration tests passing; `tsc` clean. Shared contracts authored. Live-DB validation deferred (no Docker). |
| 2026-W29 | 2026-07-16 | BACKEND-1 Auth + critical endpoints COMPLETE | Settings endpoint; live-DB validation    | None           | jose JWT auth + refresh-token rotation; 4 auth + 2 EA/market-data endpoints; refresh_sessions table; 21 new tests (39 total) passing; `tsc` clean. |
| 2026-W29 | 2026-07-17 | BACKEND-1 Settings endpoint COMPLETE        | Live-DB validation (staging)         | None           | `settings` JSONB column + migration 004; PATCH merge via transaction + row-locked (`FOR UPDATE`) deep merge; Zod validation; GET/PUT/POST/PATCH /api/user/settings; 8 new tests (47 total) passing; `npm run typecheck` + `npm run test:integration` green. |
| 2026-W22 | 2026-05-27 | Phase 3 COMPLETE; Phase 4 live soak active | Phase 4 live parity gate                 | None           | EA deployed live. T0 baseline captured/exported. Await 30-day corpus, Pine snapshots, and validator run.                      |
| 2026-W20 | 2026-05-14 | Phase 1 groundwork                         | Phase 0 signal/freshness parity closeout | Phase 0        | Fix NAS100/US30 freshness, XAUUSD candle history, and chop-gate blockers before any phase advance                             |
| 2026-W21 | 2026-05-25 | Phase 3 COMPLETE — Phase 4 authorized      | Phase 4 Track A lead unassigned          | None           | 72h soak CLOSED. Gate CONDITIONAL PASS. Bug sweep harness repaired. Phase 4 docs created. T0 admin baseline pending operator. |
| 2026-W20 | 2026-05-15 | Phase 0 COMPLETE — Phase 1 active          | Phase 1 live bridge validation           | None           | NAS100/US30/XAUUSD live validated. Frontend fixed. Watchlist persistence 100%. Phase 0 gate PASSED.                           |

> **Auto-generated**: Every Sunday by migration project manager agent
> **Location**: `.github/migration/weekly-status-[YYYY-MM-DD].md`

---

1. ✋ **Never migrate multiple engines simultaneously** — phases are sequential gates
2. ✋ **Every migration phase must achieve parity before next phase** — slip parity = prevent advancement
3. ✋ **Never remove Pine authority until MT5 parity proven** — dual-run validation is mandatory
4. ✋ **Execution only comes after analytical parity** — no trades before Phase 6 validation

---

## Migration Velocity

| Phase Group | Duration        | Buffer          |
| ----------- | --------------- | --------------- |
| Phases 0–2  | 2–4 weeks       | 1 week          |
| Phases 3–5  | 4–8 weeks       | 1 week          |
| Phase 5B    | 3–5 weeks       | 1 week          |
| Phases 6–7  | 4–6 weeks       | 1 week          |
| Phases 8–10 | 4–8 weeks       | 1 week          |
| **TOTAL**   | **~4–6 months** | **Recommended** |

---

## Architecture Refactor Summary (2026-06-17)

**Key Findings from Architecture Review**:
- Repository is a trading platform workspace containing React dashboard, WordPress REST backend, MT5 EA, SDK, and operational automation
- Core problem: authoritative business rules spread across multiple layers with inconsistent ownership
- Backend truth mixed with transport/persistence logic, MT5 logic mirrors backend instead of publishing canonical facts
- Frontend hooks contain application orchestration, authority handling, cache policy, and domain normalization
- Solution: backend must become explicit authority host for every business truth before broader extraction

**Source-of-Truth Matrix**:
- Signal truth: WordPress backend operational authority, Pine parity reference → Phase 6 consolidation
- Plan truth: WordPress backend authority → Phase 7 consolidation
- Regime truth: WordPress backend operational authority, Pine parity reference → Phase 5 consolidation
- License truth: WordPress backend authority → Phase 9 consolidation
- Dashboard truth: Backend owns data truth; frontend owns view-state only → Phase 7 consolidation

**Route-to-Use-Case Mapping**:
- EA Bridge Ingest routes target BridgeIngestService, HeartbeatService, AccountSyncService, etc.
- Market/Regime/Signal reads target DashboardSnapshotService, SignalBoardQueryService, etc.
- Plan/Execution routes target TradePlanService, ExecutionRequestService, etc.
- Admin/Soak/Telemetry routes target AdminHealthService, SoakReportService, etc.

**Projection and Contract Inventory**:
- Key projection surfaces: engine_snapshot cache, display_signals, trade_plans, regime_snapshots, mt5_signal_candidates
- Contract duplication risks: frontend vs SDK types, client normalization, plan policy, freshness vocabulary
- All runtime changes to these surfaces must wait for owning migration phase

## Canonical Feed Stabilization Implementation (2026-06-17)

**Objective**: Ensure all authenticated users share the same fresh price/candle/regime inputs per normalized symbol.

**Code Changes Implemented**:
- **PHP Backend**: Wired `CanonicalMarketResolver` into `fetch_shared_market_quote()` and `fetch_candles()` to select freshest feed_key across all users. Added `no_cache_response()` to `get_regimes()` and `get_market_data_authority()` for strict cache control.
- **TypeScript Frontend**: Added conditional placeholder guard in `useSniperData.ts` - when any price is `state !== 'live'`, force fresh fetch instead of using `keepPreviousData`.
- **Tests**: Upgraded `test-canonical-market-resolver.php` from stub tests to 6 comprehensive regression test specifications.

**Verification Commands**:
```bash
# Cache header smoke test with authenticated users
export PARITY_USER_A=user_parity_a
export PARITY_USER_B=user_parity_b
export PARITY_PASSWORD=your_password

# Authenticate and obtain tokens
TOKEN_A=$(curl -s -X POST https://trader.stokvelsociety.co.za/wp-json/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$PARITY_USER_A\",\"password\":\"$PARITY_PASSWORD\"}" \
  | jq -r '.token // .access_token')

TOKEN_B=$(curl -s -X POST https://trader.stokvelsociety.co.za/wp-json/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$PARITY_USER_B\",\"password\":\"$PARITY_PASSWORD\"}" \
  | jq -r '.token // .access_token')

# Verify anti-cache headers for PARITY_USER_A
curl -I -H "Authorization: Bearer $TOKEN_A" https://trader.stokvelsociety.co.za/wp-json/sniper/v1/regimes
# Must include all three anti-cache headers:
# - Cache-Control: no-store, no-cache, must-revalidate, max-age=0
# - Expires: 0
# - Pragma: no-cache

# Verify anti-cache headers for PARITY_USER_B
curl -I -H "Authorization: Bearer $TOKEN_B" https://trader.stokvelsociety.co.za/wp-json/sniper/v1/regimes
# Must include all three anti-cache headers:
# - Cache-Control: no-store, no-cache, must-revalidate, max-age=0
# - Expires: 0
# - Pragma: no-cache

# Two-user parity validation
scripts/collect-parity-baseline.sh > reports/pre-patch.json
scripts/collect-parity-validation.sh > reports/post-patch.json
```

**Success Criteria After Merge**:
- Two authenticated users on same watchlist get identical `feed_key` per symbol
- Stale prices marked with `state: 'stale'`, not `'live'`
- `/regimes` and `/market-data-authority` return cache headers
- Plan page doesn't show stale price via placeholder
- No regressions in existing signal logic

## Document Links

- Migration Plan: [See root migration specification]
- Phase Implementation Summary: `PHASE_IMPLEMENTATION_SUMMARY.md` (consolidated phase overview)
- Parity Audit Archives: `.github/migration/audits/`
- Phase Checklists / Updates: `.github/migration/phase-updates/`
- Test Logs: `.github/migration/test-logs/`
- Risk Register: `.github/migration/RISK_REGISTER.md` (created 2026-05-25)
- Architecture Review: `reports/architecture-review-clean-hexagonal-plan-2026-06-17.md` (merged summary above)
- Source-of-Truth Matrix: `reports/source-of-truth-matrix-2026-06-17.md` (merged summary above)
- Route-to-Use-Case Map: `reports/route-to-use-case-map-2026-06-17.md` (merged summary above)
- Projection Inventory: `reports/projection-and-contract-inventory-2026-06-17.md` (merged summary above)

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

| Track               | Lead  | Email                   | Scope      | Status                                                                      |
| ------------------- | ----- | ----------------------- | ---------- | --------------------------------------------------------------------------- |
| Track A — MT5 EA    | admin | klintaruvinga@gmail.com | Phases 1–7 | Phase 1 COMPLETE (2026-05-20) — Phase 2 telemetry contract sign-off pending |
| Track B — Backend   | admin | klintaruvinga@gmail.com | Phases 1–9 | Phase 1 COMPLETE (2026-05-20) — Phase 2 planning in progress                |
| Track C — Dashboard | admin | klintaruvinga@gmail.com | Phases 2–9 | Phase 0 complete — Phase 1 unblocked                                        |
