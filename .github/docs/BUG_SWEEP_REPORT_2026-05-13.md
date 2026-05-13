# SMC SuperFIB Bug Sweep Report — 2026-05-13

## Executive Summary

| Item | Status |
|---|---|
| Overall Health | STABLE |
| Bugs Found | 4 (0 critical, 0 high, 2 medium, 1 low, 1 info) |
| Fixes Applied | 3 patches (PATCH-1: volume guard, PATCH-2: regression test, PATCH-3: prettier) |
| Remaining Risks | None critical. 8 pre-existing react-hooks ESLint warnings (intentional). |
| Migration Readiness | Phase 0 soak continues — EA ingest pipeline verified end-to-end |
| Snapshot Archive | `reports/snapshots/stabilize-ea-2026-05-13/` |
| Rollback Command | `git reset --hard rollback/stabilize-ea-2026-05-13-before-patches` |

---

## Confirmed Problems

### BUG-001 — MEDIUM — tick_volume Not Validated for Non-Negative Constraint

**Severity:** MEDIUM  
**System:** EA Market Stream — Payload Validation  
**Root Cause:** `insert_mt5_candle()` stored `(string) $candle['volume']` without a non-negative guard. A malformed EA payload with `"volume": -999` would persist negative volume in the DB.  
**Impact:** Data integrity — `wp_smc_sf_candles.volume` column could receive negative values. Volume is display-only and does not affect signal computation.  
**Files Affected:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — `insert_mt5_candle()`

### BUG-002 — MEDIUM (PRE-EXISTING) — 77 Prettier Formatting Violations

**Severity:** MEDIUM (pre-existing, non-functional)  
**System:** Developer Tooling  
**Root Cause:** `npx prettier` rules were tightened but `src/` and `scripts/pipeline-watcher.js` were never auto-formatted afterward.  
**Impact:** `npm run lint` previously reported 77 errors; this blocked a clean CI gate.  
**Files Affected:** `src/routes/plan.tsx`, `src/routes/index.tsx`, `src/styles.css`, `src/lib/api/sniperClient.ts`, `src/hooks/useStreamingTicks.ts`, `scripts/pipeline-watcher.js`

### BUG-003 — INFO — Spec/Doc Payload Contract Divergence

**Severity:** INFO  
**System:** Documentation  
**Root Cause:** The workflow specification documents EA payload fields as `quote_time`/`server_time`/`candles[]`, but the live implementation uses `timestamp`/`candle{}`/`candle_m15{}`. Both MQL5 EA sender and PHP receiver are consistent with each other — only the spec example diverges.  
**Impact:** Documentation only. Already documented in `phase-0-mt5-ea-market-stream-parity-2026-05-12.md`.

### BUG-004 — LOW — Spread Fractional Pip Truncation

**Severity:** LOW (by-design schema decision)  
**System:** EA Market Stream — Spread Storage  
**Root Cause:** `spread` column is `INT` and the computed pip spread (e.g., 1.3 pips) is stored as `%d`, truncating fractional values to 1.  
**Impact:** Display only — spread not used in signal computation. Accepted as known limitation.

---

## Surgical Fixes Applied

### PATCH-1: guard_tick_volume() — BUG-001 Fix

**File:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`  
**Change:** Added private method `guard_tick_volume($user_id, $symbol, $raw_volume): int`. When a negative volume is detected, an audit event `ea.market_stream.invalid_tick_volume` is written and the value is clamped to 0. `insert_mt5_candle()` now calls `guard_tick_volume()` instead of raw `(int)` cast.  
**Logic Hardened:** Volume stored as `max(0, int)` with full audit trail.  
**Regression Protection:** Test 8 added (see PATCH-2).  
**Rollback Before:** `rollback/stabilize-ea-2026-05-13-before-patches`  
**Rollback After:** `rollback/stabilize-ea-2026-05-13-after-patch-1`

### PATCH-2: Regression Test for Negative tick_volume

**File:** `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`  
**Change:** Added Test 8 — sends a candle with `"volume": -999`, asserts candle is stored with `volume=0` and `snapshots_inserted=1` (snapshot still stored, candle stored with clamped volume).

### PATCH-3: Prettier Auto-Fix — BUG-002 Resolution

**Files:** `src/routes/plan.tsx`, `src/routes/index.tsx`, `src/styles.css`, `src/lib/api/sniperClient.ts`, `src/hooks/useStreamingTicks.ts`, `scripts/pipeline-watcher.js`  
**Change:** Ran `npx prettier --write src/ scripts/` — zero logic changes, formatting only.  
**Result:** `npm run lint` now reports 0 errors (8 pre-existing react-hooks warnings remain, intentional).

---

## EA Integration Status

| Item | Value |
|---|---|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth Model | Shared-secret API key |
| Auth Header | `X-EA-API-Key` (also `X-API-KEY`, `x_ea_api_key`, `x_api_key`) |
| Secret Env | `SMC_SF_EA_API_KEY` (constant or `getenv()`) |
| user_id Required | YES — checked in `permission_ea_market_stream()` before handler runs |
| Payload Validation | symbol required, timestamp 300s hard reject, bid/ask isfinite+positive+bid≤ask, OHLC high≥max(open,close)+low≤min(open,close), candle epoch guard, tick_volume non-negative clamp |
| Stale Data Rejection | YES — >300s hard reject (400), 120–300s warning, candle staleness 180s M1 / 1800s M15 |
| Actual EA Payload Contract | `timestamp` (not `quote_time`), `candle{}` (not `candles[]`), `candle_m15{}` |

### curl Testing Commands

**Missing token (expect 401):**
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

**Invalid token (expect 403):**
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

**Missing user_id (expect 400):**
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
```

