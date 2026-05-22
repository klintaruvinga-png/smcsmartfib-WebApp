# Bug Sweep Report — 2026-05-22

**Workflow ID**: stabilize-ea-2026-05-22  
**Date**: 2026-05-22  
**Branch**: claude/nice-fermat-NHBxb  
**Phase Context**: Phase 0 COMPLETE, Phase 1 COMPLETE (2026-05-20), Phase 2 IN-PROGRESS (implementation complete, active-day definition approved 2026-05-22)  
**Auditor**: Claude Code Stabilization Agent

---

## Executive Summary

| Item | Value |
|------|-------|
| Overall health | **STABLE** |
| Critical bugs found | 0 |
| High-severity bugs found | 0 |
| Low-severity bugs found | 1 (FIXED) |
| Remaining risks | Low |
| Migration readiness | Phase 2 implementation complete; browser parity review recommended |
| Snapshot archive | `reports/snapshots/stabilize-ea-2026-05-22/` |
| Rollback command | `git reset --hard b2bfa866847ff4f49a653a44f7ff6f7de14252e8` |

All core systems audited and confirmed correct:
- EA market-stream ingestion auth and payload validation: ✅ CORRECT
- Signal engine stale gating: ✅ CORRECT
- Freshness and age_sec computation (from broker timestamp, not fetch time): ✅ CORRECT
- FreshnessBadge and VerdictBadge truth (reads backend state, never locally derived): ✅ CORRECT
- Symbol normalization (NAS100/NASDAQ, US30/WALLSTREET, GOLD/XAUUSD): ✅ CORRECT
- Equity index session guard (DST-aware NYSE/NASDAQ hours): ✅ CORRECT
- authority-diagnostics remains WP-session-protected (returns 401 unauthenticated): ✅ CONFIRMED
- Active-day streak computation matches approved definition: ✅ CONFIRMED

---

## Confirmed Problems

| ID | Severity | Category | Component | Root Cause | Impact | Status |
|----|----------|----------|-----------|------------|--------|--------|
| BUG-001 | LOW | Lint / Formatting | `src/routes/-progress.page.test.tsx` | Prettier formatting drift introduced when the UNAVAILABLE streak message was updated in commits ce66d12/8ffaaf0 without running autoformat. Multi-line `screen.getByText()` call at line 115 exceeded Prettier line-length limit. | CI lint gate fails with 1 error. No logic corruption. | **FIXED** |

---

## Surgical Fixes Applied

| File | Change | Logic Impact | Rollback Point |
|------|--------|-------------|----------------|
| `src/routes/-progress.page.test.tsx` | Collapsed multi-line `screen.getByText("No engine run data found for this account yet.", )` to single line | None — style only | rollback/stabilize-ea-2026-05-22-before-patches |

---

## EA Integration Status

| Item | Value |
|------|-------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Permission callback | `permission_ea_market_stream` → delegates to `permission_ea_bridge` |
| Required auth header | `X-EA-API-Key` (also accepted: `x_ea_api_key`, `X-API-KEY`, `x_api_key`) |
| Auth secret source | `SMC_SF_EA_API_KEY` PHP constant or `getenv('SMC_SF_EA_API_KEY')` |
| Comparison method | `hash_equals()` — timing-safe |
| Missing key response | 401 `smc_sf_api_key_missing` |
| Unconfigured secret response | 503 `smc_sf_api_key_unconfigured` + `error_log` |
| Invalid key response | 403 `smc_sf_api_key_invalid` |
| `user_id` required | Yes — validated in permission callback before handler runs |
| Missing `user_id` response | 400 `smc_sf_user_required` |
| Invalid `user_id` response | 403 `smc_sf_user_invalid` |
| WP user context binding | `wp_set_current_user($ea_user_id)` called after validation |
| Stale data hard rejection | >300s → 422 with audit log |
| Stale data warning | 120–300s → error_log warning, snapshot still writes |
| Candle OHLC validation | `validate_ohlc()` — high ≥ max(open,close), low ≤ min(open,close) |
| Candle epoch guard | Rejects candles before 2000-01-01 |
| Candle future guard | Rejects candles with time ≥ stream timestamp |
| Candle M1 age gate | Rejects if age > 180s |
| Candle M15 age gate | Rejects if age > 1800s |
| tick_volume handling | `guard_tick_volume()` — clamps to non-negative int, audits negatives/non-numeric |
| Canonical `candles[]` array | Compat layer: `candles[0]` promoted to `candle`; extra entries audited |

---

## Payload Contract

```json
{
  "user_id": 1,
  "symbol": "EURUSD",
  "timeframe": "M1",
  "source": "MT5",
  "server_time": "2026-05-22T04:00:00Z",
  "quote_time": "2026-05-22T04:00:00Z",
  "bid": 1.08521,
  "ask": 1.08534,
  "spread": 1.3,
  "candles": [
    {
      "time": "2026-05-22T03:59:00Z",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "tick_volume": 123
    }
  ]
}
```

---

## Parity Verification

