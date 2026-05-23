# Executive Summary

- Overall health: improved.
- Bugs found: 1 confirmed HIGH freshness/cache defect.
- Fixes applied: engine snapshot cache now expires when cached live quote timestamps cross the configured stale threshold, even if the snapshot `computedAt` value is still inside the refresh interval.
- Remaining risks: dedicated regime replay and signal replay parity suites are still not part of the focused regression set for this run.
- Migration readiness: PASS for the targeted freshness/cache path; broader signal/regime replay coverage remains an open hardening item.

# Confirmed Problems

## Freshness and stale-state integrity

| Severity | Component | Root cause | Impact | Status |
| --- | --- | --- | --- | --- |
| HIGH | Engine snapshot cache | `is_engine_snapshot_current()` only validated watchlist parity plus `meta.computedAt`, and ignored the age of cached live prices inside the snapshot. With `refreshIntervalSec > staleThresholdSec`, a snapshot could remain cache-valid after MT5 quotes had already gone stale. | False LIVE window on `/snapshot`, `/live-signals`, and `/ladders`; backend-confirmed signals and gates could be served after quote truth had degraded. | Patched |

# Surgical Fixes Applied

- [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/smc-superfib-sniper.php:5289)
  - Passed `staleThresholdSec` into engine snapshot cache validation from `ensure_engine_snapshot()`.
  - Hardened `is_engine_snapshot_current()` so any cached `state=live` price row must still have a valid `updatedAt` timestamp inside the stale threshold, otherwise the snapshot is invalidated and recomputed.
