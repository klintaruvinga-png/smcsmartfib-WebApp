# Bug Sweep Report — 2026-05-12

## Executive Summary

| Item | Status |
|---|---|
| Overall Health | STABLE |
| Bugs Found | 2 (1 MEDIUM, 1 LOW) |
| Bugs Fixed | 2 |
| Remaining Risks | None blocking |
| Migration Readiness | Phase 0 soak — EA stream fully wired |
| Snapshot Archive | reports/snapshots/stabilize-ea-2026-05-12/ |
| Rollback Command | `git reset --hard rollback/stabilize-ea-2026-05-12-before-patches` |

**Context:** Second stabilization workflow run on this codebase. The 2026-05-11 run patched OHLC validation (PATCH-001). This run found and patched two additional hardening gaps: missing `is_finite()` on bid/ask and a noisy log for normal tick-only pushes.

---

## Confirmed Problems

### BUG-001 — Missing `is_finite()` guard for bid/ask (MEDIUM)

- **Severity:** MEDIUM
- **Root Cause:** PHP's `(float)` cast silently accepts IEEE 754 special values. The prior bid/ask guard (`$bid > 0 && $ask > 0 && $bid <= $ask`) was insufficient because `(float) INF > 0` evaluates to `true`. A broken broker connection or malformed EA payload could theoretically send `INF` or `NAN` which would then be stored in the snapshot database, corrupting signal engine inputs.
- **Impact:** EA Market Stream ingestion → Snapshot DB → Signal Engine → Dashboard
- **Files Affected:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (line ~1698)

### BUG-002 — Noisy error_log for absent candle field (LOW)

- **Severity:** LOW
- **Root Cause:** `post_ea_market_stream()` logged `error_log("MT5 CANDLE PAYLOAD MISSING OR INVALID FOR SYMBOL: ...")` on every tick-only push where no `candle` field was present. Since the MT5 EA legitimately omits the candle field between M1 bar closures, this created log noise on every periodic tick.
- **Impact:** PHP error log volume. No functional impact.
- **Files Affected:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (line ~1761)

---

## Surgical Fixes Applied

### PATCH-001 — is_finite() guard for bid/ask

**File changed:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Logic hardened:**
```php
// Before
if ($bid > 0 && $ask > 0 && $bid <= $ask) {

// After
if (is_finite($bid) && is_finite($ask) && $bid > 0 && $ask > 0 && $bid <= $ask) {
```

**Regression protection:** Test 7 added to `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` — verifies that `INF` bid is rejected and no snapshot is inserted.

**Rollback points:**
- Before: `rollback/stabilize-ea-2026-05-12-before-patches`
- After: `rollback/stabilize-ea-2026-05-12-after-patch-1`

### PATCH-002 — Candle-absent log noise

**File changed:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Logic hardened:**
```php
// Before:
} else {
    error_log("MT5 CANDLE PAYLOAD MISSING OR INVALID FOR SYMBOL: {$symbol}");
}

// After:
} elseif (isset($payload['candle'])) {
    // candle key is present but not a valid array — log as a real anomaly.
    error_log("MT5 CANDLE PAYLOAD INVALID (non-array) FOR SYMBOL: {$symbol}");
}
// else: candle key absent — normal tick-only push; no log needed.
```

**Regression protection:** Existing Test 5 (Snapshot-only payload) confirms tick-only push still succeeds.

---

## EA Integration Status

| Item | Status |
|---|---|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth model | Shared-secret API key |
| Required header | `X-EA-API-Key` (also: `X-API-KEY`, `x_ea_api_key`, `x_api_key`) |
| Secret env | `SMC_SF_EA_API_KEY` (PHP constant or `getenv()`) |
| Hash comparison | `hash_equals()` — timing-safe |
| `user_id` required | YES — validated via `get_userdata()` + `user_can('read')` |
| `wp_set_current_user()` | YES — called before returning `true` |
| Missing token | 401 `smc_sf_api_key_missing` |
| Unconfigured secret | 503 `smc_sf_api_key_unconfigured` |
| Invalid token | 403 `smc_sf_api_key_invalid` |
| Missing user_id | 400 `smc_sf_user_required` |
| Invalid user | 403 `smc_sf_user_invalid` |
| Payload contract | `user_id`, `symbol`, `normalized_symbol`, `timeframe`, `timestamp`, `bid`, `ask`, `freshness`, `session`, `candle{}` (optional), `candle_m15{}` (optional) |
| Stale data rejection | Hard reject > 300s, warn 120–300s |
| Candle stale rejection | > 180s from stream timestamp |
| OHLC validation | `high >= max(open,close)`, `low <= min(open,close)` |
| is_finite validation | `is_finite(bid) && is_finite(ask)` — PATCHED 2026-05-12 |

