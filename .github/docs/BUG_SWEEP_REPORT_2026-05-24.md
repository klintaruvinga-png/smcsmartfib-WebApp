# Bug Sweep Report — 2026-05-24

**Workflow ID**: stabilize-ea-2026-05-24  
**Branch**: claude/nice-fermat-DXM43  
**Date**: 2026-05-24  
**Phase**: Phase 3 — MT5 Market Data Engine (72h soak in progress)  
**Performed by**: Claude Code (automated stabilization workflow)

---

## Executive Summary

| Item | Status |
|------|--------|
| Overall System Health | STABLE |
| Bugs Found | 1 (LOW) |
| Bugs Fixed | 1 |
| Critical Issues | 0 |
| High Issues | 0 |
| Medium Issues | 0 |
| Low Issues | 1 → FIXED |
| Migration Phase | Phase 3 in progress (72h soak open) |
| Phase 0 Status | COMPLETE — gate passed 2026-05-15 |
| Phase 1 Status | COMPLETE — gate passed 2026-05-20 |
| Phase 2 Status | COMPLETE — gate passed 2026-05-22 |
| Phase 3 Status | IN-PROGRESS — 72h soak window open since 2026-05-22 |
| EA Market Stream Route | CONFIRMED OPERATIONAL |
| Backend Signal Authority | PRESERVED |
| Dashboard Freshness Truth | BACKEND-AUTHORITATIVE |
| Snapshot Archive | reports/snapshots/stabilize-ea-2026-05-24/ |
| Rollback Command | `git reset --hard 505ddaed9ea125b1aad2df1e7f2c021006145845` |

---

## Confirmed Problems

### BUG-001 (LOW) — Lint Error in pipeline-watcher.js

| Field | Value |
|-------|-------|
| Severity | LOW |
| System | Build / Lint |
| File | scripts/pipeline-watcher.js |
| Line | 1542 |
| Root Cause | Missing trailing comma after a log message string in the RESEARCHING branch of the research-artifact staleness check. Prettier enforces trailing commas in all multi-line call arguments. |
| Impact | CI lint gate fails with 1 error. No functional runtime impact. |

**Before:**
```js
"RESEARCHING - research artifact predates current cycle start, waiting for fresh research write"
```

**After:**
```js
"RESEARCHING - research artifact predates current cycle start, waiting for fresh research write",
```

---

## Surgical Fixes Applied

### PATCH-001 — Trailing comma in pipeline-watcher.js:1542

- **File changed**: `scripts/pipeline-watcher.js`
- **Logic hardened**: Prettier compliance restored; CI lint gate now passes with 0 errors
- **Regression protection**: ESLint/Prettier CI gate enforces this going forward
- **Rollback before**: `rollback/stabilize-ea-2026-05-24-before-patches` → commit `505ddaed`
- **Rollback after**: `rollback/stabilize-ea-2026-05-24-after-patch-1` → commit `6b113d0b`

---

## EA Integration Status

| Field | Value |
|-------|-------|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth Model | X-EA-API-Key shared secret |
| Required Header | `X-EA-API-Key` (aliases: `x_ea_api_key`, `X-API-KEY`, `x_api_key`) |
| Secret Source | PHP constant `SMC_SF_EA_API_KEY` with `getenv()` fallback |
| Hash Comparison | `hash_equals()` — timing-safe |
| user_id Required | YES — validated at permission callback level |
| Missing token | 401 `smc_sf_api_key_missing` |
| Unconfigured secret | 503 `smc_sf_api_key_unconfigured` |
| Invalid token | 403 `smc_sf_api_key_invalid` |
| Missing user_id | 400 `smc_sf_user_required` |
| Invalid user_id | 403 `smc_sf_user_invalid` |
| Stale quote_time (>300s) | 422 `stale_data` |
| Unparseable timestamp | 422 `stale_data` |
| Drift warning (120–300s) | error_log warning, snapshot still written |
| Invalid OHLC | Candle silently dropped; snapshot preserved |
| INF bid/ask | Snapshot silently dropped (is_finite() guard) |
| Negative tick_volume | Clamped to 0 |
| Non-numeric tick_volume | Clamped to 0 |
| candles[] array | Promoted to candle object (candles[0]); tick_volume → volume mapped |
| quote_time alias | Accepted; takes precedence over timestamp |

### Valid EA Payload Contract

```json
{
  "user_id": 1,
  "symbol": "EURUSD",
  "timeframe": "M1",
  "source": "MT5",
  "server_time": "2026-05-24T12:32:10Z",
  "quote_time": "2026-05-24T12:32:09Z",
  "bid": 1.08521,
  "ask": 1.08534,
  "spread": 1.3,
  "candles": [
    {
      "time": "2026-05-24T12:31:00Z",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "tick_volume": 123
    }
  ]
}
```

---

## Parity Verification

