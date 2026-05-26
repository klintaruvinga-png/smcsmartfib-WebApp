# Bug Sweep Report — 2026-05-26

**Workflow ID**: stabilize-ea-2026-05-26  
**Branch**: claude/nice-fermat-r0HWw  
**Commit**: 6b4c544d69188e6f7602933165b220d1c5a69864  
**Auditor**: Claude Code (automated stabilization pipeline)  
**Date**: 2026-05-26

---

## Executive Summary

| Metric | Value |
|--------|-------|
| System Health | ✅ STABLE |
| Confirmed Bugs | 0 |
| Fixes Applied | 0 |
| Remaining Risks | Low — see Phase 4 operator actions |
| Migration Readiness | Phase 4 code complete; gate requires operator actions |
| Snapshot Archive | reports/snapshots/stabilize-ea-2026-05-26/ |
| Rollback Command | `git reset --hard 6b4c544d69188e6f7602933165b220d1c5a69864` |

Full audit pass. Zero confirmed bugs found across all 14 pipeline stages. System is well-hardened following 15+ consecutive daily stabilization runs since 2026-05-11. Phase 4 (Fib Engine Migration) code is complete as of 2026-05-25; gate advancement requires three operator actions (live MT5 corpus, Pine snapshots, admin soak baseline).

---

## Confirmed Problems

**None.** Zero confirmed bugs found in this workflow run.

### Observations (Non-Issues)

| ID | Severity | System | Description | Status |
|----|----------|--------|-------------|--------|
| OBS-001 | INFO | FibEngine.mqh | Latest commit 6b4c544 changed `static const int MAX_SESSIONS = 2048` to `enum { MAX_SESSIONS = 2048 }` — non-functional change, correct MQL5 pattern for compile-time constants | NON_ISSUE |
| OBS-002 | INFO | class-market-data-service.php | `is_equity_index_symbol()` uses `strpos()` — acceptable given symbols are pre-normalized uppercase before this call | NON_ISSUE |
| OBS-003 | INFO | EA Payload Contract | Multi-candle batch (candles[] with >1 entry) logs diagnostic and stores only candles[0] — correctly deferred beyond Phase 3 | NON_ISSUE |
| OBS-004 | INFO | Build Environment | `vite` and `@eslint/js` not installed in remote execution environment — pre-existing limitation confirmed since 2026-05-11 | ENV_LIMITATION |

---

## Surgical Fixes Applied

**None.** No code changes required.

---

## EA Integration Status