---

## Parity Verification

| Comparison | Status |
|---|---|
| Pine/MQL5 vs. backend fib levels | No drift found |
| Backend signal readiness vs. dashboard | CONFIRMED — dashboard reads backend `backendConfirmed` field |
| Backend `is_live` vs. dashboard display | CONFIRMED — FreshnessBadge reads `price.state` from backend |
| MT5 EA payload field names vs. PHP handler | CONFIRMED — all fields matched |
| Broker timestamp UTC conversion | CONFIRMED — `TimeGMT()` used for correct UTC |
| Session display vs. market-open detection | DOCUMENTED DIVERGENCE (display: killzone windows; EA: full sessions) — intentional |
| EA payload field naming vs. workflow spec | DOCUMENTED DIVERGENCE — spec used `quote_time`/`server_time`/`candles[]`; actual uses `timestamp`/`candle{}`/`candle_m15{}` |

---

## Regression Checklist

- [x] PHP syntax passes on all modified PHP files
- [x] `bun run build` succeeds
- [x] `npm run check:mql` passes
- [x] `npm run lint` — 70 pre-existing prettier whitespace errors (unchanged, non-blocking)
- [x] EA endpoint rejects missing `X-EA-API-Key` → 401
- [x] EA endpoint rejects invalid `X-EA-API-Key` → 403
- [x] EA endpoint rejects missing `user_id` → 400
- [x] EA endpoint rejects malformed payload (missing symbol) → 400
- [x] EA endpoint rejects stale `timestamp` (>300s) → 400
- [x] EA endpoint rejects invalid OHLC candle (snapshot still stored) → 200, candles_inserted=0
- [x] EA endpoint rejects INF bid → 200, snapshots_inserted=0 (PATCH-001)
- [x] Tick-only push (no candle key) → no error_log noise (PATCH-002)
- [x] Dashboard does not mark stale data as live (backend `price.state` authoritative)
- [x] Signal engine does not backend-confirm on stale data (`backendConfirmed = status=READY && data_live`)
- [x] `authority-diagnostics` returns 401 for unauthenticated requests
- [x] Admin routes require `manage_options`

---

## Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `npm run lint` 70 prettier errors | Low | Pre-existing, whitespace-only, no logic impact. Can be fixed with `--fix` flag in a dedicated cleanup PR. |
| Candle freshness threshold 7200s | Low | Intentional buffer for offline/weekend periods. Only affects live-ness classification if EA is disconnected for >2h. |
| EA uptime gap | Medium | If EA stops streaming for >2h, candles become stale and signals cannot be backend-confirmed. This is correct behavior, not a bug. |
| `npm test` not available | Low | No npm test runner configured. PHP regression tests run via `php test-*.php` directly. Unit test infrastructure recommended for future sprints. |

---

## Safe Deployment Order

1. Deploy WordPress plugin update (PHP files only modified).
2. Verify EA reconnects and streams fresh ticks.
3. Confirm `GET /wp-json/sniper/v1/health` returns `auth: true` for logged-in users.
4. Confirm `POST .../ea/market-stream` with valid payload returns `ok: true`.
5. Confirm `authority-diagnostics` returns 401 for unauthenticated curl.
6. Deploy frontend (if needed) — no frontend code changed in this workflow.

---

## Rollback Procedure

```bash
# Rollback to pre-patch state
git reset --hard rollback/stabilize-ea-2026-05-12-before-patches

# Emergency full rollback to main
git checkout main && git reset --hard origin/main
```

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

### Valid full payload test (expect 200 ok: true)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "normalized_symbol": "EURUSD",
    "timeframe": "M1",
    "timestamp": "2026-05-12T10:32:09Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "freshness": "LIVE",
    "session": "London",
    "candle": {
      "time": "2026-05-12T10:31:00Z",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "volume": 123
    }
  }'
```
