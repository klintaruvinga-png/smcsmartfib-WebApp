# SMC SuperFIB Bug Sweep Report — 2026-05-16

**Workflow ID**: stabilize-ea-2026-05-16  
**Branch**: claude/nice-fermat-Vv4MK  
**Date**: 2026-05-16  
**Performed by**: Stabilization Agent  
**Plugin Version**: 13.0.3  
**Phase**: Phase 1 — MT5 Bridge Infrastructure (20%)

---

## Executive Summary

| Item | Status |
|------|--------|
| System Health | **STABLE** |
| Bugs Found | 1 (LOW severity — Prettier formatting) |
| Bugs Fixed | 1 (lint auto-fix applied) |
| Critical Issues | 0 |
| High Issues | 0 |
| Remaining Risks | 1 (Phase 1 live MT5 validation pending) |
| Migration Readiness | Phase 0 COMPLETE — Phase 1 20% (awaiting live bridge validation) |
| Snapshot Archive | reports/snapshots/stabilize-ea-2026-05-16/ |
| Rollback Command | `git reset --hard c83222df1fb2d7712377eadcf94b67f7b42e5c42` |

**Overall assessment**: The SMC SuperFIB codebase is in a stable, hardened state entering Phase 1. All Phase 0 blockers were resolved in prior workflow runs. This sweep found zero new architectural, security, or data-integrity issues. One cosmetic lint error was fixed. All checks pass.

---

## Confirmed Problems

### LINT-001 — Prettier Trailing Comma Errors

| Property | Detail |
|----------|--------|
| Severity | LOW |
| System | Frontend TypeScript |
| Root Cause | Three return objects/function calls lacked trailing commas after recent Phase 0 patches |
| Impact | CI lint gate fails; no runtime impact |
| Files Affected | `scripts/pipeline-watcher.test.mjs`, `src/hooks/useSniperData.watchlist.test.tsx`, `src/lib/api/sniperClient.ts` |
| Status | **FIXED** |

---

## Surgical Fixes Applied

### PATCH-1 — Prettier auto-fix

| Property | Detail |
|----------|--------|
| Tool | `npm run lint -- --fix` |
| Files Changed | 3 (formatting only) |
| Logic Changed | No |
| Regression Risk | None |
| Rollback Tag Before | `rollback/stabilize-ea-2026-05-16-before-patches` |
| Rollback Tag After | `rollback/stabilize-ea-2026-05-16-after-patch-1` |
| Commit | `4926afcd2d077dd149ff2f244caaafde1eb79e2d` |

**Changes**:
- `scripts/pipeline-watcher.test.mjs:45` — wrap long `isActivePhaseUpdatePath()` call with trailing comma
- `src/hooks/useSniperData.watchlist.test.tsx:78` — trailing comma on `.includes()` call cast argument
- `src/lib/api/sniperClient.ts:398` — expand `postWatchlistAdd` return object to multi-line with trailing comma

---

## EA Integration Status

| Property | Value |
|----------|-------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth Model | Shared-secret API key |
| Required Header | `X-EA-API-Key` (also: `x_ea_api_key`, `X-API-KEY`, `x_api_key`) |
| Secret Env Var | `SMC_SF_EA_API_KEY` (PHP constant or `getenv()`) |
| Hash Function | `hash_equals()` — timing-safe |
| user_id Required | Yes — rejected with 400 if missing, 403 if invalid |
| wp_set_current_user | Called before returning true |
| Stale Rejection | Yes — `quote_time` > 300s old → 422 |
| OHLC Guard | Yes — `high >= max(open,close)` and `low <= min(open,close)` |
| Epoch Guard | Yes — candle time must be after 2000-01-01 |
| bid/ask Guard | `is_finite() && > 0 && bid <= ask` |
| tick_volume Guard | Non-numeric → 0; negative → 0 (audited) |
| quote_time Alias | `!empty()` test — handles empty-string edge case |
| candles[] Shim | `candles[0]` promoted to M1 with `tick_volume→volume` mapping |
| M15 Candle Support | Yes — separate `candle_m15` field with same guards |
| Phase 1 Bridge Routes | `POST /ea/heartbeat`, `POST /ea/account-sync`, `POST /ea/symbol-sync`, `GET /ea/license-check` — all implemented and regression-covered |

### EA Test Commands

```bash
# Missing token → 401
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'

# Invalid token → 403
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'

# Missing user_id → 400
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'

# Valid full payload → 200 ok
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-16T04:10:00Z",
    "quote_time": "2026-05-16T04:09:59Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-16T04:09:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
```

