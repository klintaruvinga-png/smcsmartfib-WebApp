# SMC SuperFIB Bug Sweep Report — 2026-05-17

## Executive Summary

| Item | Value |
|---|---|
| **Report Date** | 2026-05-17 |
| **Phase** | Phase 1 — MT5 Bridge Infrastructure (IN-PROGRESS) |
| **Scanner** | Claude Code Stabilization Agent (stabilize-ea-2026-05-17) |
| **Workflow ID** | stabilize-ea-2026-05-17 |
| **Overall Health** | STABLE — no critical or high-severity bugs |
| **Bugs Found** | 1 (LOW — scripts/ prettier formatting) |
| **Fixes Applied** | 1 surgical patch (formatting only, zero logic change) |
| **Remaining Risks** | Phase 1 live terminal validation pending (Track A) |
| **Migration Readiness** | Phase 0 COMPLETE; Phase 1 backend DONE, awaiting live test |
| **Snapshot Archive** | reports/snapshots/stabilize-ea-2026-05-17/ |
| **Rollback Command** | `git reset --hard 1fe6531c00d3d4ee7a5825f103aa67f7601cb2a3` |

**Summary:** Full audit of the SMC SuperFIB plugin, frontend dashboard, signal engine, EA market
stream route, Phase 1 bridge routes, MQL5 EA files, and migration status. The system is stable.
EA authentication, payload validation, stale-data rejection, signal authority, and dashboard truth
are all confirmed correct. One LOW-severity issue (prettier formatting in scripts/) was patched.
No architectural changes, no logic changes, no auth weakening.

---

## Confirmed Problems

| ID | Severity | Category | Issue | Root Cause | Impact | Files Affected |
|---|---|---|---|---|---|---|
| LINT-001 | LOW | CI / Scripts | Prettier formatting violations in pipeline scripts | Recent commits to scripts/ did not run eslint --fix before push | npm run lint reported 19 errors; zero runtime or correctness impact | scripts/validate-implementation.mjs, scripts/pipeline-watcher.js |

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
| Dashboard live truth | age_sec + is_live from backend /snapshot; staleTime:0 on health | CORRECT |
| Signal engine authority | Resides entirely in WordPress plugin | CORRECT |
| Phase 1 routes | heartbeat, account-sync, symbol-sync, license-check all registered with permission_ea_bridge | IMPLEMENTED |

---

## Surgical Fixes Applied

### PATCH-1 — Prettier Formatting Fix in Scripts

| Item | Detail |
|---|---|
| **Issue** | LINT-001 |
| **Severity** | LOW |
| **Files Changed** | scripts/validate-implementation.mjs, scripts/pipeline-watcher.js |
| **Logic Changed** | NO |
| **Regression Tests Updated** | NO (formatting only) |
| **Rollback Before** | rollback/stabilize-ea-2026-05-17-before-patches → 1fe6531 |
| **Rollback After** | rollback/stabilize-ea-2026-05-17-after-patch-1 → 0c013e0 |

**Method:** `eslint --fix` applied to the two affected files. Auto-corrected whitespace, trailing
commas, and line-break formatting. No logic, imports, exports, or function signatures changed.

**Verification:** `npm run lint` now reports 0 errors, 9 pre-existing warnings (react-hooks,
react-refresh — in UI components, out of scope).

---

## EA Integration Status

| Property | Value |
|---|---|
| **Route** | `POST /wp-json/sniper/v1/ea/market-stream` |
| **Permission Callback** | `permission_ea_market_stream` → `permission_ea_bridge` |
| **Auth Model** | Shared-secret header (`X-EA-API-Key` or `X-API-KEY`) |
| **Secret Env** | `SMC_SF_EA_API_KEY` (PHP constant or getenv fallback) |
| **Comparison Method** | `hash_equals()` — timing-safe |
| **user_id Required** | YES — validated in auth callback, not just handler |
| **Payload Validation** | COMPREHENSIVE (see below) |
| **Stale Rejection** | 300s hard (422), 120-300s warn |
| **OHLC Validation** | YES |
| **Epoch Guard** | YES (pre-2000 timestamps rejected) |
| **M1 Candle Max Age** | 180 seconds |
| **M15 Candle Max Age** | 1800 seconds |
| **Tick Volume Guard** | YES (non-numeric and negative clamped to 0) |
| **Symbol Normalization** | YES (`map_symbol_aliases()`) |

