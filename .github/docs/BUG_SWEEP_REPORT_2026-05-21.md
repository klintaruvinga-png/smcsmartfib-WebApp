# Bug Sweep Report — 2026-05-21

**Workflow ID**: stabilize-ea-2026-05-21  
**Branch**: claude/nice-fermat-B7rHO  
**Initial Commit**: 8911601bdde7efaab5aee30ba7980cc4d4154d4a  
**Date**: 2026-05-21  
**Phase Context**: Phase 1 COMPLETE (2026-05-20), Phase 2 IN-PROGRESS (75%)  

---

## Executive Summary

- **Overall Health**: Stable. All critical paths are well-hardened from prior Phase 0/1 stabilization work.
- **Bugs Found**: 2 low-severity (style/build warnings), 1 informational observation.
- **Fixes Applied**: 2 surgical patches — (1) diagnostic log for multi-candle batch payloads; (2) Prettier formatting auto-fix restoring lint to 0 errors.
- **Remaining Risks**: Active-day business rule sign-off pending; browser parity review recommended for Phase 2 before production.
- **Migration Readiness**: Phase 2 implementation is complete. No parity blockers found. Two non-code blockers remain.
- **Snapshot Archive**: `reports/snapshots/stabilize-ea-2026-05-21/`
- **Rollback Command**: `git reset --hard 8911601bdde7efaab5aee30ba7980cc4d4154d4a`

---

## Confirmed Problems

### Low Severity

| ID | Category | Severity | Root Cause | Impact | Status |
|----|----------|----------|------------|--------|--------|
| BUG-001 | Developer Experience | LOW | Pre-existing CRLF/Prettier formatting drift across src/ files (49 errors noted in 2026-05-20 report). | No runtime impact. Lint CI would fail. | **FIXED** |
| BUG-002 | Build Warning | LOW | Vite main bundle exceeds 500 kB (920 kB) — pre-existing shared router chunk accumulation. | No functionality impact. Performance/load time concern only. | Deferred — requires bundle architecture pass |

### Informational

| ID | Category | Severity | Root Cause | Impact | Status |
|----|----------|----------|------------|--------|--------|
| OBS-001 | EA Payload Handling | INFO | `candles[]` array compat layer silently drops candles beyond index 0. No warning emitted. | Unexpected multi-candle batch callers would not know their extra data was dropped. Not an issue with current EA behavior. | **PATCHED** — diagnostic log added |

---

## Confirmed Clean Systems (No Issues Found)

| System | Verdict | Notes |
|--------|---------|-------|
| EA Authentication (`permission_ea_bridge`) | ✅ CORRECT | All 6 auth gates verified: missing key → 401, unconfigured → 503, invalid → 403, missing user_id → 400, invalid user_id → 403, wp_set_current_user called |
| EA Payload Validation (`post_ea_market_stream`) | ✅ CORRECT | symbol required; bid/ask finite+positive+bid≤ask; quote_time/timestamp compat; stale >300s rejected (422); candle epoch guard; OHLC validated; tick_volume clamped; future-candle guard |
| Freshness / `age_sec` Calculation | ✅ CORRECT | `age_sec` computed from `updated_at` (broker timestamp in DB) via `iso_age_sec()`, not from fetch time. Backend authoritative. |
| `FreshnessBadge` Component | ✅ CORRECT | Reads `state` from backend response. No local freshness derivation. Has unknown-state guard. |
| `VerdictBadge` Component | ✅ CORRECT | Reads `verdict` from backend signal data. No local derivation. |
| `authority-diagnostics` Route | ✅ PROTECTED | Uses `permission_user` (WP session required). Returns 401 unauthenticated. Correct by design. |
| Admin Routes | ✅ PROTECTED | All `/admin/*` routes use `permission_admin` (manage_options). Returns 401/403 for non-admin. |
| Signal Engine Stale Gating | ✅ CORRECT | Engine gates on `price_age > staleThresholdSec`, `price_state === 'live'`, and `candle_age_sec ≤ 7200`. Does not run on stale data. |
| `useSniperData` Polling | ✅ CORRECT | All queries gated on `backendReady && pollMs !== null`. No duplicate refresh loops. No race conditions. |
| Watchlist Mutations | ✅ CORRECT | Optimistic update + rollback on error. Backend is authoritative for watchlist. |
| `hash_equals` Usage | ✅ CORRECT | No `==` or `===` comparison used for API key validation. |

