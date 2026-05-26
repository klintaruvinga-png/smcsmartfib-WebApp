# Bug Sweep Report — 2026-05-26

**Report Date**: 2026-05-26  
**Phase**: Phase 4 — Fib Engine Migration (code complete; live parity corpus pending operator)  
**Scanner**: Claude Code (stabilize-ea-2026-05-26 workflow)  
**Workflow ID**: stabilize-ea-2026-05-26  
**Branch**: claude/nice-fermat-28hKb

---

## Executive Summary

- **Overall Health**: STABLE — all core production logic confirmed correct. One medium validation-feedback gap patched.
- **Bugs Found**: 2 (1 MEDIUM, 1 LOW)
- **Fixes Applied**: BUG-001 EA invalid bid/ask now returns HTTP 422; BUG-002 Prettier drift auto-fixed.
- **Migration Readiness**: Phase 4 code complete, gate pending live operator parity corpus. No code blockers.
- **Snapshot Archive**: `reports/snapshots/stabilize-ea-2026-05-26/`
- **Rollback Command**: `git reset --hard 6a5262058670d2aa1fac56a249236f8666156515`

---

## Confirmed Problems

### Medium

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|------------------|
| BUG-001: Invalid bid/ask returns 200 OK with snapshots_inserted=0 | `smc-superfib-sniper.php` post_ea_market_stream (lines 2712–2731) | The `is_finite && $bid > 0 && $ask > 0 && $bid <= $ask` guard logged an audit but fell through without returning a structured error. The EA received HTTP 200 and could not distinguish a success from a price-validation failure. | EA silent failure when sending zero, negative, infinite, or bid>ask prices. No snapshot stored; no retry signal sent. | No — candles and Phase 3 freshness/session paths were unaffected | Return `WP_Error('invalid_prices', ..., ['status' => 422])` for any invalid bid/ask combination |

### Low

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|------------------|
| BUG-002: 12 Prettier formatting errors | sdk/src/constants/symbols.ts, sdk/src/index.ts, sdk/src/mocks/fixtures.ts, src/mocks/sniperData.ts, src/hooks/useSniperData.ts, src/hooks/useStreamingTicks.ts | Prettier config drift in SDK and minor edits not run through formatter | CI lint gate fails | No | eslint --fix applied; no logic change |

---

## Confirmed Correct — No Issues Found

The following were fully audited and confirmed correct:

| System | Finding |
|--------|---------|
| EA auth model | Complete: hash_equals, 4 header aliases, correct 401/503/403/400/403 codes |
| authority-diagnostics | Protected (401 for unauthenticated) — by design, not a bug |
| Admin routes | Require manage_options — by design |
| Stale rejection | Hard-reject at 300s with 422; warn-only 120–300s — correct |
| OHLC validation | high >= max(open,close), low <= min(open,close) — correct |
| Candle epoch guard | Pre-2000 timestamps rejected — correct |
| tick_volume guard | Non-numeric clamped to 0; negative clamped to 0 — correct |
| FreshnessBadge | Renders backend-provided state, no local age computation — correct |
| VerdictBadge | Renders backend-provided verdict, no local derivation — correct |
| useSnapshot | Gated on backendReady && pollMs !== null — correct |
| quote_time alias | Uses !empty() (not ??) — correct; avoids stale bypass on empty string |
| Symbol alias map | GOLD→XAUUSD, USTECH100→NAS100, WALLSTREET30→US30 — correct |
| sniperClient.call() | Attaches Authorization or X-WP-Nonce; no EA token in frontend — correct |
| Signal truth authority | Lives in ensure_engine_snapshot() (backend); dashboard renders, never computes — correct |
| Phase 4 fib engine | 100% fixture parity; 7/7 ingestion tests; 288/288 parity validator — correct |
| Phase 3 M15 candle support | candle_m15 ingestion path complete, OHLC/epoch guard applied — correct |
| Phase 3 freshness/session | Validated for Phase 3 payloads; graceful for Phase 1/2 payloads — correct |
| candles[] shim | candles[0] promoted to candle; tick_volume mapped to volume — correct |

