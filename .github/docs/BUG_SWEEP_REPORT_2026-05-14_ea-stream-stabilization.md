# Bug Sweep Report — EA Stream Stabilization — 2026-05-14

**Workflow ID:** stabilize-ea-2026-05-14  
**Branch:** claude/serene-hopper-VFRyT  
**Final Commit:** 1da5b02c9c290d873b807226ff0bdedff897fc5c  
**Prior Commit:** da4720ebac830eb4757ebe04501f75a3c131ee18

---

## Executive Summary

| Item | Status |
|---|---|
| Overall system health | STABLE |
| Bugs found | 3 (0 critical, 0 high, 1 medium, 2 low) |
| Bugs fixed | 3 |
| Remaining risks | NONE — all identified issues patched |
| Migration readiness | Phase 0 soak continues — ready for live EA streaming |
| Snapshot archive | reports/snapshots/stabilize-ea-2026-05-14/ |
| Rollback command | `git reset --hard da4720ebac830eb4757ebe04501f75a3c131ee18` |

This workflow run is a hardening pass on the EA market stream ingestion pipeline.
The system was already in good shape from prior workflow runs (2026-05-11 through 2026-05-13).
Three lower-severity issues were identified and patched, strengthening the candle staleness
protection and correcting the HTTP semantics of stale data rejection.

---

## Confirmed Problems

### BUG-001 — Stream_timestamp null bypass in candle insertion (MEDIUM)

**Root cause:** `insert_mt5_candle()` receives `$stream_timestamp = $payload['timestamp'] ?? null`.
When `timestamp` is absent from the payload, `$stream_timestamp` is null. Both the
future-candle guard (`if ($stream_timestamp && strtotime(candle.time) >= strtotime($stream_timestamp))`)
and the age staleness guard (`if ($stream_timestamp)`) are wrapped in null-check blocks, so both
are silently skipped when null.

**Impact:** A non-standard API caller (one that sends a valid EA API key but omits `timestamp`)
could inject arbitrarily old candles or open/forming candles. The EA always sends `timestamp`, so
real-world risk is low, but the guard should be unconditional.

**Impact zones:** EA Market Stream Ingestion, Signal Engine (stale candle data risk), Dashboard.

**Files affected:**
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — M1 candle block (~line 1781)
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — M15 candle block (~line 1834)

---

### BUG-002 — Stale data rejection returns HTTP 400 instead of 422 (LOW)

**Root cause:** Both stale data rejection paths in `post_ea_market_stream()` used
`array('status' => 400)` (Bad Request). A stale quote time is a business-logic validity
failure, not a malformed request. The correct HTTP status is 422 (Unprocessable Entity).

**Impact:** Semantic only. The EA retry logic does not branch on 400 vs 422. However, the
spec explicitly requires 422 for stale quote_time, and tooling or monitoring that inspects
error codes could misclassify these errors.

**Files affected:**
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — two `WP_Error('stale_data', ...)` calls

---

### INFO-001 — Duplicate test labels in test-ea-market-stream.php (LOW)

**Root cause:** A copy-paste error in a previous run left "Test 2" and "Test 4" labels duplicated
in the test output, making test output hard to read in CI logs.

**Impact:** Test output quality only. All assertions were correct.

**Files affected:**
- `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`

---

## Surgical Fixes Applied

### PATCH-1 — Server-time fallback for $stream_timestamp (BUG-001)

**Files changed:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Change (M1 block):**
```php
// Before (bypass when timestamp absent):
$result = $this->insert_mt5_candle($user_id, $symbol, $timeframe, $candle, $payload['timestamp'] ?? null);

// After (server-time fallback ensures guards always execute):
$m1_stream_ts = !empty($payload['timestamp']) ? $payload['timestamp'] : gmdate('c');
$result = $this->insert_mt5_candle($user_id, $symbol, $timeframe, $candle, $m1_stream_ts);
```

Same pattern applied to M15 candle block with `$m15_stream_ts`.

**Regression protection:** Test 11 added — asserts a 90-second-old candle without timestamp
is correctly stored via the fallback (within 180s max_age_sec window).

**Rollback point before:** `rollback/stabilize-ea-2026-05-14-before-patches`  
**Rollback point after:** `rollback/stabilize-ea-2026-05-14-after-patch-1`

---

### PATCH-2 — HTTP 422 for stale rejection (BUG-002)

**Files changed:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

```php
// Before:
return new WP_Error('stale_data', 'Rejected market data with unparseable timestamp', array('status' => 400));
return new WP_Error('stale_data', 'Rejected market data older than 300 seconds', array('status' => 400));

// After:
return new WP_Error('stale_data', 'Rejected market data with unparseable timestamp', array('status' => 422));
return new WP_Error('stale_data', 'Rejected market data older than 300 seconds', array('status' => 422));
```

**Regression protection:** Test 4 updated to assert `data['status'] === 422`.

---

### PATCH-3 — Test label numbering + Test 11 (INFO-001)

**Files changed:** `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`

- Labels corrected: Tests now sequential 1–11 with no duplicates.
- Test 4 assertion updated: now checks `data['status'] === 422`.
- Test 11 added: validates server-time fallback for missing timestamp with valid candle.

---

## EA Integration Status