---

## Parity Verification

| Check | Status |
|-------|--------|
| Pine ↔ Backend Signal | PASS (inherited from `phase-0-pine-backend-parity-2026-05-14.md`) |
| Backend → Dashboard | PASS (FreshnessBadge reads backend state; VerdictBadge reads backend verdict) |
| Backend → MT5 payload | PASS (field mapping verified; quote_time alias + candles[] shim applied) |
| MT5 SymbolNormalizer | PASS (GOLD→XAUUSD, US100→NAS100, DJ30/DOW30→US30, etc.) |
| useEngineHealth staleTime | PASS (staleTime:0 confirmed in useSniperData.ts:295) |
| useStreamingTicks truth | PASS (animation only — final tick snaps to exact backend target) |
| authority-diagnostics 401 | PASS (wp_user permission — correctly 401 for unauthenticated) |
| Admin routes manage_options | PASS (confirmed in plugin) |

---

## Migration Status Update

| Property | Value |
|----------|-------|
| Current Phase | 1 — MT5 Bridge Infrastructure |
| Phase 0 | COMPLETE (gate passed 2026-05-15) |
| Phase 1 | IN-PROGRESS (20%) |

**Blockers addressed this sweep**: LINT-001 (LOW, cosmetic)

**Remaining Phase 1 blocker**: Live MT5 terminal verification of all 4 bridge routes plus market-stream coexistence (PHASE1-001). Backend routes are implemented and regression-covered — only Track A live execution is missing.

---

## Regression Checklist

| Check | Result |
|-------|--------|
| `php -l smc-superfib-sniper.php` | PASS |
| `php -l class-market-data-service.php` | PASS |
| `npm run lint` (0 errors) | PASS |
| `npm run build` | PASS |
| `npm run check:mql` | PASS |
| EA route rejects missing X-EA-API-Key | CONFIRMED (401) |
| EA route rejects invalid X-EA-API-Key | CONFIRMED (403) |
| EA route rejects missing user_id | CONFIRMED (400) |
| EA route rejects malformed payload | CONFIRMED (400) |
| EA route rejects stale quote_time | CONFIRMED (422, >300s) |
| EA route accepts valid fresh payload | CONFIRMED (200) |
| Dashboard does not mark stale data as live | CONFIRMED (backend state used) |
| Signal engine does not run on stale data | CONFIRMED (300s hard-reject) |
| authority-diagnostics returns 401 for unauthenticated | CONFIRMED (expected behavior) |
| Admin routes require manage_options | CONFIRMED |
| No false LIVE states | CONFIRMED (4-day soak evidence from Phase 0) |

---

## Remaining Risks

| Risk | Severity | Owner | Mitigation |
|------|----------|-------|-----------|
| Live MT5 bridge validation not yet executed | MEDIUM | Track A | Execute heartbeat/account-sync/symbol-sync/license-check scenarios with live MT5 terminal before Phase 1 gate |
| 9 pre-existing lint warnings | LOW | Track C | react-hooks/exhaustive-deps warnings in non-critical paths; react-refresh warnings in constants files; no runtime impact |
| Weekend MT5 behavior not formally tested | LOW | Track A | Deferred from Phase 0; schedule during Phase 1 validation window |
| Full `tsc --noEmit` pre-existing errors in plan/charts routes | LOW | Track C | Pre-existing TypeScript errors unrelated to bridge or EA paths; tracked separately |

---

## Safe Deployment Order

1. Merge this branch to `main` (no breaking changes)
2. Reload WordPress plugin (no schema changes)
3. Confirm EA heartbeat continues firing after reload
4. Run `GET /wp-json/sniper/v1/admin/health` to confirm backend is live
5. Run curl missing-token test to confirm 401 still returned
6. Proceed with Phase 1 live terminal validation (Track A)

---

## Rollback Procedure

```bash
# Emergency rollback to pre-workflow state
git reset --hard c83222df1fb2d7712377eadcf94b67f7b42e5c42

# Or rollback to main
git checkout main && git reset --hard origin/main

# All rollback tags
# snapshot/stabilize-ea-2026-05-16-start-20260516T041151Z
# rollback/stabilize-ea-2026-05-16-before-patches
# rollback/stabilize-ea-2026-05-16-after-patch-1
```

---

## Systems Not Touched

- Pine indicator source — no changes
- Fib engine logic — no changes
- Regime / chop engine — no changes
- Signal engine — no changes
- MT5 execution layer — no changes
- License / auth system — no changes
- Database schema — no changes
- REST API permissions — no changes
- CORS configuration — no changes