### Expected Error Responses

| Condition | Status | Code |
|---|---|---|
| Missing `X-EA-API-Key` | 401 | `smc_sf_api_key_missing` |
| `SMC_SF_EA_API_KEY` not configured | 503 | `smc_sf_api_key_unconfigured` |
| Invalid API key | 403 | `smc_sf_api_key_invalid` |
| Missing `user_id` in payload | 400 | `smc_sf_user_required` |
| Invalid `user_id` (no readable WP user) | 403 | `smc_sf_user_invalid` |
| Missing `symbol` | 400 | `invalid_payload` |
| Missing `bid` or `ask` | 400 | `missing_prices` |
| Unparseable timestamp | 422 | `stale_data` |
| Timestamp older than 300s | 422 | `stale_data` |

### Payload Contract (Canonical)

```json
{
  "user_id": 1,
  "symbol": "EURUSD",
  "normalized_symbol": "EURUSD",
  "timeframe": "M1",
  "timestamp": "2026-05-17T12:32:09Z",
  "bid": 1.08521,
  "ask": 1.08534,
  "freshness": "LIVE",
  "session": "London",
  "candle": {
    "time": "2026-05-17T12:31:00Z",
    "open": 1.0851,
    "high": 1.0855,
    "low": 1.0849,
    "close": 1.0853,
    "volume": 123
  },
  "candle_m15": {
    "time": "2026-05-17T12:15:00Z",
    "open": 1.0849,
    "high": 1.0858,
    "low": 1.0845,
    "close": 1.0852,
    "volume": 1850
  }
}
```

Note: EA sends `timestamp` not `quote_time`; PHP handler accepts both (`!empty()` chain).
Note: `candles[]` (REST contract format) also accepted via shim — promotes `candles[0]` → `candle`.

---

## Phase 1 Bridge Routes

| Route | Method | Auth | Status |
|---|---|---|---|
| `/sniper/v1/ea/heartbeat` | POST | `permission_ea_bridge` | IMPLEMENTED — live validation pending |
| `/sniper/v1/ea/account-sync` | POST | `permission_ea_bridge` | IMPLEMENTED — live validation pending |
| `/sniper/v1/ea/symbol-sync` | POST | `permission_ea_bridge` | IMPLEMENTED — live validation pending |
| `/sniper/v1/ea/license-check` | GET | `permission_ea_bridge` | IMPLEMENTED — live validation pending |

All Phase 1 routes use the same `permission_ea_bridge` callback as the market-stream route.

---

## Parity Verification Results

| Surface | Status | Notes |
|---|---|---|
| MQL5 EA payload → PHP handler field names | PASS | user_id, symbol, normalized_symbol, timeframe, timestamp, bid, ask, freshness, session, candle{...}, candle_m15{...} — all fields correctly mapped |
| EA timestamp UTC handling | PASS | TimeToIso8601() strips broker offset in MQL5; PHP uses gmdate() |
| Stale threshold parity | PASS | FreshnessEngine STALE at 300s; PHP hard-reject at 300s |
| M1 candle age | PASS | EA guards candleTime_m1 < now; PHP guards age_sec <= 180 |
| M15 candle age | PASS | EA guards candleTime_m15 < now; PHP guards age_sec <= 1800 |
| Epoch guard | PASS | EA checks rates[0].time > 0; PHP checks candle_ts > 946684800 |
| OHLC ordering | PASS | EA uses broker-validated OHLC; PHP validate_ohlc() is defense-in-depth |
| Symbol normalization | PASS | SymbolNormalizer.mqh (EA) + map_symbol_aliases() (PHP) |
| Equity index off-session | PASS | EA sends CLOSED + TimeCurrent() when NAS100/US30 off-session |
| Frontend → backend truth | PASS | Dashboard reads is_live, age_sec, freshness from /snapshot |
| Pine vs backend | PASS (no change) | No Pine formulas modified |
| Fib calculations | PASS (no change) | No fib code modified |
| Regime/chop | PASS (no change) | No regime code modified |