**Valid full payload (expect 200 with ok:true):**
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "normalized_symbol": "EURUSD",
    "timeframe": "M1",
    "timestamp": "2026-05-13T12:32:09Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "freshness": "LIVE",
    "session": "London",
    "candle": {
      "time": "2026-05-13T12:31:00Z",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "volume": 123
    }
  }'
```

---

## Parity Verification

| Parity | Status |
|---|---|
| MQL5 EA payload fields vs PHP handler fields | CONFIRMED — all fields match (see 2026-05-12 parity audit) |
| Timestamp UTC handling MQL5 vs PHP | CONFIRMED — EA sends ISO8601 Z-suffix; PHP uses strtotime() |
| OHLC validation MQL5 vs PHP | CONFIRMED — broker guarantees + PHP validate_ohlc() guard |
| Fib levels — backend authoritative | CONFIRMED — MQL5 EA does not compute fibs; backend is single source |
| Signal readiness gating | CONFIRMED — source=mt5, state=live, age<staleThresholdSec required |
| Chop blocking | CONFIRMED — chop≥0.7 blocks gate (F3 caution zone) |
| Known spec divergence | DOCUMENTED — spec uses quote_time/candles[], live uses timestamp/candle |

---

## Regression Checklist

- [x] PHP syntax passes on all modified plugin files
- [x] `npm run build` succeeds
- [x] `npm run lint` — 0 errors (8 pre-existing react-hooks warnings)
- [x] `npm run check:mql` passes
- [x] EA endpoint rejects missing `X-EA-API-Key` → 401
- [x] EA endpoint rejects invalid `X-EA-API-Key` → 403
- [x] EA endpoint rejects missing `user_id` → 400
- [x] EA endpoint rejects malformed payload (missing symbol) → 400
- [x] EA endpoint rejects stale `timestamp` (>300s) → 400
- [x] EA endpoint rejects invalid OHLC → audit, snapshot still stored
- [x] EA endpoint rejects INF bid/ask → snapshot not stored
- [x] EA endpoint clamps negative tick_volume → stored as 0, candle stored
- [x] EA endpoint accepts valid fresh payload → ok:true
- [x] Dashboard does not mark stale data as live — backend state field used
- [x] Signal engine does not run on stale data — age guard confirmed
- [x] `authority-diagnostics` returns 401 for unauthenticated — confirmed
- [x] Admin routes require `manage_options` — confirmed
- [x] All 9 PHP regression test files pass

---

## Remaining Risks

1. **Spread truncation (LOW):** Fractional pips stored as integer. Display-only, by design.
2. **React hooks warnings (LOW):** 8 `react-hooks/exhaustive-deps` warnings. Fixing them requires carefully auditing infinite-loop risks per effect. Not actionable without SMC domain knowledge of each effect's intent.
3. **ESLint coverage of scripts/ directory:** `pipeline-watcher.js` is a Node.js script not covered by TypeScript checks. Prettier-formatted but no type safety.
4. **No `phpunit` test runner:** PHP tests are standalone scripts, not integrated into a formal test suite. `composer.json` and `phpunit.xml` are not present. All tests run correctly as `php test-*.php`.

---

## Safe Deployment Order

1. Deploy WordPress plugin (`wordpress/smc-superfib-sniper/`) to trader.stokvelsociety.co.za
2. Deploy frontend (`npm run build` → Cloudflare Pages/Workers)
3. Verify EA market stream endpoint with curl tests above
4. Monitor soak report at `/admin/soak-report` for candle/snapshot counts

## Rollback Procedure

```bash
# Return to state before patches
git reset --hard rollback/stabilize-ea-2026-05-13-before-patches

# Emergency: return to main
git checkout main && git reset --hard origin/main
```
