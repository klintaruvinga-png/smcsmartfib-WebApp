# Executive Summary

- Report Date: 2026-05-21
- Scope: merged same-day stabilization sweeps for the SMC SuperFIB plugin, dashboard, MT5 EA ingress path, market-data service, and migration status
- Phase Status: Phase 1 COMPLETE, Phase 2 IN-PROGRESS at 75%
- Overall Health: stable after same-day audit and patch consolidation
- Critical Issues: 0
- High-Severity Issues: 1 confirmed and patched
- Low-Severity Issues: 1 confirmed and patched
- Informational Observations: 1 surfaced and instrumented

This merged report resolves the same-day report overlap:

1. The earlier broad 14-stage sweep found no critical live-system breakage and applied a low-risk observability patch plus frontend formatting cleanup.
2. The later targeted sweep found one real helper-path freshness defect in MT5 timestamp normalization and patched it with regression coverage.

The authoritative final state for 2026-05-21 is:

- no unresolved critical issues
- no unresolved high-severity issues
- backend authority preserved
- frontend layout/behavior unchanged aside from formatting cleanup
- MT5 timestamp truth hardened across the service helper path

# Scan Metadata

- Scanner: Codex automation `code-bug-fix-and-cleanup`
- Merged Sources: earlier 2026-05-21 broad sweep summary plus later targeted timestamp/freshness sweep
- Final Status: merged and conflict-free

# Confirmed Problems

| Severity | ID | Category | Component | Root Cause | Impact | Status |
| --- | --- | --- | --- | --- | --- | --- |
| HIGH | BUG-002 | Freshness / data-contract parity | `wordpress/smc-superfib-sniper/class-market-data-service.php` | The service-level timestamp normalizer did not strip trailing timezone abbreviations such as `UTC`, so valid broker timestamps could parse-fail and fall back to receipt time. | MT5 ticks/candles stored through `store_tick_snapshot()` or `store_candle_m1()` could appear fresher than they really were. | Patched |
| LOW | BUG-001 | Tooling / repo hygiene | `src/` formatting surface | Pre-existing Prettier drift caused `npm run lint` to fail with style-only errors. | Lint noise and merge friction, but no logic corruption. | Patched |
| INFO | OBS-001 | Observability | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | The `candles[]` compatibility layer in `/ea/market-stream` consumed only index `0` without surfacing that extra entries were ignored. | Callers sending multi-candle arrays got no diagnostic even though full batch ingestion is Phase 3 scope. | Instrumented |

# Root Cause / Analysis

## Earlier Broad Sweep

- Core systems audited as stable: plugin routes, dashboard, MT5 EA path, signal stale gating, auth callbacks, and authority diagnostics.
- No critical runtime breakages or high-severity live-path failures were identified in that broader pass.
- The main actionable items in that pass were one low-severity lint/style defect and one informational observability gap.

## Later Targeted Sweep

- The targeted freshness audit found divergence between the hardened REST ingestion parser and the older helper parser in `SMC_MarketData_Service`.
- That divergence mattered because a valid broker timestamp like `2026-05-16 08:15:30 UTC` produced a parse failure and receipt-time fallback in the helper path.
- This was a real source-of-truth issue, not cosmetic drift, so it supersedes the earlier "zero high-severity bugs" claim for the final merged report.

# Surgical Fixes Applied

| File | Change | Effect |
| --- | --- | --- |
| `wordpress/smc-superfib-sniper/class-market-data-service.php` | Hardened `normalize_market_timestamp()` to strip trailing timezone abbreviations before UTC pinning. | Prevents valid MT5 broker timestamps from falling back to server receipt time. |
| `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` | Added regression cases for UTC-suffixed tick and candle timestamps. | Guards helper-path freshness truth from drifting again. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Earlier same-day patch added `error_log()` plus `audit()` when `candles[]` contains more than one entry. | Makes Phase 3 batch-ingestion gap visible without changing current behavior. |
| `src/routes/progress.tsx` | Earlier same-day Prettier auto-fix. | Restored formatting compliance. |
| `src/routes/analytics.tsx` | Earlier same-day Prettier auto-fix. | Restored formatting compliance. |
| `src/lib/api/sniperClient.ts` | Earlier same-day Prettier auto-fix. | Restored formatting compliance. |
| `src/lib/api/sniperClient.test.ts` | Earlier same-day Prettier auto-fix. | Restored formatting compliance. |

