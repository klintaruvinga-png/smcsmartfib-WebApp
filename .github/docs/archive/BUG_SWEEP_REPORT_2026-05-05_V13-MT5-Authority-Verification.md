# SMC SuperFIB - v13.0.0 MT5 Authority Patch Verification

**Date:** 2026-05-05  
**Phase:** 0 - Stabilization / MT5 authority hardening  
**Scope:** Backend MT5 authority, feed cooldown state, backend sync health, day-change display, Pine/version update cycle  
**Status:** Verified; no immediate blocker remains

---

## Executive Summary

The v13.0.0 patch set was verified against the current backend execution path. All five targeted fixes landed correctly and preserve the existing fallback chain for non-MT5 or stale symbols.

The report's residual items are valid, but they are maintenance concerns rather than blockers:

- `engine_runs` heartbeat rows will grow faster than before and need scheduled pruning.
- Non-EA watchlist symbols can still show `rate-limited` while Twelve Data is genuinely rate-limited; this is correct because those symbols do not have MT5 authority.
- `change_pct_1d` remains `0` until the first MT5 M1 candle of the UTC day exists; this is expected cold-start behavior.

---

## Completed Actions

| Patch | Area | Verified Result |
|---|---|---|
| A | `refresh_prices()` | MT5-live symbols return cached MT5 prices before any Twelve Data call. |
| B | `upsert_mt5_snapshot()` | `change_pct_1d` is derived by `mt5_change_pct_1d()` from the first MT5 M1 candle of the UTC day. |
| C | EA market stream ingest | Successful MT5 snapshot writes clear per-symbol TD quote-TTL and rate-limit transients. |
| D | EA market stream ingest | Successful MT5 snapshot writes insert an `engine_runs` heartbeat row for `backendSync`. |
| E | `fetch_quote()` | Direct callers, including `reference_mid()`, return cached MT5 data before TD key/rate-limit/network logic. |

Additional completed version-cycle actions:

- Root Pine indicator promoted as `SMC_SuperFib_v13.0.0.pine`.
- Pine build label updated to `v13.0.0 - MT5 Authority Patch`.
- Frontend version label centralized in `src/lib/version.ts`.
- `package.json`, `package-lock.json`, `bun.lock`, WordPress plugin header, and WordPress backend README now identify v13.0.0.

---

## Regression Evaluation

### Confirmed Safe

- `refresh_prices()` still falls through to `fetch_quote()` -> `get_cached_price()` -> zero-price fallback when MT5 authority is false.
- `reference_mid()` now receives live MT5 mid prices for MT5-tracked cross-rate symbols without forcing a TD call.
- `mt5_change_pct_1d()` guards zero or missing day-open data and returns `0`, preserving the old cold-start output without writing null/NaN values.
- Deleting `smc_sf_qt_*` on MT5 push is scoped to the same symbol key used by `fetch_quote()` and is safe because MT5 has just written fresh data.
- Existing gate reason text for non-MT5 TD 429 states remains semantically correct.

### Residual Non-Blockers

| ID | Risk | Status | Action |
|---|---|---|---|
| R1 | `engine_runs` heartbeat rows can accumulate quickly during multi-symbol EA pushes. | Deferred maintenance | Add WP-Cron pruning for old heartbeat/engine rows after the live soak proves desired retention. |
| R2 | Non-EA watchlist symbols do not get rate-limit transients cleared by EA pushes. | Accepted behavior | No code change. Non-EA symbols still depend on Twelve Data, so a live TD 429 should surface as `rate-limited`. |
| R3 | `/health` can remain `rate-limited` when any non-EA watchlist symbol is actively TD-rate-limited. | Accepted behavior | No code change. Resolves after the 60s TTL only if TD calls stop or recover. |
| R4 | MT5 day-change is `0` until the first UTC-day M1 candle is written. | Expected cold start | No code change. First live M1 candle supplies the day-open baseline. |
| R5 | `reference_mid()` uses cached MT5 data for tracked pairs. | Intended | No code change. MT5 is the authority for tracked pairs. |

---

## Immediate Action Decision

No additional backend patch is required from this verification report.

The tempting broad fix, calling `clear_feed_rate_limit_state()` from every EA push, is intentionally not applied because it would erase real TD cooldown state for non-EA watchlist symbols. That would make `/health` look cleaner while hiding a valid upstream condition for symbols still dependent on Twelve Data.

---

## Acceptance Criteria

- [x] MT5-live symbols do not call Twelve Data from price refresh.
- [x] Direct quote lookup is MT5-safe before TD key and rate-limit checks.
- [x] EA push clears stale TD state for the same MT5-live symbol.
- [x] EA push writes backend sync heartbeat rows.
- [x] MT5 snapshots can carry non-zero day-change once a UTC-day M1 open exists.
- [x] v13.0.0 version labels are centralized for active runtime surfaces.
- [x] Deferred maintenance is documented rather than mixed into the production hot patch.

---

## Regression Checks Recorded

Previously run and passing for this patch set:

- `php -l wordpress\smc-superfib-sniper\smc-superfib-sniper.php`
- `php wordpress\smc-superfib-sniper\tests\php\test-ea-market-stream.php`
- `php wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php`
- `php wordpress\smc-superfib-sniper\tests\php\test-cors-regression.php`
- `php wordpress\smc-superfib-sniper\tests\php\test-pip-value-parity.php`
- `npm run check:mql`
- `npm run build`
- `npm run lint` passes with existing Fast Refresh warnings only.

---

## Deferred Maintenance Backlog

1. Add an `engine_runs` pruning task.
   - Target: delete heartbeat/engine rows older than the chosen retention window.
   - Candidate retention: 24 hours for heartbeat rows, longer only if needed for diagnostics.
   - Constraint: implement after live soak defines the operational retention need.

2. Add a focused candle-history regression pass.
   - Target: `fetch_candles()` / MT5 M1 -> 15min aggregation coverage.
   - Purpose: verify the remaining `insufficient candle history` symptom resolves through the MT5 aggregation path without weakening the 30-candle gate.

3. Keep non-EA watchlist rate-limit behavior unchanged.
   - Rationale: non-EA symbols remain Twelve Data dependent.
   - Do not globally clear user-level or whole-watchlist TD cooldown state from EA pushes.

---

## Do Not Touch

- Do not weaken candle minimums in `build_symbol_state()`.
- Do not weaken `is_mt5_authoritative()`.
- Do not globally clear TD rate-limit transients from EA pushes.
- Do not change chop/gate/signal computation as part of this verification.
