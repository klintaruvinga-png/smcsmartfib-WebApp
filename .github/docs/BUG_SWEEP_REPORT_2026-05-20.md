# SMC SuperFIB Bug Sweep Report

**Date**: 2026-05-20  
**Workflow ID**: stabilize-ea-2026-05-20  
**Agent**: Claude Code Stabilization Agent  
**Branch**: `claude/nice-fermat-zsVsp`  
**Base Commit**: `f89d4de9c5217bf8d4f50df571a45fc53c9daa18`  
**Phase Context**: Phase 1 COMPLETE — Phase 2 PLANNING-IN-PROGRESS

---

## Executive Summary

**System Health**: STABLE  
**Bugs Found**: 0 critical / 0 high / 0 medium / 1 low (documentation inconsistency)  
**Fixes Applied**: 1 (migration-status.md Phase 1 section closeout)  
**Remaining Risks**: None blocking deployment or migration advancement  
**Migration Readiness**: Phase 1 COMPLETE. Phase 2 planning unblocked pending Track A/B contract sign-off.

**Snapshot Archive**: `reports/snapshots/stabilize-ea-2026-05-20/`  
**Rollback Command**: `git reset --hard rollback/stabilize-ea-2026-05-20-before-patches`

---

## Confirmed Problems

### MIGRATION-001 — Phase 1 Status Field Stale in migration-status.md

| Field | Value |
|---|---|
| Severity | LOW |
| System | Documentation |
| Root Cause | Phase 1 section body status field was not updated when the 48h continuity gate passed on 2026-05-20 |
| Impact | Status board shows inconsistent Phase 1 state (COMPLETE in summary table, IN-PROGRESS in section) |
| Files Affected | `.github/migration-status.md` |
| Fixed | YES — see Surgical Fixes below |

### ENV-001 — npm lint / build skipped (environment-only)

| Field | Value |
|---|---|
| Severity | INFO |
| System | CI Environment |
| Root Cause | node_modules not installed in remote execution container |
| Impact | Cannot run `npm run lint` or `npm run build` in this session |
| Files Affected | None — code is not affected |
| Fixed | N/A — run `npm install` in deployed environment before CI |

---

## Surgical Fixes Applied

### PATCH-001 — Phase 1 Section Closeout in migration-status.md

**Files changed**: `.github/migration-status.md`

**Changes:**
- Phase 1 section `**Status**` field: `IN-PROGRESS (Scenario validation passed; 48h continuity window pending)` → `COMPLETE`
- Added `**Completed**: 2026-05-20` field
- Completion Target: added `✅` marker
- 48h continuity gate item: `[ ]` → `[x]` with evidence reference
- Test checklist header: updated to `(All items complete)`
- Blockers: 48h continuity blocker struck through with CLEARED 2026-05-20 and artifact reference
- Phase Summary table: Phase 1 Blocker → `None — gate passed 2026-05-20`, Target End → `2026-06-01 ✅`
- Track Assignments: Phase 1 PASSED → Phase 1 COMPLETE (2026-05-20), phase 2 contract sign-off pending
- Current Phase header: updated to Phase 2
- Key Contacts table: updated Track A/B status

**Regression protection**: Documentation-only. No logic, no runtime behavior changed.  
**Rollback before**: `rollback/stabilize-ea-2026-05-20-before-patches`  
**Rollback after**: `rollback/stabilize-ea-2026-05-20-after-patch-1`

---

## EA Integration Status

| Item | Status |
|---|---|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth model | Shared-secret API key (`X-EA-API-Key` header) |
| Required header | `X-EA-API-Key` (aliases: `x_ea_api_key`, `X-API-KEY`, `x_api_key`) |
| Secret env | `SMC_SF_EA_API_KEY` (PHP constant or `getenv()`) |
| user_id requirement | Required at permission callback layer (`permission_ea_bridge`) |
| Missing token | 401 `smc_sf_api_key_missing` |
| Unconfigured key | 503 `smc_sf_api_key_unconfigured` |
| Invalid token | 403 `smc_sf_api_key_invalid` |
| Missing user_id | 400 `smc_sf_user_required` |
| Invalid user_id | 403 `smc_sf_user_invalid` |
| wp_set_current_user | Called on successful auth |
| Staleness threshold | 300s hard reject (422), 120–300s warn |
| OHLC guard | YES — high≥max(open,close), low≤min(open,close) |
| Epoch guard | YES — candles before 2000-01-01 rejected |
| Future candle guard | YES — candle_time ≥ stream_timestamp rejected |
| Tick volume guard | YES — non-numeric or negative clamped to 0 |
| Symbol normalization | YES — broker aliases mapped (GOLD→XAUUSD, WALLSTREET→US30, etc.) |
| Canonical candles[] array | SUPPORTED — compat layer at line 1875 |
| Phase 1 bridge routes | All 5 confirmed PASS (2026-05-18 / 2026-05-20) |

