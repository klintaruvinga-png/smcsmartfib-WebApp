# Bug Sweep Report — 2026-05-15

**Workflow ID**: stabilize-ea-2026-05-15  
**Branch**: claude/nice-fermat-WxJFl  
**Agent Run**: 2026-05-15 04:00–04:45 UTC  
**Stack Version**: v13.0.3  
**Pine Version**: v13.1.3 (unchanged)  
**Migration Phase**: Phase 0 — MT5-native migration / 72h soak validation

---

## Summary

- **Total Issues Found**: 3 (1 medium, 2 low) + 5 informational PASS findings
- **Critical Issues**: 0
- **High Priority Issues**: 0
- **Medium Issues**: 1 (BUG-001 — payload contract mismatch)
- **Low Issues**: 2 (BUG-002, BUG-003)
- **Fixes Applied**: 3 (all medium/low issues patched)
- **Migration Blockers in Scope**: 3 (MIGRATION-001/002 code fixes confirmed present from prior PRs; live validation soaks required)
- **Snapshot Archive**: `reports/snapshots/stabilize-ea-2026-05-15/`
- **Rollback Command**: `git reset --hard a237db766c30b8fe6102cc22267d2921717e3f2e`
- **Migration Readiness**: Phase 0 BLOCKED — code patches merged; live validation soaks pending

---

## Executive Summary

The SMC SuperFIB system is structurally sound. REST API authentication is fully hardened (hash_equals, all four header aliases, 401/403/503 error codes, wp_set_current_user binding). Stale data guards are in place (300s hard-reject with HTTP 422, 120s drift warning). Signal authority remains in the backend (WordPress plugin). Dashboard does not compute signals or fake live state.

The primary finding this run was a **payload contract divergence** (BUG-001): the published canonical REST contract uses `quote_time` for the tick timestamp and `candles[]` array for OHLC data, but the handler only accepted the legacy EA field names (`timestamp`, `candle`/`candle_m15`). A surgical patch was applied to add backward-compatible aliases. All 14 EA market stream regression tests pass.

The two Phase 0 migration blockers (NAS100/US30 freshness, XAUUSD candle history) have confirmed code fixes merged in PRs #170/#171. Live validation soaks are required before Phase 0 can be declared PASS.

---

## Confirmed Problems

### BUG-001 — Payload Contract Mismatch [MEDIUM] — FIXED

| Field | Detail |
|-------|--------|
| **Severity** | MEDIUM |
| **System** | EA Market Stream ingestion |
| **Root Cause** | The published REST API contract specifies `quote_time` for the tick timestamp and `candles: [...]` array for OHLC. The handler read only `timestamp` (legacy MQL5 EA field) and `candle`/`candle_m15` single objects. External callers using the documented contract received silent failures: staleness guard was skipped when `timestamp` was absent, candles were silently dropped. |
| **Impact** | Any non-MQL5 caller (e.g. REST testing tools, future EA updates using the canonical contract) would bypass staleness validation and lose candle data |
| **Files Affected** | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (post_ea_market_stream) |

### BUG-002 — Audit Log Null Timestamp [LOW] — FIXED

| Field | Detail |
|-------|--------|
| **Severity** | LOW |
| **System** | EA Market Stream audit trail |
| **Root Cause** | Audit log entry for `ea.market_stream.ingested` recorded `'timestamp' => $payload['timestamp'] ?? null` instead of the resolved timestamp variable. When payload uses `quote_time`, the audit entry showed `timestamp: null`. |
| **Impact** | Audit trail debugging is harder; post-mortem analysis of ingestion timing is incomplete |
| **Files Affected** | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (audit call at end of post_ea_market_stream) |

### BUG-003 — Docblock Does Not Document Canonical Contract [LOW] — FIXED

| Field | Detail |
|-------|--------|
| **Severity** | LOW |
| **System** | Code documentation |
| **Root Cause** | The PHP docblock for `post_ea_market_stream` documented only the legacy payload format (`timestamp`, `candle` single object). The canonical REST contract fields (`quote_time`, `source`, `server_time`, `candles[]`, `spread`) were not documented. |
| **Impact** | External developers cannot determine the correct payload format from the code |
| **Files Affected** | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (docblock lines 1779–1808) |

---

## Surgical Fixes Applied

### PATCH-1 — quote_time alias + candles[] array shim

**File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Logic hardened**:
- Added `$timestamp_raw = $payload['quote_time'] ?? $payload['timestamp'] ?? null` at the top of `post_ea_market_stream()`. `quote_time` takes precedence; falls back to `timestamp`; falls back to null.
- Staleness check (`>300s → 422`, `>120s → warning`) now gates on `$timestamp_raw` instead of `$payload['timestamp']`. Callers using `quote_time` now correctly have their data staleness checked.
- M1 candle stream timestamp now uses `$timestamp_raw` (not `$payload['timestamp']`).
- M15 candle stream timestamp now uses `$timestamp_raw` (not `$payload['timestamp']`).
- `candles[]` array shim: if `$payload['candle']` is absent but `$payload['candles']` is a non-empty array, `candles[0]` is promoted as the M1 candle object. `tick_volume` is mapped to `volume` in the shim for canonical contract compatibility.
- Audit log entry now records `$timestamp_raw` (correctly non-null when `quote_time` is used).