---

## Surgical Fixes Applied

### BUG-001 — `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Lines changed**: 2712–2731 (plugin, post_ea_market_stream handler)

**Before** (lines 2712–2731):
```php
if (isset($payload['bid'], $payload['ask'])) {
    $bid = (float) $payload['bid'];
    $ask = (float) $payload['ask'];
    if (is_finite($bid) && is_finite($ask) && $bid > 0 && $ask > 0 && $bid <= $ask) {
        // ... upsert
    } else {
        $this->audit(...); // silent — no error returned to EA
    }
}
```

**After**:
```php
$bid = (float) $payload['bid'];
$ask = (float) $payload['ask'];
if (!is_finite($bid) || !is_finite($ask) || $bid <= 0 || $ask <= 0 || $bid > $ask) {
    $this->audit($user_id, 'ea.market_stream.invalid_prices', [...]);
    return new WP_Error('invalid_prices', 'bid and ask must be finite positive numbers with bid <= ask.', ['status' => 422]);
}
// ... upsert proceeds
```

**Regression protection**:
- Updated `test-ea-market-stream.php` Test 8: now asserts `WP_Error invalid_prices HTTP 422` for INF bid
- Added `test-ea-market-stream.php` Test 8b: asserts `WP_Error invalid_prices HTTP 422` for bid > ask
- All 15 regression tests pass

### BUG-002 — Multiple frontend/SDK files

**Auto-fixed Prettier formatting** in:
- `sdk/src/constants/index.ts`
- `sdk/src/constants/symbols.ts`
- `sdk/src/index.ts`
- `sdk/src/mocks/fixtures.ts`
- `src/mocks/sniperData.ts`
- `src/hooks/useSniperData.ts`
- `src/hooks/useStreamingTicks.ts`

No logic change. Zero errors remaining after fix.

---

## EA Integration Status

| Property | Value |
|----------|-------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth Required | Yes — X-EA-API-Key header |
| Auth Model | Shared-secret via hash_equals vs SMC_SF_EA_API_KEY |
| Header Aliases | `X-EA-API-Key`, `X_EA-API-Key`, `X-API-KEY`, `X_API_KEY` |
| user_id Required | Yes — in payload (validated by permission_ea_bridge) |
| Missing key | HTTP 401 `smc_sf_api_key_missing` |
| Unconfigured secret | HTTP 503 `smc_sf_api_key_unconfigured` |
| Invalid key | HTTP 403 `smc_sf_api_key_invalid` |
| Missing user_id | HTTP 400 `smc_sf_user_required` |
| Invalid user_id | HTTP 403 `smc_sf_user_invalid` |
| Stale quote_time (>300s) | HTTP 422 `stale_data` |
| Invalid bid/ask | HTTP 422 `invalid_prices` *(NEW — BUG-001 patch)* |
| Invalid OHLC | Candle silently dropped; snapshot still inserted (by design) |
| Missing symbol | HTTP 400 `invalid_payload` |
| Payload validation | Complete |
| Stale-data rejection | Active at 300s hard limit |

### curl test — missing token
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
# Expected: HTTP 401 {"code":"smc_sf_api_key_missing",...}
```

### curl test — invalid token
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
# Expected: HTTP 403 {"code":"smc_sf_api_key_invalid",...}
```

### curl test — missing user_id
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
# Expected: HTTP 400 {"code":"smc_sf_user_required",...}
```

### curl test — valid full payload
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-26T00:00:00Z",
    "quote_time": "2026-05-26T00:00:00Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-25T23:59:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
# Expected: HTTP 200 {"ok":true,"snapshots_inserted":1,"candles_inserted":1,...}
```

---

## Parity Verification Results