---

## Surgical Fixes Applied

### PATCH-001: Multi-Candle Batch Diagnostic Log

**File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`  
**Lines**: ~2091–2115 (compat layer for `candles[]` array)  
**Type**: Defensive logging — no behavior change  

Added `error_log()` and `$this->audit()` call when `candles[]` array has more than 1 element. This surfaces unexpected multi-candle batch payloads for investigation. The compat behavior (promote `candles[0]` to `candle`) is unchanged.

**Rollback**: `git reset --hard 8911601bdde7efaab5aee30ba7980cc4d4154d4a`

### PATCH-002: Prettier Formatting Auto-Fix

**Files**: `src/routes/progress.tsx`, `src/routes/analytics.tsx`, `src/lib/api/sniperClient.ts`, `src/lib/api/sniperClient.test.ts`  
**Type**: Style fix — `eslint --fix` auto-format  
**Result**: `npm run lint` now passes with **0 errors** (9 pre-existing warnings remain; not auto-fixable)

**Rollback**: `git reset --hard 8911601bdde7efaab5aee30ba7980cc4d4154d4a`

---

## EA Integration Status

| Item | Value |
|------|-------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth Required | Yes |
| Auth Header (Primary) | `X-EA-API-Key` |
| Auth Header Aliases | `x_ea_api_key`, `X-API-KEY`, `x_api_key` |
| Secret Source | PHP constant `SMC_SF_EA_API_KEY` → `getenv('SMC_SF_EA_API_KEY')` fallback |
| Comparison Method | `hash_equals()` — timing-safe |
| `user_id` Required | Yes (in JSON payload; validated in permission callback before handler) |
| Payload Validation | Full — symbol, bid/ask, timestamps, OHLC, tick_volume, stale guard |
| Stale Rejection Threshold | Hard reject > 300s → 422; Warn 120–300s (logged, snapshot still stored) |
| M1 Candle Age Gate | 180s max (covers 60s natural closed-bar lag + 120s jitter) |
| M15 Candle Age Gate | 1800s max |
| Missing Token Response | `{"code":"smc_sf_api_key_missing","data":{"status":401}}` |
| Invalid Token Response | `{"code":"smc_sf_api_key_invalid","data":{"status":403}}` |
| Missing `user_id` Response | `{"code":"smc_sf_user_required","data":{"status":400}}` |
| Stale Payload Response | `{"code":"stale_data","data":{"status":422}}` |

---

## Parity Verification

| Check | Status |
|-------|--------|
| MQL5 field names vs PHP handler | ✅ MATCH — parity confirmed in phase-0-mt5-ea-market-stream-parity-2026-05-20.md |
| PHP handler vs dashboard (prices, regimes, gates) | ✅ MATCH — backend is authoritative source for all displayed values |
| Freshness: fetch time vs broker timestamp | ✅ CORRECT — `age_sec` always uses broker timestamp from DB |
| FreshnessBadge: local vs backend | ✅ BACKEND ONLY — no local derivation |
| VerdictBadge: local vs backend | ✅ BACKEND ONLY — reads backend verdict field |
| Signal engine: authority (backend vs frontend) | ✅ BACKEND ONLY — frontend never overrides signal state |
| Pine / MT5 formulas | NO CHANGES — out of scope, no parity corruption detected |

---

## Migration Status Update

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 | ✅ COMPLETE | Gate passed 2026-05-15 |
| Phase 1 | ✅ COMPLETE | 48h continuity gate passed 2026-05-20 |
| Phase 2 | 🔄 IN-PROGRESS (75%) | Implementation complete; 2 non-code blockers remain |
| Phase 3+ | 🔲 NOT STARTED | Awaiting Phase 2 completion |

### Phase 2 Remaining Blockers

1. **MIGRATION-001 (Business Rule)**: `ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` in `smc-superfib-sniper.php` line 21. Streak calculation is intentionally UNAVAILABLE until business rule is signed off. **No code change needed — awaiting stakeholder sign-off.**

2. **MIGRATION-002 (Validation)**: Final browser parity review recommended for Phase 2 trade telemetry panels (account card, live positions, floating P/L, hedge grouping, sync health) before production deploy. **No code change needed — manual validation required.**

---

## Regression Checklist

- [x] `npm run lint` passes — 0 errors after PATCH-002
- [x] `npm run build` passes — build succeeds (chunk size warning is pre-existing)
- [x] `npm run check:mql` passes — MQL include verification passed
- [x] `php -l` passes on `smc-superfib-sniper.php` — No syntax errors
- [x] `php -l` passes on `class-market-data-service.php` — No syntax errors
- [x] EA endpoint rejects missing `X-EA-API-Key` — 401
- [x] EA endpoint rejects invalid `X-EA-API-Key` — 403
- [x] EA endpoint rejects missing `user_id` — 400
- [x] EA endpoint rejects stale `quote_time` (>300s) — 422
- [x] EA endpoint accepts valid fresh payload — 200
- [x] Dashboard does not mark stale data as live — backend controls state
- [x] Signal engine does not run on stale data — age_sec + price_state gating confirmed
- [x] `authority-diagnostics` still returns 401 for unauthenticated requests
- [x] Admin routes still require `manage_options`
- [x] Migration status checked and incorporated
- [x] No EA route duplicate created

---

## Remaining Risks

1. **Bundle size**: 920 kB main chunk triggers Vite warning. No user-visible impact currently; may become a performance concern at scale. Deferred to dedicated bundle-optimization pass.
2. **Lint warnings (9)**: Pre-existing `react-hooks/exhaustive-deps` and `react-refresh/only-export-components` warnings require logic changes, not formatting. Low priority.
3. **Active-day rule**: Until `ACTIVE_DAY_DEFINITION` is resolved, streak is intentionally UNAVAILABLE. No code risk — explicit guard in place.
4. **Phase 2 browser parity**: Recommended validation, not a code gap.

---

## Safe Deployment Order

1. Deploy WordPress plugin changes (PATCH-001 diagnostic log — no behavior change).
2. Deploy frontend build (PATCH-002 Prettier fixes — no behavior change).
3. Verify lint clean in CI after deploy.
4. Get `ACTIVE_DAY_DEFINITION` business sign-off → update constant → re-deploy plugin.
5. Run Phase 2 browser parity review.
6. If review passes → advance Phase 2 to COMPLETE.

---

## Rollback Procedure

| Step | Command |
|------|---------|
| Full rollback to pre-workflow state | `git reset --hard 8911601bdde7efaab5aee30ba7980cc4d4154d4a` |
| Emergency rollback to main | `git checkout main && git reset --hard origin/main` |
| Rollback tags | `snapshot/stabilize-ea-2026-05-21-start-20260521T0000Z`, `rollback/stabilize-ea-2026-05-21-before-patches`, `rollback/stabilize-ea-2026-05-21-after-patch-1` |

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
    "quote_time": "2026-05-21T10:00:00Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-21T09:59:00Z",
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

- Pine signal formulas and MT5 execution math.
- Backend freshness authority logic — confirmed correct.
- EA authentication callbacks — confirmed correct.
- `authority-diagnostics` public exposure — must remain protected.
- `ACTIVE_DAY_DEFINITION` constant — awaiting business sign-off before changing.
