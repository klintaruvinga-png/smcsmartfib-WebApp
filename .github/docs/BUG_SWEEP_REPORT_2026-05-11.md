# Bug Sweep Report — 2026-05-11

**Workflow ID:** stabilize-ea-2026-05-11  
**Branch:** claude/serene-hopper-KWRcX  
**Initial commit:** 98ceaecf455506c4ae17d1a3914267d4ae306370  
**Final commit:** 116e36b08e7df9351a468259e0afae9e87ac970d  
**Operator:** Claude Code (claude-sonnet-4-6)

---

## Executive Summary

| Item | Status |
|---|---|
| Overall system health | STABLE |
| Bugs found | 3 (1 medium, 1 low, 1 info) |
| Bugs fixed | 1 (BUG-001 OHLC guard) |
| Remaining risks | Pre-existing prettier lint failures (non-blocking) |
| Migration readiness | Phase 0 soak — EA route confirmed operational |
| Snapshot archive | reports/snapshots/stabilize-ea-2026-05-11/ |
| Rollback command | `git reset --hard 98ceaecf455506c4ae17d1a3914267d4ae306370` |

---

## Confirmed Problems

### BUG-001 — Missing OHLC Consistency Validation (FIXED)

| Field | Value |
|---|---|
| Severity | MEDIUM |
| System | EA Market Stream / Candle Ingestion |
| Status | FIXED in commit 116e36b0 |

**Description:** The `post_ea_market_stream()` handler stored candles without verifying that `high >= max(open, close)` and `low <= min(open, close)`. A logically corrupt OHLC candle (e.g. where `high < open`, which could occur due to a broker data error or MQL5 initialization fault) would be persisted and passed to the signal engine's Fib level calculation.

**Root cause:** Candle pre-validation checked only key existence (`isset(candle['time'], ...)`) and epoch-timestamp validity. No OHLC ordering check existed.

**Impact zones:** REST API (ea/market-stream), signal engine (fib_levels_from_candles), chart rendering.

**Fix applied:** Added `private function validate_ohlc(array $candle): bool` to `smc-superfib-sniper.php`. Applied the check to both M1 and M15 candle ingestion paths. Invalid candles are silently dropped (with audit trail via `audit()` and `error_log()`). Price snapshots are not affected — only the corrupt candle is blocked.

---

### BUG-002 — Pre-existing Prettier Lint Failures (NOT FIXED — non-blocking)

| Field | Value |
|---|---|
| Severity | LOW |
| System | Frontend build quality |
| Status | Pre-existing — not introduced by this sweep |

**Description:** `npm run lint` produces 90 `prettier/prettier` errors across `src/routes/admin.tsx`, `src/routes/index.tsx`, `src/routes/plan.tsx`, and others. All errors are whitespace/line-break formatting only — no logic issues. The build (`npm run build`) succeeds.

**Root cause:** Prettier auto-formatting not enforced as a pre-commit hook.

**Fix:** Run `npx prettier --write src/` to auto-fix. Not applied in this sweep as it touches many files with no logic change.

---

### INFO-001 — Payload Contract Documentation Divergence (INFO)

The workflow spec describes a payload using `quote_time`, `server_time`, and a `candles[]` array. The actual `MarketDataEngine.mqh` sends `timestamp` and single-object `candle` / `candle_m15` fields. The PHP handler is internally consistent with what the EA actually sends — this is a documentation gap, not a code bug.

---

## Surgical Fixes Applied

### PATCH-001: OHLC Consistency Guard

