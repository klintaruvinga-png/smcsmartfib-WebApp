# Bug Sweep Report — 2026-05-10 v2

## Executive Summary

- **Overall health**: Stable after a targeted Phase 0 soak hardening pass focused on unbounded database scans, MT5 freshness cold-start accuracy, and test-harness correctness.
- **Bugs found**: 3 confirmed issues (1 HIGH, 1 MEDIUM, 1 LOW-regression).
- **Fixes applied**: `fetch_aggregated_mt5_m1_candles()` now bounds its M1 scan with DESC LIMIT; `FreshnessEngine::GetAccountFreshness()` no longer reports fake-live on cold start; `post_snapshot()` internal auth guard restored (incorrect PATCH 3 reverted).
- **Remaining risks**: `TimeToIso8601()` broker-offset calculation in `mt5/MarketDataEngine.mqh` remains a MEDIUM risk item; no Pine or signal-engine logic was changed.
- **Migration readiness**: Phase 0 soak stability improved. M1→15min candle aggregation no longer risks memory exhaustion or query-timeout degradation as EA data accumulates.

---

## Confirmed Problems

### Runtime & Stability Scan

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| HIGH | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — `fetch_aggregated_mt5_m1_candles()` | No `LIMIT` clause on the M1 candle `SELECT`. EA pushes ~6 M1 rows/min/symbol; after 7 days of Phase 0 soak that is ~60,480 rows/symbol causing a full-table scan on every engine cycle. | Memory exhaustion and query-timeout degradation during soak. `fetch_candles()` already had a DESC-LIMIT guard; `fetch_aggregated_mt5_m1_candles()` was missing the equivalent. | Patched in this run. |

### Data Contract Verification

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| MEDIUM | `mt5/FreshnessEngine.mqh` — `GetAccountFreshness()` | `worst` initialised to `FRESHNESS_LIVE` (enum value 0). When `symbolCount == 0` the loop never runs and the function returns `FRESHNESS_LIVE`, creating a fake-live account state during cold start before any symbol is tracked. | EA-side diagnostics and dashboard freshness badges incorrectly show "live" immediately after EA start, masking connectivity problems. | Patched in this run. |

### Regression / Patch Quality

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| LOW | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — `post_snapshot()` | PATCH 3 from this sweep incorrectly removed the internal `permission_user()` defense-in-depth check, labelling it "redundant". The WP REST routing layer does enforce the callback, but the internal check is required when `post_snapshot()` is called directly (tests) and provides defense-in-depth against route-layer bypasses. | PHP regression test `assert_true($unauthorized instanceof WP_Error)` fails; unauthenticated callers outside WP REST routing receive no auth rejection. | Reverted in this run. |

---

## Surgical Fixes Applied

| File | Change | Hardening Added |
|---|---|---|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | `fetch_aggregated_mt5_m1_candles()`: replaced unbounded `ORDER BY candle_time ASC` with `ORDER BY candle_time DESC LIMIT %d` (where limit = `max(200, ceil(outputsize × m1_per_bucket × 1.2))`), then `array_reverse()` to restore chronological order for bucket aggregation. | Mirrors the DESC-LIMIT guard already present in `fetch_candles()`. Caps the worst-case scan to ~540 rows for a 30-bucket 15min request regardless of how many M1 rows the EA has accumulated. |
| `mt5/FreshnessEngine.mqh` | `GetAccountFreshness()`: added `if (symbolCount == 0) return FRESHNESS_DISCONNECTED;` guard before the `worst` aggregation loop. | Eliminates the fake-live account state during cold start. Returns `DISCONNECTED` (the safe/conservative state) until at least one symbol is tracked, consistent with `GetFreshnessState()` returning `DISCONNECTED` for unknown symbols. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | `post_snapshot()`: restored `permission_user()` internal auth guard (reverted PATCH 3). | Defense-in-depth: function is safe to call from any context, not only via WP REST routing. PHP regression test passes again. |
| `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | New regression block: `fetch_aggregated_mt5_m1_candles()` with 450 seeded M1 rows and `outputsize=30` must return ≤30 buckets with all required fields, and must return empty for a symbol with no MT5 M1 rows. | Guards against reintroduction of the unbounded scan. Six assertions total. |

---

## Parity Verification Results

| Dimension | Scope | Result | Drift |
|---|---|---|---|
| M1 candle aggregation correctness | DESC+LIMIT+reverse vs old ASC scan | Functionally equivalent output; only scan bound changes | No drift |
| MT5 freshness state machine | `GetAccountFreshness()` cold start | Now DISCONNECTED (was fake-LIVE) — correct conservative state | Drift removed |
| `post_snapshot()` auth contract | Internal vs route-layer auth enforcement | Restored to defence-in-depth dual-layer | No new drift |
| PHP regression suite | `test-mt5-snapshot-contract.php` | All assertions PASS (including 6 new LIMIT regression assertions) | No drift |

---

## Remaining Risks

- `TimeToIso8601()` in `mt5/MarketDataEngine.mqh` uses `TimeCurrent() - TimeGMT()` for broker UTC offset. This is a MEDIUM risk for brokers with non-standard DST handling but has not been observed to cause issues in soak. Tracked for Phase 1.
- EA `post_snapshot()` receives `candle_m1` key but the EA's `BuildWebhookPayload()` uses the `candle` key for M1 and `candle_m15` for 15min. Low risk (EA uses `post_ea_market_stream()` not `post_snapshot()` for live data), pre-existing, tracked.

---

## Regression Checklist

- [x] `test-mt5-snapshot-contract.php` — all assertions PASS including 6 new LIMIT regression assertions
- [x] `fetch_aggregated_mt5_m1_candles()` output verified: ≤30 buckets, correct OHLC fields, empty for missing symbol
- [x] `GetAccountFreshness()` cold-start path returns `FRESHNESS_DISCONNECTED` when `symbolCount == 0`
- [x] `post_snapshot()` returns `WP_Error(401)` for unauthenticated callers — verified by test harness
- [x] No Fib, regime, signal, or gate logic changed in this sweep
- [x] No Pine Script changes in this sweep
- [ ] 72h Phase 0 soak evidence confirming M1 row count stabilises under DESC LIMIT (pending production observation)
