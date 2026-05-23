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