| Component | Status |
|-----------|--------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` — CONFIRMED |
| Auth model | `X-EA-API-Key` header + `SMC_SF_EA_API_KEY` constant/env via `hash_equals()` |
| Header aliases | `x-ea-api-key`, `x_ea_api_key`, `x-api-key`, `x_api_key` — all accepted |
| `user_id` required | YES — validated in `permission_ea_bridge()` before handler runs |
| Missing token | HTTP 401 `smc_sf_api_key_missing` |
| Unconfigured secret | HTTP 503 `smc_sf_api_key_unconfigured` + `error_log` |
| Invalid token | HTTP 403 `smc_sf_api_key_invalid` |
| Missing user_id | HTTP 400 `smc_sf_user_required` |
| Invalid user_id | HTTP 403 `smc_sf_user_invalid` |
| Stale quote_time (>300s) | HTTP 422 `stale_data` |
| Unparseable timestamp | HTTP 422 `stale_data` |
| Invalid OHLC ordering | Rejected silently; snapshot still stored if bid/ask valid |
| Pre-2000 candle epoch | Rejected with audit log |
| INF/NaN bid/ask | Rejected via `is_finite()` guard |

### Required Payload Fields
```
user_id   — required (auth layer)
symbol    — required
bid       — required with ask
ask       — required with bid
```

### Optional Fields
```
timeframe  — defaults to M15 if absent
quote_time — canonical timestamp (alias: timestamp)
source     — expected "MT5"
freshness  — LIVE|DELAYED|STALE|CLOSED|DISCONNECTED
session    — Sydney|Tokyo|London|New York|Overlap|Closed
candle     — M1 OHLCV object (or candles[0] from candles array)
candle_m15 — M15 OHLCV object
```

---

## Parity Verification

| Surface | Status | Notes |
|---------|--------|-------|
| MT5 EA MQL5 → PHP plugin field names | PASS | `quote_time`, `bid`, `ask`, `spread`, `candle`, `candle_m15`, `freshness`, `session` all accepted |
| PHP timestamp normalization | PASS | `normalize_market_timestamp()` handles ISO, MQL5 dot format, missing TZ suffix |
| FibEngine.mqh ratios | PASS | 16-ratio set matches PHP `$ratios` exactly: -200,-162.5,...,300 |
| Session anchor calculation | PASS | PHP `resolve_session_anchors()` test suite passes |
| HTF authority anchor | PASS | PHP `resolve_htf_authority_anchor()` test suite passes |
| NAS100/US30 freshness (equity session) | PASS | `is_equity_index_off_session()` DST-aware, `is_us_equity_session_open()` in market-data-service — both correct |
| XAUUSD symbol normalization | PASS | `GOLD → XAUUSD` in both `map_symbol_aliases()` (PHP) and `SymbolNormalizer.mqh` (MQL5) |
| Backend → dashboard age_sec | PASS | `age_sec` derived from `updated_at` (sourced from `quote_time`), not from fetch time |
| Dashboard freshness state | PASS | `FreshnessBadge` uses backend `state` prop only |
| Signal gating | PASS | Engine rejects non-mt5, non-live, and age > `staleThresholdSec` |

---

## Migration Status Update

**Current Phase**: Phase 4 — Fib Engine Migration  
**Code Status**: Complete (merged 2026-05-25, PR #239)  
**Gate Status**: PENDING — operator actions required

### Blockers Addressed This Run
- (None — zero code blockers exist)

### Remaining Blockers (All Operator Actions)
1. **MIGRATION-001** — Live MT5 corpus not yet captured. Deploy Phase-4-Implementation to live MT5, wait ~30 days for `FibEngine` to accumulate corpus, then run parity validator.
2. **MIGRATION-002** — T0 admin soak workspace baseline not yet created. Open `/admin` → Soak Workspace → create `PHASE_4_IMPLEMENTATION_START` checkpoint.
3. **MIGRATION-003** — Pine reference snapshots not yet exported. Export fib levels for EURUSD, USDJPY, XAUUSD from TradingView at a known UTC timestamp → save as `pine-levels.json`.

---

## Regression Checklist

- [x] `php -l smc-superfib-sniper.php` — PASS
- [x] `php -l class-market-data-service.php` — PASS
- [x] `npm run check:mql` — PASS (MQL include verification passed)
- [x] `test-ea-market-stream.php` — PASS (14/14 tests)
- [x] `test-fib-parity.php` — PASS
- [x] `test-session-anchors.php` — PASS
- [x] `test-htf-authority-anchor.php` — PASS
- [x] `test-mt5-snapshot-contract.php` — PASS
- [x] `test-watchlist-snapshot-regression.php` — PASS
- [x] `test-market-data-service-source-filter.php` — PASS
- [x] `test-superfib-weighting.php` — PASS
- [x] `test-cors-regression.php` — PASS
- [x] `test-pip-value-parity.php` — PASS
- [x] `test-settings-risk-fallbacks.php` — PASS
- [x] `test-fib-ingestion.php` — PASS (7/7 tests)
- [x] `phase3_mt5_simulation_test.php` — PASS
- [ ] `npm run lint` — SKIPPED (env limitation: @eslint/js not installed)
- [ ] `npm run build` — SKIPPED (env limitation: vite not installed)
- [x] `authority-diagnostics` returns 401 unauthenticated — CONFIRMED (permission_user)
- [x] EA route rejects missing X-EA-API-Key — CONFIRMED (HTTP 401)
- [x] EA route rejects invalid X-EA-API-Key — CONFIRMED (HTTP 403)
- [x] EA route rejects missing user_id — CONFIRMED (HTTP 400)
- [x] EA route rejects stale quote_time — CONFIRMED (HTTP 422)
- [x] Signal engine does not run on stale data — CONFIRMED
- [x] Dashboard does not fake live state — CONFIRMED
- [x] Backend remains source of truth — CONFIRMED

---

## Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Phase 4 live parity not yet validated | MEDIUM | Operator must capture 30-day live corpus; parity validator script ready at scripts/parity-validator.php |
| npm lint/build not runnable in remote env | LOW | TypeScript correctness enforced by source; confirmed passing in prior local runs |
| NAS100/US30 live session boundary | LOW | Code is correct; Monday open verification always required after deployment |

---

## Safe Deployment Order

1. Plugin (`smc-superfib-sniper.php`, `class-market-data-service.php`) — deploy to WordPress
2. MT5 EA (`SMC_MarketDataEA.mq5` + all `.mqh` files) — deploy to MT5 terminal, set `ApiKey` = `SMC_SF_EA_API_KEY`
3. Dashboard (React/TanStack SPA) — deploy to Cloudflare Workers/Pages
4. Verify: `POST /ea/market-stream` with valid payload → `ok: true`
5. Verify: `GET /admin/health` with admin session → engine health JSON
6. Verify: `authority-diagnostics` without session → HTTP 401

---

## Rollback Procedure

```bash
# Emergency rollback to initial state
git reset --hard 6b4c544d69188e6f7602933165b220d1c5a69864

# Or use tag
git reset --hard snapshot/stabilize-ea-2026-05-26-start-20260526T000000Z

# Full rollback to main
git checkout main && git reset --hard origin/main
```

---

## EA Testing Commands

### Missing token test (expect HTTP 401)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Invalid token test (expect HTTP 403)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

### Missing user_id test (expect HTTP 400)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
```

### Valid full payload test (expect HTTP 200, ok: true)
```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-26T00:00:10Z",
    "quote_time": "2026-05-26T00:00:09Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "freshness": "LIVE",
    "session": "London",
    "candles": [
      {
        "time": "2026-05-26T00:00:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
```