| Field | Value |
|---|---|
| File | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` |
| Lines added | +35 |
| Regression test | `tests/php/test-ea-market-stream.php` Test 6 |
| Rollback before | `rollback/stabilize-ea-2026-05-11-before-patches` |
| Rollback after | `rollback/stabilize-ea-2026-05-11-after-patch-1` |

Logic hardened:
- New `validate_ohlc()`: `high >= max(open,close) && low <= min(open,close)`
- Applied in M1 candle block and M15 candle block as `elseif (!$this->validate_ohlc($candle))`
- Invalid candle: logs OHLC GUARD message, calls `audit()` with `ea.market_stream.invalid_ohlc`, does NOT return error — snapshot insert continues normally
- Test 6 in `test-ea-market-stream.php`: sends candle with `high=1.0848 < open=1.0850`, verifies `candles_inserted=0` and `snapshots_inserted=1`

---

## EA Integration Status

| Attribute | Value |
|---|---|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth required | YES |
| Auth header | `X-EA-API-Key` (also: `X-API-KEY`, `x_ea_api_key`, `x_api_key`) |
| Auth mechanism | `hash_equals()` against `SMC_SF_EA_API_KEY` constant/env |
| user_id required | YES (in JSON body) |
| Missing token | 401 `smc_sf_api_key_missing` |
| Unconfigured secret | 503 `smc_sf_api_key_unconfigured` |
| Invalid token | 403 `smc_sf_api_key_invalid` |
| Missing user_id | 400 `smc_sf_user_required` |
| Invalid user_id | 403 `smc_sf_user_invalid` |
| wp_set_current_user | Called in permission callback before `return true` |
| Stale data rejection | >300s → 400 `stale_data`; warn-only at 120–300s |
| Candle stale rejection | >180s for M1; >1800s for M15 (inside `insert_mt5_candle()`) |
| OHLC validation | YES (as of PATCH-001) |
| Payload contract (actual) | `{user_id, symbol, normalized_symbol, timeframe, timestamp, bid, ask, freshness, session, candle{time,open,high,low,close,volume}, candle_m15{...}}` |

**Test curl commands:**

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

# Valid full payload
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "timestamp": "2026-05-11T12:32:09Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "freshness": "LIVE",
    "session": "London",
    "candle": {
      "time": "2026-05-11T12:31:00Z",
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

| Layer | Status |
|---|---|
| Pine vs Backend Fib levels | Confirmed aligned (see phase-6-signal-parity-2026-05-03.md) |
| MT5 EA timestamp → PHP | UTC ISO 8601 via `TimeToIso8601()`, correctly parsed with `strtotime()` |
| MQL5 field names vs PHP handler | Aligned: both use `timestamp`, `candle`, `candle_m15` |
| Backend age_sec | Computed from `updated_at` (broker timestamp), not server fetch time |
| Frontend FreshnessBadge | Uses `state` from backend response — no local age computation |
| Signal backendConfirmed | Only set when `status=READY && data_live` in backend |
| execute_signals gate | Checks `backend_confirmed=1 AND status='READY'` in DB |

---

## Regression Checklist

- [x] `php -l smc-superfib-sniper.php` passes
- [x] `php -l class-market-data-service.php` passes
- [x] `test-cors-regression.php` passes
- [x] `test-ea-market-stream.php` passes (all 6 tests including new OHLC guard test)
- [x] `test-mt5-snapshot-contract.php` passes
- [x] `test-pip-value-parity.php` passes
- [x] `test-rest-bootstrap-settings.php` passes
- [x] `test-settings-risk-fallbacks.php` passes
- [x] `test-watchlist-snapshot-regression.php` passes
- [x] `npm run build` passes
- [x] `npm run check:mql` passes
- [ ] `npm run lint` — 90 pre-existing prettier errors (non-blocking)
- [x] EA route rejects missing token (401)
- [x] EA route rejects invalid token (403)
- [x] EA route rejects missing user_id (400)
- [x] EA route rejects stale data >300s (400)
- [x] EA route rejects invalid OHLC candle (snapshot still stored)
- [x] authority-diagnostics returns 401 for unauthenticated
- [x] admin routes require manage_options
- [x] signal engine gates on mt5 source + live state + age threshold

---

## Remaining Risks

1. **Prettier lint failures** — 90 formatting-only errors in `src/routes/`. Non-blocking for deployment but should be auto-fixed before merging.
2. **No phpunit/composer test harness** — PHP tests are standalone scripts run with `php`. Formal PHPUnit setup would improve CI coverage.
3. **Candle validation is warn-not-block** — Invalid OHLC candles are silently dropped (not returned as a 400 to the EA). The EA currently has no way to know a candle was rejected vs accepted. Consider adding a `candles_rejected` field to the response.

---

## Safe Deployment Order

1. Deploy WordPress plugin (PHP files) to trader.stokvelsociety.co.za
2. Verify `php -l` passes on server
3. Reload/restart PHP-FPM if needed
4. Test EA auth with curl commands above
5. Attach MT5 EA and verify first stream ingests correctly
6. Monitor `smc_sf_audit_events` table for `ea.market_stream.invalid_ohlc` entries (should be zero for healthy EA)

---

## Rollback Procedure

```bash
# Roll back to pre-patch state
git reset --hard rollback/stabilize-ea-2026-05-11-before-patches

# Or by commit hash
git reset --hard 98ceaecf455506c4ae17d1a3914267d4ae306370

# Emergency (back to main)
git checkout main && git reset --hard origin/main
```