| Domain | Result | Notes |
|--------|--------|-------|
| MT5 payload fields vs PHP handler fields | PASS | All canonical and legacy field aliases covered |
| UTC timestamp handling end-to-end | PASS | Broker timestamp preserved; `age_sec` from quote_time not fetch time |
| EA auth model | PASS | All 5 error cases confirmed |
| Stale data rejection | PASS | 300s hard-reject, 120s warn |
| OHLC candle validation | PASS | epoch, future, OHLC ordering, tick_volume all guarded |
| Signal engine stale gating | PASS | Blocks non-MT5, non-live, age>threshold, candles>7200s |
| FreshnessBadge truth | PASS | Reads backend state only; unknown state falls back to STALE |
| Backend authority | PASS | Backend is source of truth; frontend derives nothing locally |
| authority-diagnostics protection | PASS | 401 for unauthenticated; permission_user |
| Symbol normalization | PASS | NAS100, US30, XAUUSD, XAGUSD all aliased |
| Equity session guard | PASS | DST-aware NYSE/NASDAQ hours guard |
| Active-day streak computation | PASS | Matches CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN definition |
| Watchlist persistence | PASS | Optimistic update + server-canonical reconciliation |

---

## Migration Status Update

| Item | Status |
|------|--------|
| Phase 0 | COMPLETE (2026-05-15) |
| Phase 1 | COMPLETE (2026-05-20) |
| Phase 2 | Implementation COMPLETE; active-day definition approved 2026-05-22; browser parity review recommended |
| Phase 3 | Planning only (5%); gated on Phase 2 closeout |

### Active-Day Definition
**RESOLVED 2026-05-22**: `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` — any completed engine run in `engine_runs` (status=`complete`) for the user counts as an active day. Historical backfill included. Streak state is `LIVE` for users with engine run history.

---

## Regression Checklist

- [x] `npm run lint` — 0 errors (9 pre-existing warnings)
- [x] `npm run build` — PASS (built in 7.36s)
- [x] `npm run check:mql` — PASS (MQL include verification passed)
- [x] `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — PASS
- [x] `php -l wordpress/smc-superfib-sniper/class-market-data-service.php` — PASS
- [x] EA route confirmed — POST /sniper/v1/ea/market-stream exists and uses `permission_ea_market_stream`
- [x] EA auth confirmed — missing key → 401; unconfigured → 503; invalid → 403; missing user_id → 400; invalid user_id → 403
- [x] Signal engine — gates on mt5 source, live state, age threshold, candle freshness
- [x] authority-diagnostics — confirmed WP-session-protected (permission_user)
- [x] FreshnessBadge — reads backend state; no local age computation
- [x] VerdictBadge — reads backend verdict; no local derivation
- [x] age_sec — computed from broker timestamp (not fetch time) via iso_age_sec(updated_at)

---

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Phase 2 browser parity review not yet completed | Low | Account card, positions, floating P/L, hedge grouping need manual browser check |
| Phase 3 multi-candle batch ingestion | Low | Only candles[0] stored; extra entries produce audit log diagnostic |
| Regime-engine parity coverage | Low | No dedicated regime replay suite; covered indirectly by health/snapshot tests |
| Signal-engine parity coverage | Low | No direct signal replay suite; indirectly verified via candle+price gate checks |

---

## Safe Deployment Order

1. Merge `claude/nice-fermat-NHBxb` (current branch) — contains lint fix and snapshot archive
2. Run browser parity review for Phase 2 telemetry panels (account card, positions, floating P/L, hedge grouping)
3. If review passes, advance Phase 2 status to COMPLETE in migration-status.md
4. Begin Phase 3 planning: full `candles[]` batch ingestion, MT5-authoritative candle engine

---

## Rollback Procedure

### Standard rollback to pre-patch state
```bash
git reset --hard b2bfa866847ff4f49a653a44f7ff6f7de14252e8
```

### Emergency rollback to main
```bash
git checkout main && git reset --hard origin/main
```

### Rollback tags available
- `snapshot/stabilize-ea-2026-05-22-start-20260522T040000Z` — initial clean state
- `rollback/stabilize-ea-2026-05-22-before-patches` — same as initial
- `rollback/stabilize-ea-2026-05-22-after-patch-1` — current HEAD (lint fix applied)

---

## EA Testing Commands

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

### Stale payload test (expect 422)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"user_id":1,"symbol":"EURUSD","quote_time":"2026-01-01T00:00:00Z","bid":1.08,"ask":1.0801}'
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
    "server_time": "2026-05-22T04:00:00Z",
    "quote_time": "2026-05-22T04:00:00Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-22T03:59:00Z",
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

## Do Not Touch List

- `permission_ea_bridge` / EA authentication callbacks
- `authority-diagnostics` protection rules
- Signal engine stale gating (`price_source`, `price_state`, `price_age`, `candle_age_sec` gates)
- Pine formulas unless parity defect is explicitly reproduced
- `ACTIVE_DAY_DEFINITION` — already approved 2026-05-22
- MT5 MQL5 trading formulas (no parity corruption identified)
