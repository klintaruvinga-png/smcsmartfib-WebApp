# Executive Summary

- **Overall health**: Stable after a REST/cache-truth hardening pass.
- **Bugs found**: 1 confirmed MEDIUM stale-response risk across volatile REST read paths.
- **Fixes applied**: Centralized no-cache REST responses for live read models and added frontend cache-busting for chart, ladder, health, settings, account, and risk reads.
- **Remaining risks**: Repo-wide lint still has pre-existing Prettier drift outside this patch; live MT5 terminal replay remains unavailable in this workspace.
- **Migration readiness**: PASS for synthetic parity gate; ready for review with runtime MT5 replay still pending.

# Confirmed Problems

| Category | Severity | Root Cause | Impact |
| --- | --- | --- | --- |
| Refresh/stale-state truth | MEDIUM | Several freshness-critical GET endpoints returned cacheable REST responses, and some client reads did not request `no-store` cache-busting. | Browser/proxy cache could replay stale snapshots, chart candles, ladders, telemetry, or progress state while the dashboard appeared current. |

# Surgical Fixes Applied

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Added `no_cache_response()` helper.
  - Applied anti-cache headers to volatile reads: health/admin health, snapshot, fib levels, regime, signal drift, live signals, ladders, chart snapshot, user trades, account telemetry, positions, orders, user account, and user progress.
- `src/lib/api/sniperClient.ts`
  - Added cache-busting/no-store reads for chart snapshots, ladders, health, user account, user settings, and risk profile.
- `src/lib/api/sniperClient.test.ts`
  - Added chart snapshot regression proving `_=` cache-bust token and `cache: "no-store"`.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - Added anti-cache header regression coverage for snapshot, chart, regime, signal drift, telemetry, positions, orders, and user progress.

# Parity Verification Results

- **Fib parity**: 100% synthetic validator parity.
- **Regime parity**: No calculation changes; MT5 dispatch and backend regime reads remained green under focused checks.
- **Signal parity**: No signal formula changes; MT5 signal dispatch static regression passed.
- **Freshness parity**: Improved. Backend and frontend now both explicitly reject cached volatile reads.

# Remaining Risks

- Live MetaEditor compile and MT5 terminal replay are not available in this workspace.
- `npm run lint` still fails on pre-existing repo-wide Prettier drift outside this patch; scoped lint for changed frontend files passes.
- Vite build still warns on oversized shared chunks; not introduced by this pass.

# Regression Checklist

- [x] Refresh tests: `src/lib/api/sniperClient.test.ts`
- [x] Stale detection tests: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- [x] Signal readiness tests: `scripts/mt5-signal-dispatch.test.mjs`
- [x] Backend sync tests: `test-ea-market-stream.php`, `test-watchlist-snapshot-regression.php`
- [x] Parity verification tests: `test-fib-parity.php`, `scripts/parity-validator.php`

# Safe Deployment Order

1. Deploy WordPress plugin changes first so volatile REST reads emit anti-cache headers.
2. Deploy dashboard build after backend deployment so frontend `no-store` requests align with backend headers.
3. Run one live MT5 market-stream and signal-candidate capture to confirm no proxy/browser caching in production.

# Do Not Touch List

- Pine trading formulas.
- MT5 signal entry/SL/TP formulas.
- Backend signal authority and stale-data rejection rules.
- Engine snapshot freshness thresholds.