| Item | Status |
|---|---|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth model | Shared secret via `X-EA-API-Key` header (or 3 aliases) |
| Secret env | `SMC_SF_EA_API_KEY` (constant or `getenv()`) |
| Hash comparison | `hash_equals()` — timing-safe |
| Missing token | 401 |
| Unconfigured secret | 503 + `error_log` |
| Invalid token | 403 |
| Missing `user_id` | 400 |
| Invalid `user_id` | 403 |
| `wp_set_current_user()` | Called before permission returns true |
| Stale payload (>300s) | **422** (was 400 — patched) |
| Unparseable timestamp | **422** (was 400 — patched) |
| Missing bid/ask | 400 |
| Invalid OHLC | Candle rejected (audit logged); snapshot still stored |
| Infinite bid/ask | Snapshot not stored (audit logged) |
| Negative tick_volume | Clamped to 0 (audit logged) |
| Missing timestamp + candle | **Staleness guards now always run** via server-time fallback (patched) |

### EA Payload Contract (actual, not spec)

```json
{
  "user_id": 1,
  "symbol": "EURUSD",
  "normalized_symbol": "EURUSD",
  "timeframe": "M1",
  "timestamp": "2026-05-14T12:32:09Z",
  "bid": 1.08521,
  "ask": 1.08534,
  "freshness": "LIVE",
  "session": "London",
  "candle": {
    "time": "2026-05-14T12:31:00Z",
    "open": 1.0851,
    "high": 1.0855,
    "low": 1.0849,
    "close": 1.0853,
    "volume": 123
  },
  "candle_m15": {
    "time": "2026-05-14T12:15:00Z",
    "open": 1.0845,
    "high": 1.0860,
    "low": 1.0840,
    "close": 1.0853,
    "volume": 987
  }
}
```

**Note:** The workflow spec uses `quote_time`, `server_time`, and `candles[]` (array) in its
examples. The actual implemented contract uses `timestamp` (singular), `candle{}` (singular M1),
and `candle_m15{}` (singular M15). Both EA and PHP are aligned to this contract.

---

## Parity Verification

| Layer | Status | Notes |
|---|---|---|
| Pine vs Backend | Not in scope this run — no Pine formula changes | ✅ No drift introduced |
| MQL5 EA vs PHP handler | ALIGNED | Field names, timestamp format, candle structure all consistent |
| Backend vs Dashboard | ALIGNED | FreshnessBadge, VerdictBadge use backend `state`/`verdict` — no frontend override |
| Backend vs MT5 authority | ALIGNED | Signal engine gates on backend `is_live`, candle count, freshness |

---

## Regression Checklist

- [x] `authority-diagnostics` returns 401 for unauthenticated — unchanged (correct)
- [x] `admin/*` routes require `manage_options` — unchanged
- [x] EA route rejects missing `X-EA-API-Key` → 401
- [x] EA route rejects wrong token → 403
- [x] EA route rejects missing `user_id` → 400
- [x] EA route rejects stale data (>300s) → **422** (patched)
- [x] EA route accepts fresh full payload → 200 OK
- [x] Candles missing timestamp protected by server-time fallback → staleness enforced (patched)
- [x] OHLC guard active — invalid candles rejected; snapshots still stored
- [x] is_finite() guard active — INF bid/ask rejected
- [x] guard_tick_volume() active — negative values clamped to 0
- [x] Epoch guard active — pre-2000 candles rejected
- [x] Backend signal engine gated on `is_live`, candle count ≥ 30, candle age ≤ 7200s, chop < 0.7
- [x] Dashboard FreshnessBadge uses backend `price.state` — not page-load computed
- [x] Dashboard VerdictBadge uses backend `signal.verdict` — no frontend override
- [x] useSniperData polling gated on `backendReady && pollMs !== null`
- [x] PHP syntax clean on all modified files
- [x] MQL5 include check passes
- [x] All 11 EA market stream tests pass
- [x] All 12 PHP regression test suites pass

---

## Remaining Risks

None confirmed. The following are pre-existing documented design decisions, not bugs:

1. **`npm run lint` / `npm run build`:** Both fail in this CI environment due to missing
   `@eslint/js` package and `vite` not installed in `node_modules`. These are environment
   issues, not code regressions. The TypeScript and React source was not modified in this run.

2. **No PHPUnit / Composer:** PHP regression testing relies on standalone test scripts in
   `tests/php/`. Full PHPUnit integration would provide better isolation and coverage reporting
   but is not currently set up.

3. **`timestamp` absent from payload:** The EA always sends `timestamp`. The server-time
   fallback (PATCH-1) now covers this edge case for any non-standard callers with a valid key.

---

## Safe Deployment Order

1. Deploy `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` to WordPress plugin.
2. Deploy `wordpress/smc-superfib-sniper/class-market-data-service.php` (unchanged — deploy for completeness).
3. Verify EA streaming resumes (check `/wp-json/sniper/v1/admin/soak-report` for recent engine_runs heartbeats).
4. Confirm dashboard shows `LIVE` state for active symbols.

---

## Rollback Procedure

```bash
# Roll back to pre-patch state (keeps repo clean):
git reset --hard da4720ebac830eb4757ebe04501f75a3c131ee18

# Emergency full rollback to main:
git checkout main && git reset --hard origin/main
```

---

## EA Test Commands

### Missing token → 401
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Invalid token → 403
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Missing user_id → 400
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD","timestamp":"2026-05-14T12:00:00Z","bid":1.08521,"ask":1.08534}'
```

### Stale timestamp → 422 (patched from 400)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"user_id":1,"symbol":"EURUSD","timestamp":"2026-05-14T00:00:00Z","bid":1.08521,"ask":1.08534}'
```

### Valid full payload → 200 OK
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "bid": 1.08521,
    "ask": 1.08534,
    "freshness": "LIVE",
    "session": "London",
    "candle": {
      "time": "'"$(date -u -d '90 seconds ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-90S +%Y-%m-%dT%H:%M:%SZ)"'",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "volume": 123
    }
  }'
```
