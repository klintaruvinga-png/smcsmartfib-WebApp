# Bug Sweep Report — Phase 0 (MT5-Native Soak)

**Report Date**: 2026-05-08
**Phase**: Phase 0 — MT5-Native Authority / Soak Stabilization
**Scanner**: Claude Code automated sweep (7-stage pipeline)
**Scan Duration**: Full-stack scan — PHP backend, MT5 EA, React dashboard, test suite

---

## Summary

- **Total Issues Found**: 4
- **Critical Issues**: 1 ⛔ (PATCH 1 — PHP 7 fatal in EA ingestion path)
- **High Priority Issues**: 1 ⚠️ (PATCH 2 — unbounded DB query)
- **Medium Priority Issues**: 2 ⚠️ (PATCH 3 — CORS guard, PATCH 4 — session parity doc)
- **Low Priority Issues**: 0
- **Regression Tests Added**: 8 new assertions in `test-mt5-snapshot-contract.php`

---

## Critical Issues (Blocks Phase Transition)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| `str_ends_with()` PHP 7 fatal | `smc-superfib-sniper.php` `normalize_market_timestamp()` | `str_ends_with()` is PHP 8.0+ only. It was used in the timestamp TZ-detection condition alongside a regex that already covered the Z-suffix case, making it entirely redundant. On PHP 7.x hosts this is a fatal `Call to undefined function` error, silently blocking ALL MT5 EA data ingestion at the point the EA first posts to `/ea/market-stream`. | Complete MT5 data pipeline failure on PHP 7.x. No ticks, no candles, no freshness updates reach the DB. Engine degrades to DISCONNECTED. | ✓ Yes (fatal on PHP 7.x) | Removed redundant `&& !str_ends_with($value, 'Z')` — the regex `[Z+\-]\d{0,2}:?\d{0,2}$` already handles the Z suffix (character class matches Z; `\d{0,2}` allows zero digits). Added REGRESSION GUARD comment. |

---

## High Priority Issues (Slows Progress)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| Unbounded `fetch_candles()` DB query | `smc-superfib-sniper.php` `fetch_candles()` | The `SELECT ... FROM smc_sf_candles WHERE ...` query had no LIMIT clause. The candles table accumulates ~1440 M1 rows per symbol per day; after one month of MT5 soak a 30-symbol watchlist would hold ~1.3M rows, causing the query to load all history on every engine run. | Memory exhaustion and request timeout degradation as the candles table grows during Phase 0 soak. Safe at launch; becomes a production blocker within weeks. | No (deferred timeout risk) | Added `$fetch_limit = max(200, (int) $outputsize * 2)` and `LIMIT %d` to the prepared statement. Added REGRESSION GUARD comment. |

---

## Medium Priority Issues

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| CORS validation guard silently disabled | `smc-superfib-sniper.php` plugin init | `validate_cors_origins_consistency()` call was commented out, disabling a boot-time regression guard designed to catch duplicate-origin or protocol-prefix misconfigurations. | Misconfigured CORS (e.g. `http://` vs `https://` duplicate) would go undetected until a browser CORS failure appeared in production. | No | Restored as non-fatal `error_log` warning. Does not affect runtime behaviour; fires only when misconfiguration exists. |
| Session killzone vs full-session parity gap undocumented | `smc-superfib-sniper.php` `get_session()` | PHP `get_session()` returns SMC killzone windows (London 07-11, NY 12-16) while MT5 `SessionManager.mqh` uses full session hours (London 07-15, NY 12-20). The gap was not flagged in code or migration docs, creating confusion risk for future maintainers. | Display-only divergence. No effect on engine decisions or freshness authority. Risk: future developer patches one side to match the other, breaking intentional design. | No | Added PARITY NOTE comment in `get_session()` body explaining the intentional design, referencing the MT5 `SessionManager.mqh` line numbers, and confirming no engine/freshness impact. Tracked as accepted display-only drift in the parity audit. |

---

## Parity Drift Alerts