**Rollback point before**: `rollback/stabilize-ea-2026-05-15-before-patches` (commit `a237db7`)  
**Rollback point after**: `rollback/stabilize-ea-2026-05-15-after-patch-1` (commit `696d9a7`)

### PATCH-2 — Docblock update

**File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

Updated `post_ea_market_stream` docblock to document:
- **Canonical REST contract**: `user_id`, `symbol`, `timeframe`, `source`, `server_time`, `quote_time`, `bid`, `ask`, `spread`, `candles[]` (with `tick_volume`)
- **Legacy EA format**: `timestamp`, `freshness`, `session`, `candle`/`candle_m15` single objects
- Statement that both formats are accepted; `quote_time` takes precedence over `timestamp` when both present

### PATCH-3 — Regression tests for new aliases

**File**: `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`

Added 3 new regression tests (Tests 12–14):
- **Test 12**: `quote_time` alias accepted — canonical payload with `quote_time` (no `timestamp`) produces `snapshots_inserted: 1`
- **Test 13**: `candles[]` array shim — canonical payload with `candles: [{..., tick_volume: N}]` (no `candle` key) produces `candles_inserted: 1`; `tick_volume` mapped to `volume`
- **Test 14**: Stale `quote_time` rejected with HTTP 422 — confirms staleness guard is active on the alias field

---

## EA Integration Status

| Attribute | Status |
|-----------|--------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth model | Shared-secret via `X-EA-API-Key` header |
| Auth implementation | `hash_equals()` — timing-safe |
| Header aliases accepted | `X-EA-API-Key`, `x_ea_api_key`, `X-API-KEY`, `x_api_key` |
| Secret config | `SMC_SF_EA_API_KEY` PHP constant or `getenv()` |
| Missing token → | 401 `smc_sf_api_key_missing` |
| Unconfigured secret → | 503 `smc_sf_api_key_unconfigured` + error_log |
| Invalid token → | 403 `smc_sf_api_key_invalid` |
| Missing `user_id` → | 400 `smc_sf_user_required` |
| Invalid `user_id` → | 403 `smc_sf_user_invalid` |
| `user_id` bind | `wp_set_current_user($ea_user_id)` before returning `true` |
| **Timestamp field** | `quote_time` **or** `timestamp` (both accepted; `quote_time` takes precedence) |
| **Candle field** | `candle` (object) **or** `candles[0]` (shim from array) |
| Stale data (>300s) | Rejected with HTTP 422 |
| Stale data (120–300s) | Accepted with `error_log` warning |
| OHLC guard | Candle rejected if `high < max(open,close)` or `low > min(open,close)` |
| Epoch guard | Candle rejected if `time < 2000-01-01` |
| Volume guard | Negative volume clamped to 0 |
| `is_finite()` guard | bid/ask rejected if infinite |

**Required curl test (missing token)**:
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
# Expected: HTTP 401 {"code":"smc_sf_api_key_missing","message":"X-EA-API-Key or X-API-KEY header required.","data":{"status":401}}
```

**Required curl test (valid canonical payload with quote_time)**:
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-15T04:30:00Z",
    "quote_time": "2026-05-15T04:29:55Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-15T04:29:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
# Expected: HTTP 200 {"ok":true,"symbol":"EURUSD","snapshots_inserted":1,"candles_inserted":1,"server_time":"..."}
```

---

## Parity Verification

| Surface | Status | Last Audit |
|---------|--------|------------|
| Pine/backend (fib parity) | PASS | 2026-05-14 (`phase-0-pine-backend-parity-2026-05-14.md`) |
| Backend/dashboard display | PASS | 2026-05-14 (`phase-0-dashboard-parity-2026-05-14.md`) |
| MT5 EA ingress route/payload | PASS | 2026-05-14 (`phase-0-mt5-ea-market-stream-parity-2026-05-14.md`) + 2026-05-15 (quote_time alias patch) |
| MT5 candle/tick parity | PASS | MT5 payload field names match PHP handler after patch |
| Admin health/soak | PASS | 2026-05-12 (`phase-0-dashboard-admin-health-parity-2026-05-12.md`) |
| NAS100/US30 live freshness | PARTIAL | Code fix merged; live validation soak not yet started |
| XAUUSD candle history | PARTIAL | GOLD alias fix merged; EA restart + 7.5h accumulation pending |
| AUDUSD/ETHUSD chop gate | PASS (behavior correct) | Chop gate blocks are genuine market behavior |

**Known drift**: None currently. quote_time field was the only parity divergence; patched 2026-05-15.

---

## Migration Status Update

### Current Phase: Phase 0 — BLOCKED

