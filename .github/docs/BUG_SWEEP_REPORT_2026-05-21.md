# Executive Summary

- Overall health: Stable after one targeted timestamp-truth hardening patch in the MT5 market-data service.
- Bugs found: 1 confirmed high-severity freshness defect, 0 critical, 0 additional confirmed regressions in the executed suites.
- Fixes applied: Hardened `SMC_MarketData_Service::normalize_market_timestamp()` so UTC-suffixed broker timestamps no longer fall back to receipt time.
- Remaining risks: Regime and signal parity were not directly re-executed in this run; current confidence there is indirect only.
- Migration readiness: Phase 2 market-data ingestion remains ready, with improved timestamp parity across the REST ingestion and market-data service paths.

# Scan Metadata

- Report Date: 2026-05-21
- Phase: Phase 2 MT5-native migration stabilization
- Scanner: Codex automation `code-bug-fix-and-cleanup`
- Scan Duration: 2026-05-21 06:31 to 2026-05-21 06:38 Africa/Johannesburg
- Targeted Coverage: 7 executed suites covering MT5 snapshot contract, EA market-stream ingress, market-data service normalization, frontend polling cadence, fib parity, session anchors, and HTF authority anchors

# Confirmed Problems

| Severity | Category | Component | Root Cause | Impact | Blocker |
| --- | --- | --- | --- | --- | --- |
| HIGH | Freshness / data-contract parity | `wordpress/smc-superfib-sniper/class-market-data-service.php` | The service-level timestamp normalizer stripped dot-form dates but did not handle trailing timezone abbreviations such as `UTC`. Inputs like `2026-05-16 08:15:30 UTC` became `UTCZ`, failed `strtotime()`, and fell back to server receipt time. | Can falsely mark stale MT5 ticks/candles as fresh on any code path using `store_tick_snapshot()` or `store_candle_m1()`. This is a source-of-truth defect because freshness becomes browser/server-clock derived instead of broker-clock derived. | No |

# Root Cause / Analysis

- The main REST handler already had hardened timezone-abbreviation handling.
- `SMC_MarketData_Service` still carried an older parser implementation, so the system had two different timestamp truth rules.
- That divergence created migration-phase parity drift: the same broker timestamp could be preserved on `/ea/market-stream` but silently rewritten when stored through the service helper path.
- I verified the failure path directly with reflection before patching: `normalize_market_timestamp('2026-05-16 08:15:30 UTC', 'fallback')` returned `fallback`.

# Surgical Fixes Applied

| File | Change | Regression Protection |
| --- | --- | --- |
| `wordpress/smc-superfib-sniper/class-market-data-service.php` | Stripped trailing timezone abbreviations before UTC pinning so UTC-suffixed MT5 timestamps parse correctly. | Aligns helper behavior with the hardened REST parser and prevents receipt-time fallback for valid broker timestamps. |
| `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` | Added regression cases for `store_tick_snapshot()` and `store_candle_m1()` using ` UTC`-suffixed timestamps. | Fails immediately if helper-level timestamp truth drifts again. |

# Exact Files Changed

- `wordpress/smc-superfib-sniper/class-market-data-service.php`
- `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-21.md`
- `.github/migration/audits/phase-2-market-data-parity-2026-05-21.md`

# Parity Verification Results

| Domain | Result | Evidence | Notes |
| --- | --- | --- | --- |
| Freshness parity | PASS | `test-market-data-service-source-filter.php`, `test-mt5-snapshot-contract.php`, `test-ea-market-stream.php` | MT5 quote/candle timestamps now preserve broker time for ISO, dot-format, and `UTC`-suffixed inputs. |
| Fib parity | PASS | `test-fib-parity.php`, `test-session-anchors.php`, `test-htf-authority-anchor.php`, `test-mt5-snapshot-contract.php` | No fib-anchor drift observed in this run. |
| Regime parity | PENDING | No dedicated regime suite executed in this run | No regime code changed. Confidence is unchanged, not newly proven. |
| Signal parity | PENDING | Indirectly exercised via health/snapshot contract only | No direct live-signal generation suite executed in this run. |

# Acceptance Criteria

- Valid MT5 timestamps with trailing `UTC` are stored as broker time, not receipt time.
- `store_tick_snapshot()` preserves authoritative tick timestamps across ISO, dot-format, and timezone-abbreviation variants.
- `store_candle_m1()` preserves authoritative candle timestamps across ISO, dot-format, and timezone-abbreviation variants.
- Existing MT5 snapshot and EA ingress contract tests remain green.

# Regression Checklist

- [x] Market-data service source filter regression suite passes.
- [x] MT5 snapshot contract regression suite passes.
- [x] EA market-stream regression suite passes.
- [x] Fib parity suite passes.
- [x] Session anchor parity suite passes.
- [x] HTF authority anchor parity suite passes.
- [x] Frontend polling/watchlist cadence vitest bundle passes.

# Regression Checks Executed

1. `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
2. `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
3. `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
4. `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
5. `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
6. `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
7. `npx vitest run src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx src/routes/-live.test.ts src/lib/api/sniperClient.test.ts`

# Remaining Risks

- Dedicated regime-engine parity coverage is still missing from the current test inventory.
- Dedicated signal-generation parity coverage is still missing from the current test inventory.
- The legacy authenticated `/snapshot` ingest route still uses a narrower payload contract than `/ea/market-stream`; that path was not changed in this run because it was not needed to fix the confirmed defect.

# Safe Deployment Order

1. Deploy the backend plugin patch containing the service timestamp normalizer.
2. Run the PHP regression suites in the target environment.
3. Reconfirm live MT5 snapshots in `/health` and `/market-data-authority`.
4. Resume normal migration soak monitoring.

# Do Not Touch List

- Pine trade formulas without a parity-specific defect reproduction.
- MT5 freshness thresholds (`LIVE` / `DELAYED` / `STALE`) without broker-clock evidence.
- Backend stale gating that prevents frontend-only live-state fabrication.
