# SMC SuperFIB Bug Sweep Report — 2026-05-18

## Executive Summary

| Item | Value |
|---|---|
| **Report Date** | 2026-05-18 |
| **Phase** | Phase 1 — MT5 Bridge Infrastructure (IN-PROGRESS, 20%) |
| **Scanner** | Claude Code Stabilization Agent (stabilize-ea-2026-05-18) |
| **Workflow ID** | stabilize-ea-2026-05-18 |
| **Branch** | claude/nice-fermat-WWAz4 |
| **Overall Health** | STABLE — no critical or high-severity bugs |
| **Bugs Found** | 1 (LOW — scripts/ prettier formatting, LINT-001 recurring) |
| **Fixes Applied** | 1 surgical patch (formatting only, zero logic change) |
| **Remaining Risks** | Phase 1 live terminal validation pending (Track A) |
| **Migration Readiness** | Phase 0 COMPLETE; Phase 1 backend DONE + transport hardened, awaiting live test |
| **Snapshot Archive** | reports/snapshots/stabilize-ea-2026-05-18/ |
| **Rollback Command** | `git reset --hard 251e24462064a60a0b97efe4900c455860534598` |

**Summary:** Full audit of the SMC SuperFIB plugin (v13.0.3), frontend dashboard, signal engine,
EA market-stream route, Phase 1 bridge routes, MQL5 EA files, and migration status. The system is
stable. All 2026-05-17 patches (user_id transport in all EA bridge payloads, observability logs,
TypeScript build hardening) are confirmed in place. One LOW-severity issue (LINT-001 recurring —
prettier formatting in scripts/pipeline-watcher.js:1353) was found and patched. No architectural
changes, no logic changes, no auth weakening.

---

## Confirmed Problems

| ID | Severity | Category | Issue | Root Cause | Impact | Files Affected |
|---|---|---|---|---|---|---|
| LINT-001 | LOW | CI / Scripts | Prettier formatting violation — chained `.slice(0,300).replace()` on one line at pipeline-watcher.js:1353 | PR #200 merge (governance/idle-edit-block) included a stop-report synthesis block that was not passed through eslint --fix before push | npm run lint reports 1 error; zero runtime or correctness impact | scripts/pipeline-watcher.js |

---

## Confirmed Non-Issues (Verified Correct)