| Suite | Result |
|-------|--------|
| test-ea-market-stream.php | 14/14 PASS |
| test-fib-parity.php | PASS |
| test-session-anchors.php | PASS |
| test-htf-authority-anchor.php | PASS |
| test-mt5-snapshot-contract.php | PASS |
| test-watchlist-snapshot-regression.php | PASS |
| test-market-data-service-source-filter.php | PASS |
| test-superfib-weighting.php | PASS |
| test-cors-regression.php | PASS |
| npm run build | PASS |
| npm run check:mql | PASS (MQL include verification passed) |
| npm run lint | PASS (0 errors, 9 pre-existing advisory warnings) |
| php -l smc-superfib-sniper.php | PASS |
| php -l class-market-data-service.php | PASS |

### Pine / MT5 / Backend Parity

| Layer | Status |
|-------|--------|
| Pine ↔ Backend Signal | PASS on all audited paths |
| Backend → Dashboard | PASS — FreshnessBadge and VerdictBadge render backend truth only |
| MT5 timestamp authority | PASS — broker timestamps preserved in snapshots |
| Fib anchor parity | PASS — composite anchor logic consistent across EURUSD, USDJPY, XAUUSD |
| Freshness authority | PASS — engine snapshot cache invalidates on live-quote age; stale snapshots blocked |
| Symbol normalization | PASS — SymbolNormalizer.mqh + map_symbol_aliases() in PHP handle GOLD→XAUUSD, WALLSTREET→US30, etc. |

### Known Acceptable Parity Gaps

| Gap | Status |
|-----|--------|
| AUDUSD/ETHUSD chop-gate | Classified as correct engine behavior — not a blocker |
| Regime/signal replay suites | Coverage gap noted in 2026-05-23 parity audit — no regression evidence |

---

## Migration Status Update

**Current phase**: Phase 3 — MT5 Market Data Engine  
**Progress**: 90% (soak window open)

| Phase | Status |
|-------|--------|
| Phase 0 | COMPLETE (2026-05-15) |
| Phase 1 | COMPLETE (2026-05-20) |
| Phase 2 | COMPLETE (2026-05-22) |
| Phase 3 | IN-PROGRESS — 72h soak (opened 2026-05-22) |
| Phase 4+ | NOT-STARTED |

### Blockers Addressed This Workflow

- BUG-001 (lint error) — FIXED

### Remaining Blockers

- **MIGRATION-P3-001**: 72h stability soak window must complete (opened 2026-05-22) before Phase 3 gate closes
- **MIGRATION-P3-002**: NAS100/US30 EA Properties config item — trader-side action only, no code change required

---

## Regression Checklist

- [x] PHP syntax passes — smc-superfib-sniper.php
- [x] PHP syntax passes — class-market-data-service.php
- [x] npm run lint — 0 errors (was 1; now fixed)
- [x] npm run build — success
- [x] npm run check:mql — pass
- [x] EA endpoint rejects missing X-EA-API-Key (401)
- [x] EA endpoint rejects invalid X-EA-API-Key (403)
- [x] EA endpoint rejects missing user_id (400)
- [x] EA endpoint rejects malformed payload / missing symbol (400)
- [x] EA endpoint rejects stale quote_time >300s (422)
- [x] EA endpoint accepts valid fresh payload (200)
- [x] Dashboard does not mark stale data as live (FreshnessBadge reads backend state)
- [x] Signal engine does not run on stale data (stale-cache gate validated)
- [x] authority-diagnostics returns 401 for unauthenticated (confirmed — permission_user required)
- [x] Admin routes require manage_options (confirmed — permission_admin callback)
- [x] Watchlist persistence 100% parity (test-watchlist-snapshot-regression.php PASS)
- [x] Fib parity confirmed (test-fib-parity.php PASS)
- [x] Symbol normalization covers GOLD, WALLSTREET, USTECH100 (map_symbol_aliases() confirmed)

---

## Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Phase 3 72h soak incomplete | MEDIUM | Soak window open; monitor for frozen feeds and weekend behavior |
| NAS100/US30 not in EA Symbols config | LOW | Non-code item; trader must add to EA Properties → Inputs → Symbols |
| Regime/signal replay parity suites missing | LOW | Suites exercise sampled paths; no regression evidence; add dedicated replay suites in Phase 4 prep |
| Multi-candle batch ingestion unimplemented | LOW | Only candles[0] stored; Phase 3 scope item; diagnostic log entry added |

---

## Safe Deployment Order

1. Push branch `claude/nice-fermat-DXM43` to origin (contains only the lint fix commit)
2. Merge to main after PR review
3. No WordPress plugin deployment required — PHP files unchanged
4. No EA update required — MQL5 files unchanged
5. No dashboard deployment required — frontend source unchanged

---

## Rollback Procedure

To restore any prior state:

```bash
# Restore to initial state (before any patches)
git reset --hard 505ddaed9ea125b1aad2df1e7f2c021006145845

# Restore to post-patch state (lint fix only)
git reset --hard 6b113d0b692acfcd316910f535aa4906118d8a94

# Emergency rollback to main
git checkout main && git reset --hard origin/main
```

---

## EA Testing Commands

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
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-24T12:32:10Z",
    "quote_time": "2026-05-24T12:32:09Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-24T12:31:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
```