**Phase 1 bridge routes all confirmed operational:**
- `POST /ea/heartbeat` — ✅ PASS (48h+ continuity confirmed)
- `POST /ea/account-sync` — ✅ PASS (account_id=32206603 stored)
- `POST /ea/symbol-sync` — ✅ PASS (27 symbols upserted)
- `GET  /ea/license-check` — ✅ PASS (hard gate working)
- `POST /ea/market-stream` — ✅ PASS (auth/transport verified)

---

## Parity Verification

| Component | Status | Notes |
|---|---|---|
| Pine ↔ Backend signal | PASS (audited paths) | No drift in audited paths per phase-0-full-parity-2026-05-14.md |
| Backend → Dashboard | PASS | FreshnessBadge uses backend state; VerdictBadge uses backend verdict |
| Backend → MT5 (field names) | PASS | All EA-sent fields matched to PHP handler; both candle formats accepted |
| Timestamp parity (UTC) | PASS | Broker timestamp preserved; not replaced with server fetch time |
| Equity index session | PASS | NAS100/US30 off-session excluded from stale count |
| XAUUSD symbol normalization | PASS | GOLD→XAUUSD alias in map_symbol_aliases() |
| NAS100/US30 freshness | PASS | Live at 16:37 UTC 2026-05-15 |
| Watchlist authority | PASS | 100% parity confirmed phase 0 |
| Known drift (display-only) | Session killzone windows (07-11/12-16 UTC) vs MT5 full sessions | Intentional; not a blocker |

---

## Migration Status Update

| Phase | Status | Gate |
|---|---|---|
| Phase 0 | COMPLETE (2026-05-15) | All blockers cleared |
| Phase 1 | COMPLETE (2026-05-20) | 48h continuity confirmed |
| Phase 2 | PLANNING-IN-PROGRESS (10%) | Track A/B telemetry contract sign-off pending |

**Blockers addressed this workflow**: MIGRATION-001 (Phase 1 doc inconsistency)  
**Remaining blockers**: Phase 2 telemetry contract sign-off  
**Immediate next steps**:
1. Track A and Track B complete Phase 2 telemetry contract sign-off
2. Finalize Phase 2 implementation plan (`PHASE2_IMPLEMENTATION.md`)
3. Begin Phase 2 EA telemetry work (open positions, pending orders, account metrics, trade history)

---

## Regression Checklist

- [x] PHP syntax check passes on all plugin files
- [x] `npm run check:mql` passes
- [x] `authority-diagnostics` returns 401 for unauthenticated requests (confirmed)
- [x] Admin routes require `manage_options` (confirmed)
- [x] EA route uses `X-EA-API-Key` shared-secret auth (confirmed)
- [x] EA route requires valid `user_id` in payload (confirmed at permission callback layer)
- [x] EA payload validation exists — stale quotes rejected (300s), malformed rejected (confirmed)
- [x] Backend authority preserved — signals generated from backend DB, not frontend (confirmed)
- [x] Dashboard does not fake live state — FreshnessBadge uses backend `state` (confirmed)
- [x] Signal engine does not run on stale data — freshness gating in signal readiness (confirmed)
- [x] NAS100/US30 equity session off-hours handled — excluded from stale count (confirmed)
- [x] XAUUSD symbol normalization — GOLD alias mapped (confirmed)
- [x] Watchlist mutations invalidate engine snapshot cache (confirmed)
- [ ] npm run lint — SKIPPED (node_modules not installed in CI environment)
- [ ] npm run build — SKIPPED (vite not installed in CI environment)

---

## Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| npm build/lint not runnable in this CI environment | LOW | Run `npm install && npm run build && npm run lint` before any dashboard deployment |
| Phase 2 telemetry contract not yet signed | MEDIUM | Track A/B must sign off before Phase 2 implementation begins |
| Phase 2 scope (open positions, orders, trade history) not yet contracted | MEDIUM | Readiness package `PHASE2_IMPLEMENTATION.md` target: pre-sign-off |

---

## Safe Deployment Order

1. PHP plugin: no changes this run — deploy as-is.
2. Frontend dashboard: run `npm install && npm run build` before deployment.
3. MT5 EA: no changes this run — deploy current compiled `.ex5` from last Phase 1 build.
4. `migration-status.md`: committed and pushed as documentation update.

---

## Rollback Procedure

```bash
# Return to state before any patches
git reset --hard rollback/stabilize-ea-2026-05-20-before-patches

# Or return to initial state (same commit in this run)
git reset --hard snapshot/stabilize-ea-2026-05-20-start-20260520T000000Z

# Emergency full rollback
git checkout main && git reset --hard origin/main
```

---

## EA Test Commands

### Missing token test (expect 401)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Invalid token test (expect 403)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Missing user_id test (expect 400)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
```

### Valid full payload test (expect 200)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-20T00:00:00Z",
    "quote_time": "2026-05-20T00:00:00Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-19T23:59:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
```