| System | Check | Result |
|---|---|---|
| EA Auth — missing token | Returns 401 `smc_sf_api_key_missing` | CORRECT |
| EA Auth — unconfigured secret | Returns 503 `smc_sf_api_key_unconfigured` + error_log | CORRECT |
| EA Auth — hash_equals | `hash_equals($configured, $provided)` | CORRECT |
| EA Auth — invalid token | Returns 403 `smc_sf_api_key_invalid` | CORRECT |
| EA Auth — missing user_id | Returns 400 `smc_sf_user_required` | CORRECT |
| EA Auth — invalid user_id | Returns 403 `smc_sf_user_invalid` | CORRECT |
| EA Auth — user binding | `wp_set_current_user($ea_user_id)` called on success | CORRECT |
| EA Auth — header aliases | All 4 aliases checked (X-EA-API-Key, X-API-KEY, x_ea_api_key, x_api_key) | CORRECT |
| EA Auth — success observability | Auth-success log with user_id and route emitted (debug_log or WP_DEBUG) | CORRECT |
| Stale rejection | 300s hard reject (422), 120-300s warn-only, unparseable → 422 | CORRECT |
| OHLC validation | high >= max(open,close), low <= min(open,close) | CORRECT |
| Epoch guard | Pre-2000-01-01 timestamps rejected | CORRECT |
| M1 candle age | max_age_sec=180 in insert_mt5_candle() | CORRECT |
| M15 candle age | max_age_sec=1800 in insert_mt5_candle() | CORRECT |
| Tick volume guard | Non-numeric and negative clamped to 0, audited | CORRECT |
| Bid/ask check | is_finite && > 0 && bid <= ask | CORRECT |
| Symbol normalization | map_symbol_aliases() handles GOLD→XAUUSD, NASDAQ→NAS100, WALLSTREET→US30, etc. | CORRECT |
| Equity index handling | NAS100/US30 use CLOSED freshness + current wall-clock time when off-session | CORRECT |
| authority-diagnostics | Returns 401 for unauthenticated — EXPECTED | PROTECTED |
| Admin routes | All /admin/* require manage_options | PROTECTED |
| Dashboard live truth | age_sec + is_live from backend /snapshot; staleTime:0 on health; VerdictBadge from backend Verdict | CORRECT |
| Signal engine authority | Resides entirely in WordPress plugin | CORRECT |
| Phase 1 heartbeat | POST /ea/heartbeat — user_id in JSON body, dispatch log, registered with permission_ea_bridge | CORRECT |
| Phase 1 account-sync | POST /ea/account-sync — user_id in JSON body, dispatch log, registered with permission_ea_bridge | CORRECT |
| Phase 1 symbol-sync | POST /ea/symbol-sync — user_id in JSON body, dispatch log, registered with permission_ea_bridge | CORRECT |
| Phase 1 license-check | GET /ea/license-check — user_id as ?user_id= query param, dispatch log, registered with permission_ea_bridge | CORRECT |
| PHP syntax | php -l PASS on smc-superfib-sniper.php and class-market-data-service.php | PASS |
| Vite build | npm run build PASS — all modules compiled, SSR bundle generated | PASS |
| MQL5 validator | npm run check:mql PASS — all includes verified | PASS |

---

## Surgical Fixes Applied

### PATCH-1 — Prettier Formatting Fix in Scripts

| Item | Detail |
|---|---|
| **Issue** | LINT-001 |
| **Severity** | LOW |
| **Files Changed** | scripts/pipeline-watcher.js |
| **Logic Changed** | NO |
| **Regression Tests Updated** | NO (formatting only) |
| **Rollback Before** | rollback/stabilize-ea-2026-05-18-before-patches → 251e244 |
| **Rollback After** | rollback/stabilize-ea-2026-05-18-after-patch-1 → 649c08f |

**Method:** `npx eslint --fix scripts/pipeline-watcher.js` applied. The chained `.slice(0,
300).replace(/\r?\n+/g, " ").trim()` expression was split across three lines per prettier
multi-line rules. No logic, imports, exports, or function signatures changed.

**Before:**
```js
const stopSummary = stopExcerpt.slice(0, 300).replace(/\r?\n+/g, " ").trim();
```

**After:**
```js
const stopSummary = stopExcerpt
  .slice(0, 300)
  .replace(/\r?\n+/g, " ")
  .trim();
```

---

## EA Integration Status

| Item | Value |
|---|---|
| **Market Stream Route** | `POST /wp-json/sniper/v1/ea/market-stream` |
| **Auth Model** | Shared-secret API key — `X-EA-API-Key` header |
| **Auth Secret** | `SMC_SF_EA_API_KEY` constant / environment variable |
| **Aliases Accepted** | `X-EA-API-Key`, `X-API-KEY`, `x_ea_api_key`, `x_api_key` |
| **user_id Required** | Yes — at permission callback layer, before handler |
| **Stale Rejection** | 422 if quote_time older than 300s |
| **Stale Warning** | Logged (no reject) if 120–300s |
| **OHLC Validation** | high >= max(open,close), low <= min(open,close) |
| **Epoch Guard** | Candle timestamps before 2000-01-01 rejected |
| **M1 Candle Age Gate** | 180s |
| **M15 Candle Age Gate** | 1800s |
| **Symbol Normalization** | PHP + MQL5 layer (GOLD→XAUUSD, WALLSTREET→US30, etc.) |
| **Phase 1 Bridge Routes** | heartbeat, account-sync, symbol-sync, license-check all live |
| **EA Dispatch Observability** | user_id logged at each SendXxx() before WebRequest call |
| **Backend Auth Observability** | user_id + route logged after wp_set_current_user() success |

### EA Testing Commands

#### Missing token test (expect 401)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

#### Invalid token test (expect 403)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

#### Missing user_id test (expect 400)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
```

#### Valid full payload test (expect 200)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "quote_time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3
  }'
```

---

## Parity Verification

| Surface | Status | Notes |
|---------|--------|-------|
| EA → PHP market-stream payload | PASS (carry-forward from 2026-05-17 audit) | user_id, symbol, timestamp, bid, ask, candle, candle_m15 all parity-confirmed |
| EA → PHP bridge payload (heartbeat, account-sync, symbol-sync, license-check) | PASS — user_id in all payloads per 2026-05-17 patch | |
| Pine ↔ Backend fib calculations | PASS carry-forward | No fib logic changed |
| Backend → Dashboard live truth | PASS | is_live from PHP, age_sec from PHP, staleTime:0 on engine-health |
| MT5 fib engine | PENDING | Phase 4 target |
| Symbol normalization (GOLD, WALLSTREET) | PASS | map_symbol_aliases() + SymbolNormalizer.mqh confirmed |
| Equity index off-session handling | PASS | NAS100/US30 CLOSED state + wall-clock override confirmed |

---

## Migration Status Update

| Item | Status |
|---|---|
| **Current Phase** | Phase 1 — MT5 Bridge Infrastructure |
| **Phase 0** | COMPLETE (gate passed 2026-05-15) |
| **Phase 1 Backend Routes** | IMPLEMENTED — heartbeat, account-sync, symbol-sync, license-check |
| **Phase 1 EA Transport** | HARDENED — user_id in all payloads, observability logs |
| **Phase 1 Live Validation** | PENDING — Track A must run live MT5 terminal tests |
| **Blocker** | MIGRATION-PHASE1-001: 48h heartbeat soak not yet executed |

### Immediate Next Steps
1. **Track A**: Deploy patched EA binary to the Deriv-Demo MT5 terminal (build 5836).
2. **Track A**: Execute Phase 1 validation scenarios per PHASE1_CHECKLIST.md:
   - 48h+ heartbeat soak
   - Terminal restart reconnect
   - VPS restart reconnect
   - Internet interruption reconnect
   - Duplicate heartbeat protection
   - Invalid license rejection
3. **Track B**: Monitor backend logs for heartbeat receipt, account-sync writes, symbol-sync rows.
4. **Phase 1 gate review**: If all 6 gate criteria pass, declare Phase 1 PASSED.

### Next Migration Steps (if Phase 1 passes)
- Advance to Phase 2: Read-Only Trade Telemetry
- Begin open position sync via `/ea/account-sync`
- Begin dashboard EA account card, live positions panel, floating P/L

---

## Regression Checklist

- [x] `npm run lint` — 0 errors, 9 pre-existing warnings
- [x] `npm run build` — PASS
- [x] `npm run check:mql` — PASS
- [x] `php -l smc-superfib-sniper.php` — PASS
- [x] `php -l class-market-data-service.php` — PASS
- [x] EA market-stream route auth — VERIFIED (all 6 error cases correct)
- [x] EA market-stream stale data rejection — VERIFIED (300s hard, 120-300s warn)
- [x] EA bridge routes user_id — VERIFIED (all 4 routes include user_id)
- [x] authority-diagnostics requires WP session — VERIFIED (401 for unauthenticated)
- [x] Admin routes require manage_options — VERIFIED
- [x] Dashboard backend authority — VERIFIED (is_live from backend, staleTime:0)
- [x] Signal engine — VERIFIED (backend-only truth, stale gate active)
- [x] Backend syntax — PASS
- [x] LINT-001 patched — PASS
- [ ] PHP regression tests — No phpunit CLI available; individual test files pass via `php test-*.php` in the 2026-05-17 sweeps

---

## Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Phase 1 live validation not started | MEDIUM | Track A must execute — no code blocker, environment is ready |
| 9 pre-existing ESLint react-hooks/react-refresh warnings | LOW | Out of scope; no runtime impact |
| MetaEditor CLI compile unverified in this environment | LOW | Must be verified in MT5 terminal on EA rebuild |
| `src/routes/plan.tsx` bundle-size warning (PlanPage export) | LOW | Informational TanStack Router warning; no runtime impact |

---

## Safe Deployment Order

1. This branch (`claude/nice-fermat-WWAz4`) is already ahead of main with the LINT-001 fix.
2. Merge to main when PR review completes.
3. Deploy WordPress plugin to trader.stokvelsociety.co.za (already deployed per Phase 0 closeout).
4. Rebuild MT5 EA binary in MetaEditor and attach to Deriv-Demo terminal.
5. Execute Phase 1 validation scenarios per PHASE1_CHECKLIST.md.

---

## Rollback Procedure

```bash
# Full rollback to pre-patch state:
git reset --hard 251e24462064a60a0b97efe4900c455860534598

# Or to a named rollback tag:
git checkout rollback/stabilize-ea-2026-05-18-before-patches

# Emergency rollback to main:
git checkout main && git reset --hard origin/main
```
