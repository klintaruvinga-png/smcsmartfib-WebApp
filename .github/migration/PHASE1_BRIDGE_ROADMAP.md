# Phase 1 Bridge Roadmap

**Last-Updated**: 2026-05-15
**Phase**: 1
**Status**: IN-PROGRESS
**Current Phase Completion**: 20%
**Target Gate Date**: 2026-06-01

---

## 1. Objective And Scope Boundary

Phase 1 exists to prove stable MT5 EA to backend bridge operation under live terminal conditions.
This phase covers bridge transport, authentication, heartbeat continuity, account sync, symbol sync,
and the existing market-stream path.

In scope:
- MT5 EA live bridge validation
- Backend operational validation for `/ea/license-check`, `/ea/heartbeat`, `/ea/account-sync`, `/ea/symbol-sync`
- Live verification of the existing `/ea/market-stream` path as part of bridge integrity
- Terminal telemetry and reconnect behavior

Out of scope:
- Dashboard feature work
- Pine formula changes
- Signal, fib, regime, or execution-engine migration
- Any frontend-owned signal truth

Track C is explicitly deferred until Phase 2. Phase 1 does not authorize dashboard implementation work.

---

## 2. Track Assignments

| Track | Responsibility | Phase 1 role | Status |
|---|---|---|---|
| Track A - MT5 EA | EA deployment, terminal operation, live scenario execution | Owns live terminal validation and scenario evidence capture | ACTIVE |
| Track B - Backend | Route validation, auth gate verification, persistence/log review | Owns backend verification for each EA scenario | ACTIVE |
| Track C - Dashboard | Dashboard telemetry and UI consumption | Deferred; no Phase 1 action items | DEFERRED |

---

## 3. Deliverable Matrix

| Deliverable | Owner track | State | Evidence | Acceptance threshold |
|---|---|---|---|---|
| `POST /ea/heartbeat` | Track B | DONE | `reports/phase-1-ea-bridge-implementation-report.md` | Route implemented and regression-covered; live 48h validation still required |
| `POST /ea/account-sync` | Track B | DONE | `reports/phase-1-ea-bridge-implementation-report.md` | Route implemented and regression-covered; live terminal account sync still required |
| `POST /ea/symbol-sync` | Track B | DONE | `reports/phase-1-ea-bridge-implementation-report.md` | Route implemented and regression-covered; live terminal symbol sync still required |
| `GET /ea/license-check` | Track B | DONE | `reports/phase-1-ea-bridge-implementation-report.md` | Route implemented and regression-covered; live operational gate still required |
| Existing `POST /ea/market-stream` path | Track A + Track B | PENDING LIVE VALIDATION | Existing Phase 0 EA route remains in place | Live terminal stream must post successfully during Phase 1 validation |
| MT5 Bridge EA deployment and terminal telemetry | Track A | PENDING | `mt5/SMC_MarketDataEA.mq5` present; no live validation recorded yet | EA attached to terminal, authenticated, and posting bridge traffic without manual intervention |
| Phase 1 gate evidence package | Track A + Track B | PENDING | This roadmap, tracker, and checklist | All binary gate checks below recorded as PASS |

---

## 4. Acceptance Criteria

Phase 1 is PASS only when every criterion below is met with recorded evidence:

| Criterion | PASS threshold |
|---|---|
| Heartbeat continuity | `POST /ea/heartbeat` remains stable for 48h+ with zero observed gaps |
| Session stability | Dropped sessions = `0` during the validation window |
| Terminal restart reconnect | After terminal restart, reconnect occurs automatically and bridge traffic resumes without forcing false LIVE state |
| VPS restart reconnect | After VPS restart, reconnect occurs automatically and bridge traffic resumes without forcing false LIVE state |
| Internet interruption reconnect | After network interruption, reconnect occurs automatically and bridge traffic resumes without forcing false LIVE state |
| Duplicate heartbeat protection | Duplicate heartbeat scenario does not create duplicate live session truth or corrupt backend bridge state |
| Invalid license rejection | Invalid or blocked operational access is rejected by the bridge gate; no bypass to LIVE state is allowed |
| Account-sync verification | Backend receives and persists the expected account payload during live validation |
| Symbol-sync verification | Backend receives and persists the expected broker symbol payload during live validation |
| Market-stream verification | Existing market-stream payload reaches the backend during live validation and remains consistent with bridge auth/state |

All criteria are binary pass/fail. No partial threshold is authorized for session drops or heartbeat gaps.

---

## 5. Live Terminal Environment Requirements

The validation run cannot begin until the following environment facts are recorded in the tracker:

| Requirement | Required state |
|---|---|
| Broker | Broker name and server must be recorded before first live run |
| Account type | Validation account selection must be recorded before first live run |
| MT5 terminal build | Exact MT5 terminal build must be logged before first 48h run |
| EA deployment target | `mt5/SMC_MarketDataEA.mq5` attached to a terminal with WebRequest enabled for the backend domain |
| Bridge configuration | `WebhookURL`, `ApiKey`, and `UserId` configured for the validation environment |
| Backend access | Track B can inspect route logs, persistence results, and auth outcomes for each scenario |
| Infra access | Track A has terminal/VPS access needed for restart and reconnect scenarios |

Unknown environment fields remain blockers until they are filled in. This document does not invent broker, account, or build values that are not yet recorded.

---

## 6. Phase Gate Definition

Phase 1 is PASSED only when:
- Phase 0 remains closed with no reopened blocker
- All four additive bridge routes remain implemented and operational
- The existing market-stream path is live-validated alongside the new bridge routes
- The six tracked bridge scenarios in `PHASE1_TRACKER.md` are all marked PASS
- Track A signs off the terminal-side evidence
- Track B signs off the backend-side evidence

Phase 2 may start only after the Phase 1 PASSED declaration is recorded with date and sign-off.

---

## 7. Timeline And Checkpoints

| Checkpoint | Target | Exit condition |
|---|---|---|
| Phase 1 baseline verified | 2026-05-15 | Phase 0 closeout confirmed; backend bridge routes confirmed in codebase |
| Environment readiness | Before first live validation run | Broker, account, MT5 build, auth config, and access prerequisites recorded |
| Scenario validation window | Before 48h soak sign-off | Terminal restart, VPS restart, internet interruption, duplicate protection, and invalid license rejection all executed and recorded |
| 48h continuity window | Before Phase 1 gate review | Heartbeat continuity and zero session drops recorded for 48h+ |
| Phase 1 gate decision | 2026-06-01 | All PASS criteria complete; Track A and Track B sign-off recorded |

---

## Source References

- `.github/migration-status.md`
- `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`
- `reports/phase-1-ea-bridge-implementation-report.md`
- `mt5/SMC_MarketDataEA.mq5`