- [`wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php:227)
  - Added regression coverage proving a fresh `computedAt` timestamp can no longer keep a snapshot current once live quote timestamps age past the stale threshold.

# Parity Verification Results

- Fib parity: PASS. `test-fib-parity.php`, `test-session-anchors.php`, and `test-htf-authority-anchor.php` all passed.
- Regime parity: PASS on sampled freshness/guard paths. No dedicated full replay suite was run in this pass.
- Signal parity: PASS on sampled live-signal freshness gating. `test-mt5-snapshot-contract.php` preserved MT5 authority and stale blocker behavior after the cache fix.
- Freshness parity: PASS. `test-watchlist-snapshot-regression.php`, `test-mt5-snapshot-contract.php`, and `test-market-data-service-source-filter.php` all passed.
- Sampled parity suite pass rate this run: 6/6 suites passed (100%).

# Remaining Risks

- No dedicated regime replay parity suite was executed in this run; regime classification drift outside the stale-cache path could still hide elsewhere.
- No dedicated multi-case signal replay suite was executed in this run; live-signal truth is covered here only through the snapshot/stale gating path.
- The cache fix intentionally does not force recomputation for already-stale or closed snapshots; it only removes the false-LIVE window for cached `state=live` rows.

# Regression Checklist

- [x] Refresh cache revalidation blocks stale live quotes from reusing cached engine snapshots.
- [x] Stale detection preserves MT5 timestamp authority.
- [x] Signal readiness/stale blocker contract remains intact for MT5-authoritative symbols.
- [x] Backend sync snapshot/watchlist invalidation still works.
- [x] Fib/session anchor parity still passes targeted suites.

# Safe Deployment Order

1. Deploy the backend plugin patch.
2. Run the focused PHP regression set in production-like staging.
3. Verify `/snapshot`, `/live-signals`, and `/ladders` after leaving MT5 quotes idle beyond `staleThresholdSec`.
4. Promote after confirming stale quotes now force recomputation and blocked/stale engine output.

# Do Not Touch List

- MT5 quote timestamp normalization and snapshot persistence rules.
- `determine_engine_blocker()` stale/rate-limit authority logic.
- Session anchor and HTF authority fib calculations without a separate parity approval pass.
# SMC SuperFIB Bug Sweep Report — 2026-05-23

**Workflow ID**: stabilize-ea-2026-05-23  
**Branch**: claude/nice-fermat-LKa98  
**Plugin Version**: 13.0.3  
**Migration Phase**: Phase 3 (MT5 Market Data Engine) — 72h stability soak in progress  
**Sweep Date**: 2026-05-23

---

## Executive Summary

- **Overall health**: Stable. All critical systems confirmed correct.
- **Bugs found**: 2 (both LOW severity). 0 critical, 0 high, 0 medium.
- **Fixes applied**: 1 (PATCH-001 — Prettier formatting fix on 3 TypeScript files, no logic changes).
- **Remaining risks**: Pre-existing test-phase2-trade-telemetry.php streak assertion failure (outside Phase 3 seam); Phase 3 72h soak in progress.
- **Migration readiness**: Phase 3 code complete. Gate pending 72h soak completion (~2026-05-25).
- **Snapshot archive**: `reports/snapshots/stabilize-ea-2026-05-23/`
- **Rollback command**: `git reset --hard cd3cf5b1ca1947516b3a9cd965fdf83dff256d0c`

---

## Confirmed Problems

### BUG-001 — Prettier Lint Errors (LOW)

| Attribute | Value |
|---|---|
| Severity | LOW |
| Component | TypeScript source — test and route files |
| Files | `src/routes/-admin.test.tsx`, `src/routes/admin.tsx`, `src/types/sniper.ts` |
| Root Cause | Prettier formatting drift from Phase 2/3 development (trailing commas, line-break rules not consistently applied after recent additions) |
| Impact | Lint CI gate fails with 8 fixable errors |
| Blocker | No |
| Status | FIXED in PATCH-001 |

### BUG-002 — test-phase2-trade-telemetry.php streak assertion failure (LOW)

| Attribute | Value |
|---|---|
| Severity | LOW |
| Component | PHP test harness |
| File | `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` |
| Root Cause | Streak calculator asserts `current_streak_days = 1` but the test mock's UTC date boundary handling does not always match the CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN definition when the test runs near UTC midnight. |
| Impact | PHP test suite shows 1 failing test — does not affect production streak logic. |
| Blocker | No |
| Status | PRE-EXISTING (noted in 2026-05-22 parity audit). Deferred to dedicated test-harness fix. |

---

## Surgical Fixes Applied

### PATCH-001 — Prettier Formatting Fix

| Field | Value |
|---|---|
| Files changed | `src/routes/-admin.test.tsx`, `src/routes/admin.tsx`, `src/types/sniper.ts` |
| Logic hardened | None — formatting only |
| Regression protection | Lint gate now enforces 0 errors |
| Rollback point before | `rollback/stabilize-ea-2026-05-23-before-patches` (cd3cf5b1) |
| Rollback point after | `rollback/stabilize-ea-2026-05-23-after-patch-1` (12f281d5) |
| Commit | 12f281d5d7307caf0861872a9b6a175077eebd93 |

---

## EA Integration Status

| Parameter | Value |
|---|---|
| Route | `POST /wp-json/sniper/v1/ea/market-stream` |
| Auth model | Shared-secret API key via `X-EA-API-Key` header |
| Required header | `X-EA-API-Key` (also accepted: `X-API-KEY`, `x_ea_api_key`, `x_api_key`) |
| Secret env | `SMC_SF_EA_API_KEY` (PHP constant or getenv fallback) |
| Comparison | `hash_equals()` — timing-safe |
| `user_id` required | Yes — checked at permission layer |
| Payload validation | Full — stale rejection at 300s, OHLC validation, epoch candle guard |
| Stale data rejection | 422 for `quote_time` older than 300 seconds |
| Auth error responses | 401 (missing), 503 (unconfigured), 403 (invalid), 400 (no user_id), 403 (bad user_id) |
| Status | **CONFIRMED CORRECT** |

### Additional EA Routes (Phase 1)

| Route | Auth | Status |
|---|---|---|
| `POST /sniper/v1/ea/heartbeat` | EA key + user_id | CONFIRMED CORRECT |
| `POST /sniper/v1/ea/account-sync` | EA key + user_id | CONFIRMED CORRECT |
| `POST /sniper/v1/ea/symbol-sync` | EA key + user_id | CONFIRMED CORRECT |
| `GET /sniper/v1/ea/license-check` | EA key + user_id | CONFIRMED CORRECT |

---

## Parity Verification

| Domain | Result | Notes |
|---|---|---|
| EA payload → PHP handler field alignment | PASS | All fields match: symbol, normalized_symbol, timeframe, quote_time, bid, ask, spread, freshness, session, candle, candle_m15, candle_*_aliases |
| Stale-data rejection parity | PASS | Backend rejects >300s; warns 120–300s; candle staleness gated separately at 180s |
| OHLC validation | PASS | high ≥ max(open,close), low ≤ min(open,close) enforced for M1 and M15 |
| Freshness authority | PASS | Backend remains authoritative; frontend useStreamingTicks is visual-only; VerdictBadge gates on backend is_live |
| Signal engine gating | PASS | No stale prices qualify signals; backend truth not moved to frontend |
| Watchlist persistence | PASS | 100% parity — mutations invalidate engine snapshot cache |
| Fib parity | PASS (unchanged) | Last direct fib suite pass 2026-05-22. No fib logic changed. |
| PHP/MQL5 timestamp handling | PASS | Both use UTC; ISO 8601 format on the wire |

---

## Migration Status Update

| Phase | Status | Notes |
|---|---|---|
| Phase 0 | **COMPLETE** (2026-05-15) | All blockers resolved; soak evidence captured |
| Phase 1 | **COMPLETE** (2026-05-20) | 48h bridge continuity confirmed |
| Phase 2 | **COMPLETE** (2026-05-22) | Read-only trade telemetry live; streak LIVE |
| Phase 3 | **IN PROGRESS** (90%) | Code complete; 72h soak window open since 2026-05-22 |
| Phase 4+ | NOT STARTED | Blocked on Phase 3 gate |

### Migration Blockers After This Sweep

1. **MIGRATION-001** (IN_PROGRESS): 72h soak must complete before Phase 3 gate closes. Expected ~2026-05-25.
2. **MIGRATION-002** (CONFIG): NAS100/US30 — add to EA Properties → Inputs → Symbols on MT5 terminal. Non-blocking.

---

## Regression Checklist

| Check | Result |
|---|---|
| `npm run lint` | ✅ 0 errors, 9 warnings (all pre-existing, non-fatal) |
| `npm run build` | ✅ PASS (vite built in 9.70s) |
| `npm run check:mql` | ✅ PASS (MQL include verification passed) |
| `php -l smc-superfib-sniper.php` | ✅ No syntax errors |
| `php -l class-market-data-service.php` | ✅ No syntax errors |
| `test-ea-market-stream.php` (14 tests) | ✅ PASS |
| `test-mt5-snapshot-contract.php` | ✅ PASS |
| `test-ea-heartbeat.php` | ✅ PASS |
| `test-ea-account-sync.php` | ✅ PASS |
| `test-ea-license-check.php` | ✅ PASS |
| `test-ea-symbol-sync.php` | ✅ PASS |
| `test-fib-parity.php` | ✅ PASS |
| `test-cors-regression.php` | ✅ PASS |
| `phase3_mt5_simulation_test.php` | ✅ PASS |
| `test-watchlist-snapshot-regression.php` | ✅ PASS |
| `test-phase2-trade-telemetry.php` | ⚠️ FAIL (pre-existing streak assertion — outside Phase 3 seam) |
| EA endpoint rejects missing `X-EA-API-Key` | ✅ 401 confirmed (test 1) |
| EA endpoint rejects invalid token | ✅ 403 confirmed (test 2) |
| EA endpoint rejects missing `user_id` | ✅ 400 confirmed (test 3) |
| EA endpoint rejects stale `quote_time` | ✅ 422 confirmed (test 14) |
| EA endpoint rejects malformed payload | ✅ 400 confirmed |
| `authority-diagnostics` returns 401 unauthenticated | ✅ Confirmed — uses `permission_user` |
| Admin routes require `manage_options` | ✅ Confirmed — uses `permission_admin` |
| Dashboard does not fake live state | ✅ `useStreamingTicks` is visual-only; `useEngineHealth` has `staleTime:0` |
| Signal engine does not run on stale data | ✅ Freshness gates enforced server-side |

---

## Remaining Risks

1. **Phase 3 72h soak**: Time-based — code is correct; requires live weekend session observation to close.
2. **NAS100/US30 config**: Trader must add these to the MT5 EA Symbols input before index signals are reliable.
3. **BUG-002 test harness**: `test-phase2-trade-telemetry.php` streak failure needs a dedicated test-harness fix (not production code).
4. **Lint warnings (9)**: Pre-existing `react-hooks/exhaustive-deps` and `react-refresh/only-export-components` — considered non-fatal by project convention.

---

## Safe Deployment Order

1. Push current branch (formatting patch only).
2. Deploy WordPress plugin — no changes required; already deployed and confirmed operational.
3. Confirm NAS100/US30 added to EA Properties → Inputs → Symbols (MT5 terminal config).
4. Monitor Phase 3 72h soak evidence — expected gate close ~2026-05-25.
5. Once soak evidence captured, advance to Phase 4 (Fib Engine Migration).

---

## Rollback Procedure

```bash
# Return to exact state at workflow start (before formatting fix)
git reset --hard cd3cf5b1ca1947516b3a9cd965fdf83dff256d0c

# Or return to latest state (after formatting fix)
git reset --hard 12f281d5d7307caf0861872a9b6a175077eebd93

# Emergency — return to main
git checkout main && git reset --hard origin/main
```

---

## Do Not Touch List

- `permission_ea_bridge()` and `permission_ea_market_stream()` auth flow — correct and tested
- Signal-engine readiness gates around MT5 source, freshness, and candle freshness
- Fib calculation logic in Pine, backend, or MT5 — no parity drift detected
- Stale-data timestamp truth rules — backend timestamp authority preserved
- `authority-diagnostics` route — must remain protected (returns 401 unauthenticated by design)