| Domain | Result | Evidence |
|--------|--------|----------|
| EA auth model | PASS | Audited permission_ea_bridge — all checks verified in code |
| Stale rejection | PASS | 300s hard reject, 120s warn — regression test 4 and 14 PASS |
| OHLC validation | PASS | validate_ohlc() correct — regression tests 7 PASS |
| Candle epoch guard | PASS | min_valid_ts = 946684800 — regression test 11 PASS |
| bid/ask validation (BUG-001) | PASS after patch | Tests 8 and 8b now PASS with HTTP 422 |
| Symbol alias map | PASS | GOLD/USTECH100/WALLSTREET/WALLSTREET30 all mapped |
| FreshnessBadge authority | PASS | Backend state passed through; no local computation |
| VerdictBadge authority | PASS | Backend verdict passed through; no local computation |
| Signal engine authority | PASS | ensure_engine_snapshot() backend-only; frontend renders |
| Phase 4 fib parity | PASS (fixture) | 100% on all 18 symbol/TF/family combinations; live corpus pending |

---

## Migration Status Update

| Phase | Status |
|-------|--------|
| 0 — Stabilize | COMPLETE (gate passed 2026-05-15) |
| 1 — MT5 Bridge | COMPLETE (gate passed 2026-05-20) |
| 2 — Trade Telemetry | COMPLETE (gate passed 2026-05-22) |
| 3 — Market Data Engine | COMPLETE (gate CONDITIONAL PASS 2026-05-25) |
| 4 — Fib Engine | IN-PROGRESS — code complete; live parity corpus pending operator |

**Blockers addressed this workflow**: BUG-001 (EA feedback reliability)  
**Remaining blockers**: MIGRATION-P4-001 (live MT5 parity corpus — operator action)

---

## Regression Checklist

- [x] `php -l smc-superfib-sniper.php` — PASS
- [x] `php -l class-market-data-service.php` — PASS
- [x] `npm run build` — PASS
- [x] `npm run lint` — PASS (0 errors)
- [x] `npm run check:mql` — PASS
- [x] EA endpoint rejects missing X-EA-API-Key — HTTP 401 ✓
- [x] EA endpoint rejects invalid X-EA-API-Key — HTTP 403 ✓
- [x] EA endpoint rejects missing user_id — HTTP 400 ✓
- [x] EA endpoint rejects stale quote_time — HTTP 422 ✓
- [x] EA endpoint rejects invalid bid/ask — HTTP 422 ✓ *(new — BUG-001)*
- [x] EA endpoint accepts valid fresh payload — HTTP 200 ✓
- [x] authority-diagnostics returns 401 for unauthenticated — by design ✓
- [x] Admin routes require manage_options — by design ✓
- [x] Dashboard does not mark stale data as live — FreshnessBadge uses backend state ✓
- [x] Signal engine does not run on stale data — gated backend-side ✓
- [x] OHLC candle guard active — invalid OHLC silently dropped ✓
- [x] tick_volume guard active — non-numeric/negative clamped to 0 ✓

---

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| MIGRATION-P4-001: Live MT5 parity corpus not captured | MEDIUM | Operator must run MT5 against live market for 30 days; no code change needed |
| `npm test` / phpunit not available | LOW | Test coverage limited to available PHP regression pack + Vitest; no automated runner |
| Pre-existing lint warnings (9) | NEGLIGIBLE | All are fast-refresh and missing-dep warnings in stable code; non-blocking |
| Phase 4 gate requires manual validation | MEDIUM | Cannot advance to Phase 5 without live corpus; timeline per migration board |

---

## Safe Deployment Order

1. Deploy patched `smc-superfib-sniper.php` to `trader.stokvelsociety.co.za` WordPress plugin.
2. Verify EA integration with curl missing-token, invalid-token, and valid-payload tests above.
3. Confirm EA receives HTTP 422 on the next invalid price push (monitor MT5 EA logs).
4. Deploy frontend build (no breaking changes — formatting only).

---

## Rollback Procedure

```bash
# Rollback to pre-patch state (commit hash — authoritative)
git reset --hard 6a5262058670d2aa1fac56a249236f8666156515
```

> **Note**: Git tags for this workflow (`snapshot/stabilize-ea-2026-05-26-*`,
> `rollback/stabilize-ea-2026-05-26-*`) exist locally only — a permission restriction
> prevented pushing them to the remote. Use commit hashes for all rollback operations.