# Exact Code Changes

- Added timezone-abbreviation stripping in [`class-market-data-service.php`](<C:/Users/LEONNA/OneDrive/All Final Softwares/SMC SuperFib Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/class-market-data-service.php:486>).
- Added UTC-suffix regression assertions in [`test-market-data-service-source-filter.php`](<C:/Users/LEONNA/OneDrive/All Final Softwares/SMC SuperFib Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php:198>).
- Merged same-day sweep narratives into this final report at [BUG_SWEEP_REPORT_2026-05-21.md](<C:/Users/LEONNA/OneDrive/All Final Softwares/SMC SuperFib Dashboard/smcsmartfib-WebApp/.github/docs/BUG_SWEEP_REPORT_2026-05-21.md>).

# Parity Verification Results

| Domain | Result | Notes |
| --- | --- | --- |
| MT5 timestamp freshness parity | PASS | ISO, dot-format, and `UTC`-suffix timestamps preserve broker time after patch. |
| Fib parity | PASS | No drift observed in executed fib/session/HTF anchor suites. |
| Backend authority | PASS | Backend remains source of truth for freshness, signal state, and verdicts. |
| Dashboard fidelity | PASS | No UI behavior change from the merged same-day fixes; formatting-only cleanup on frontend files. |
| Regime parity | PENDING | No dedicated regime suite rerun in the targeted timestamp pass. |
| Signal parity | PARTIAL | Indirectly exercised through health/snapshot tests only; no direct signal replay suite in this run. |

# Acceptance Criteria

- Valid MT5 timestamps with trailing `UTC` are stored as broker time, not receipt time.
- Existing MT5 snapshot and EA ingress contract tests remain green.
- Lint/style drift from the earlier same-day sweep is no longer the source of merge noise.
- Extra `candles[]` entries are surfaced diagnostically until Phase 3 implements full batch ingestion.

# Regression Checklist

- [x] `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
- [x] `npx vitest run src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx src/routes/-live.test.ts src/lib/api/sniperClient.test.ts`

# Remaining Risks

- Dedicated regime-engine parity coverage is still missing from the current run set.
- Dedicated signal-engine replay coverage is still missing from the current run set.
- The legacy authenticated `/snapshot` ingest route still has a narrower payload contract than `/ea/market-stream`.
- `ACTIVE_DAY_DEFINITION` still requires business sign-off before enabling non-zero streak logic on `/user/progress`.

# Migration Recommendations

1. Get `ACTIVE_DAY_DEFINITION` signed off, then enable the backend streak rule and redeploy.
2. Run browser parity review for Phase 2 telemetry panels: account card, positions, floating P/L, and hedge grouping.
3. If that review passes, advance Phase 2 to COMPLETE.
4. Keep Phase 3 planning focused on full `candles[]` batch ingestion and MT5-authoritative candle collection.

# Safe Deployment Order

1. Keep the merged report as the authoritative 2026-05-21 artifact.
2. Deploy the backend timestamp-normalization patch.
3. Re-run the PHP MT5 ingress/freshness suites in target environment.
4. Reconfirm `/health`, `/market-data-authority`, and `/user/progress` on staging.

# Do Not Touch List

- `permission_ea_bridge` / EA authentication callbacks
- `authority-diagnostics` protection rules
- signal-engine stale gating
- Pine formulas unless a parity defect is explicitly reproduced
- `ACTIVE_DAY_DEFINITION` until business rule sign-off is complete