| Blocker | Code Fix Status | Live Validation Status |
|---------|----------------|------------------------|
| NAS100/US30 `PRICE_NOT_MT5_FRESH` | Merged (PR #170/#171 — equity session detection in MarketDataEngine.mqh + is_equity_index_off_session() in PHP) | NOT STARTED |
| XAUUSD `INSUFFICIENT_CANDLE_HISTORY` | Merged (PR #170 — GOLD alias in SymbolNormalizer.mqh + PHP map_symbol_aliases()) | NOT STARTED (requires EA restart + 7.5h accumulation) |

### Next Steps

**Immediate (operator actions required)**:
1. **EA restart**: Restart the SMC_MarketDataEA.mq5 on the MT5 terminal to pick up the GOLD→XAUUSD alias fix
2. **Validation soak — NAS100/US30**: Run 4-hour soak covering at least one active US equity session (13:30–20:00 UTC Mon–Fri). Verify `feedStatus=live` in dashboard during session. Verify NAS100/US30 are not counted as stale outside session.
3. **Validation soak — XAUUSD**: After EA restart, wait 7.5h for 30 M15 candles to accumulate. Verify `mt5_candles_live=true` in `/admin/health`. Verify signal spot-check produces valid XAUUSD output.

**If both soaks pass**:
4. Commit Phase 0 closeout evidence to `.github/migration/phase-updates/`
5. Update `.github/migration/PHASE0_SOAK_TRACKER.md` with soak completion status
6. Run `/mt5-migration Phase 0 readiness check` to confirm gate clearance
7. Begin Phase 1 planning: MT5 bridge infrastructure setup

**Phase 1 Prerequisites (not yet started)**:
- Phase 0 closeout gate PASS
- NAS100/US30 freshness confirmed stable across 2+ sessions
- XAUUSD candle history readiness confirmed

---

## Regression Checklist

- [x] `authority-diagnostics` returns 401 for unauthenticated requests
- [x] Admin routes (`/admin/health`, `/admin/soak-report`) require `manage_options`
- [x] EA route rejects missing `X-EA-API-Key` → HTTP 401
- [x] EA route rejects invalid `X-EA-API-Key` → HTTP 403
- [x] EA route rejects missing `user_id` → HTTP 400
- [x] EA route rejects stale timestamp (>300s) → HTTP 422
- [x] EA route rejects stale `quote_time` (>300s) → HTTP 422 (new — tested in Test 14)
- [x] EA route accepts `quote_time` alias for `timestamp` (new — tested in Test 12)
- [x] EA route accepts `candles[]` array format (new — tested in Test 13)
- [x] EA route accepts legacy `candle`/`candle_m15` objects (existing — tested in Tests 1, 9, 10, 11)
- [x] OHLC guard rejects invalid candles; snapshot still stored
- [x] Epoch timestamp guard rejects pre-2000 candles
- [x] `is_finite()` guard rejects INF bid/ask
- [x] Negative tick_volume clamped to 0
- [x] Snapshot source is always 'mt5'
- [x] `wp_set_current_user` is called in permission callback
- [x] Backend remains source of truth for signals
- [x] Dashboard does not fake live state
- [x] PHP syntax clean: `php -l` passes on all modified files

---

## Remaining Risks

| Risk | Level | Notes |
|------|-------|-------|
| NAS100/US30 live validation soak not yet run | HIGH | Fix confirmed in code; EA behavior during off-hours not yet confirmed live |
| XAUUSD candle history soak not yet run | HIGH | EA restart and 7.5h accumulation required; no live evidence yet |
| npm lint / build not verifiable in CI environment | LOW | Missing @eslint/js and vite packages in container; pre-existing, not introduced by patch |
| AUDUSD/ETHUSD chop gate blocks | LOW | Classified as correct engine behavior; no code change authorized without evidence of parity drift |
| Phase 1 not yet started | MEDIUM | MT5 bridge infrastructure planning required after Phase 0 closeout |

---

## Safe Deployment Order

1. **Merge this branch** (`claude/nice-fermat-WxJFl`) to `main` (or staging)
2. **Deploy WordPress plugin** to `trader.stokvelsociety.co.za`
3. **Restart MT5 EA** on terminal (picks up GOLD alias fix from PR #170)
4. **Monitor XAUUSD** in dashboard — wait 7.5h for candle history readiness
5. **Schedule NAS100/US30 validation soak** for next US equity session (13:30 UTC Mon–Fri)
6. After both soaks confirm PASS, proceed with Phase 0 closeout

---

## Rollback Procedure

| Scenario | Command |
|----------|---------|
| Revert all patches on this branch | `git reset --hard a237db766c30b8fe6102cc22267d2921717e3f2e` |
| Revert to just after Patch 1 | `git reset --hard 696d9a7b0fb2968f50ff42bfcdca50fe96633b67` |
| Emergency: revert to main | `git checkout main && git reset --hard origin/main` |

WordPress plugin rollback: replace plugin files with previous version and run `php -l` to verify.