| Engine | Previous % | Current % | Trend | Status | Action |
|--------|-----------|----------|-------|--------|--------|
| MT5 data ingestion (Phase 0) | 100% (PHP 8 only) | 100% (PHP 7+8) | ↑ | PASS | PHP 7 compat fix applied |
| Candle fetch output | 100% | 100% | ↔ | PASS | LIMIT added, slice unchanged |
| Session display (killzone vs full) | Known drift | Known drift | ↔ | ACCEPTED | Documented as display-only |

---

## Test Coverage

| Test | Phase | Status | Assertion |
|------|-------|--------|-----------|
| `normalize_market_timestamp` ISO+Z | 0 | ✓ PASS | Returns `2026-05-08 10:30:00` without double-Z |
| `normalize_market_timestamp` ISO+offset | 0 | ✓ PASS | Returns correct UTC from `+00:00` offset |
| `normalize_market_timestamp` bare ISO | 0 | ✓ PASS | Appends Z and returns UTC |
| `normalize_market_timestamp` MQL5 dot-format | 0 | ✓ PASS | Converts dots and returns UTC |
| `normalize_market_timestamp` null input | 0 | ✓ PASS | Returns null fallback |
| `normalize_market_timestamp` empty string | 0 | ✓ PASS | Returns null fallback |
| `fetch_candles` 450 rows → outputsize=30 | 0 | ✓ PASS | Returns ≤ 30 candles |
| `fetch_candles` 450 rows → outputsize=5 | 0 | ✓ PASS | Returns ≤ 5 candles |

---

## Blocker Assessment

**Blocks Current Phase**: PATCH 1 was a production-fatal on PHP 7.x (now resolved)
**Blocks Phase N+1 Transition**: No (all issues resolved)
**Timeline Impact**: +0 days (all patches applied in-session)
**Risk Level**: CRITICAL patch resolved; remaining patches MEDIUM/LOW

---

## Recommended Priority Order

1. [CRITICAL — RESOLVED] PHP 7 `str_ends_with` removal — `normalize_market_timestamp()`
2. [HIGH — RESOLVED] Unbounded `fetch_candles()` LIMIT — `fetch_candles()`
3. [MEDIUM — RESOLVED] CORS guard restoration — plugin init
4. [MEDIUM — RESOLVED] Session parity documentation — `get_session()`

---

## Verification Criteria

- [x] PATCH 1: `str_ends_with` removed; `normalize_market_timestamp` regex-only path verified
- [x] PATCH 2: `LIMIT %d` added to `fetch_candles` prepared statement; `$fetch_limit` variable set
- [x] PATCH 3: `validate_cors_origins_consistency()` restored as `error_log` guard
- [x] PATCH 4: PARITY NOTE comment added to `get_session()`
- [x] Regression tests added — 8 new assertions, all passing
- [x] Existing test suite passes without regression (`mt5 snapshot contract checks passed`)
- [x] `fetch_candles` LIMIT does not break `TestWpdb::get_results` regex (no end anchor)

---

## Surgical Fixes Applied

| File | Lines Changed | Change |
|------|--------------|--------|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | ~3444 | PATCH 1: removed `&& !str_ends_with($value, 'Z')` from `normalize_market_timestamp()` |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | ~2423-2429 | PATCH 2: added `$fetch_limit = max(200, ...)` and `LIMIT %d` to `fetch_candles()` query |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | ~52 | PATCH 3: restored `validate_cors_origins_consistency()` as non-fatal `error_log` |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | ~508 | PATCH 4: added PARITY NOTE comment to `get_session()` |
| `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | +46 lines | 8 new regression assertions for PATCH 1 and PATCH 2 |

## Systems Not Touched (Do Not Touch List)

- `mt5/MarketDataEngine.mqh` — EA webhook logic untouched
- `mt5/FreshnessEngine.mqh` — capacity guard from prior sweep untouched
- `mt5/TickProcessor.mqh` — ring buffer untouched
- `mt5/SessionManager.mqh` — full-session logic intentionally differs from PHP killzones
- `src/routes/live.tsx` — patched in prior session (2026-05-07), not re-touched
- `src/types/sniper.ts` — clean, not touched
- `class-market-data-service.php` — standalone MT5 data service, not touched
- All frontend hooks, components, and route files — not touched

---

## Attachments

- Regression test output: `mt5 snapshot contract checks passed` (all assertions green)
- Prior sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-07.md`