---

## Migration Status Update

| Phase | Status | Progress |
|---|---|---|
| Phase 0 — Stabilize platform | **COMPLETE** | 100% — gate passed 2026-05-15 |
| Phase 1 — MT5 bridge infrastructure | **IN-PROGRESS** | ~20% — backend routes implemented, live validation pending |
| Phase 2+ | NOT-STARTED | Gated on Phase 1 completion |

### Blockers Addressed in This Workflow
- LINT-001: Prettier formatting errors in scripts/ (resolved)

### Remaining Blockers
- **MIGRATION-PHASE1-001**: Live MT5 terminal verification for `/ea/heartbeat`, `/ea/account-sync`,
  `/ea/symbol-sync`, `/ea/license-check`. Code complete, regression tests written. Requires Track A
  live terminal execution and 48h heartbeat soak.

---

## Regression Checklist

| Check | Result |
|---|---|
| `php -l smc-superfib-sniper.php` | PASS |
| `php -l class-market-data-service.php` | PASS |
| `npm run build` | PASS |
| `npm run check:mql` | PASS |
| `npm run lint` | PASS (0 errors after LINT-001 fix) |
| EA endpoint rejects missing X-EA-API-Key | VERIFIED (returns 401 `smc_sf_api_key_missing`) |
| EA endpoint rejects invalid X-EA-API-Key | VERIFIED (returns 403 `smc_sf_api_key_invalid`) |
| EA endpoint rejects missing user_id | VERIFIED (returns 400 `smc_sf_user_required`) |
| EA endpoint rejects malformed payload | VERIFIED (returns 400 `invalid_payload`) |
| EA endpoint rejects stale timestamp | VERIFIED (returns 422 `stale_data`) |
| authority-diagnostics returns 401 unauthenticated | VERIFIED (expected behavior) |
| Admin routes require manage_options | VERIFIED |
| Dashboard does not mark stale data as live | VERIFIED (uses backend is_live flag) |
| Signal engine does not run on stale data | VERIFIED (freshness gate in engine) |
| Migration blockers checked | VERIFIED — Phase 1 live validation still pending |

---

## Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Phase 1 live terminal validation not yet run | MEDIUM | Track A must execute 48h heartbeat soak with live MT5 terminal |
| 9 pre-existing ESLint warnings in UI components | LOW | react-hooks/exhaustive-deps and react-refresh warnings; no runtime impact |
| Full TypeScript strict check may reveal additional drift | LOW | `npx tsc --noEmit` not run; build passes but type-only errors may exist |
| Weekend MT5 behavior not validated | LOW | Deferred from Phase 0; no blocking evidence found |

---

## Safe Deployment Order

1. Push branch → create PR → run CI.
2. Merge to main after CI passes.
3. Deploy WordPress plugin to trader.stokvelsociety.co.za.
4. Verify `SMC_SF_EA_API_KEY` is set in wp-config.php.
5. Configure MT5 EA inputs (WebhookURL, ApiKey, UserId).
6. Enable WebRequest for trader.stokvelsociety.co.za in MT5 → Tools → Options → Expert Advisors.
7. Attach EA to one chart and monitor Journal for SUCCESS messages.
8. Confirm backend receives data via GET /wp-json/sniper/v1/admin/health (requires admin session).

---

## Rollback Procedure

```bash
# Rollback to initial state (before any patches this session):
git reset --hard 1fe6531c00d3d4ee7a5825f103aa67f7601cb2a3

# OR rollback to tagged state:
git checkout snapshot/stabilize-ea-2026-05-17-start-20260517T000000Z

# Emergency full rollback to main:
git checkout main && git reset --hard origin/main
```

---

## EA Test Commands

### Missing token (expect 401)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Invalid token (expect 403)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Missing user_id (expect 400)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
```

### Valid full payload (expect 200)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "normalized_symbol": "EURUSD",
    "timeframe": "M1",
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "bid": 1.08521,
    "ask": 1.08534,
    "freshness": "LIVE",
    "session": "London",
    "candle": {
      "time": "'"$(date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1M +%Y-%m-%dT%H:%M:%SZ)"'",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "volume": 123
    }
  }'
```
