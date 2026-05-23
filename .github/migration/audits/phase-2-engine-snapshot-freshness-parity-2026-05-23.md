# Executive Summary

- Report date: 2026-05-23
- Phase: 2 - engine snapshot freshness authority
- Status: PASS
- Overall parity: 100% sampled suite pass rate for the targeted freshness/cache scope.
- Threshold required: 95% on targeted sampled checks.
- Trend: improving.

# Component Parity Metrics

## Freshness authority

| Metric | Expected behavior | Result | Status |
| --- | --- | --- | --- |
| Cached live snapshot validity | Cached engine snapshots must expire when live quote timestamps exceed `staleThresholdSec`, even if `computedAt` is still inside `refreshIntervalSec`. | Regression added and passed. | PASS |
| MT5 snapshot timestamp truth | Quote/candle storage must preserve MT5 source timestamps. | `test-mt5-snapshot-contract.php` and `test-market-data-service-source-filter.php` passed. | PASS |
| Watchlist snapshot integrity | Watchlist mismatches must invalidate cached engine snapshots before reuse. | `test-watchlist-snapshot-regression.php` passed. | PASS |

## Fib engine

| Metric | Suite | Result | Status |
| --- | --- | --- | --- |
| Fib level parity | `test-fib-parity.php` | Passed | PASS |
| Session anchor parity | `test-session-anchors.php` | Passed | PASS |
| HTF authority anchor parity | `test-htf-authority-anchor.php` | Passed | PASS |

## Regime and signal governance

| Metric | Scope | Result | Status |
| --- | --- | --- | --- |
| Regime stale-state governance | Indirectly exercised through engine snapshot cache invalidation and MT5 stale blocker paths. | Passed in sampled checks. | PASS WITH COVERAGE GAP |
| Signal stale-state governance | Live-signal stale blocker and MT5 authority contract preserved after patch. | Passed in sampled checks. | PASS WITH COVERAGE GAP |

# Drift Analysis

- Previous risk: cached engine snapshots could outlive fresh quote truth whenever `refreshIntervalSec` exceeded `staleThresholdSec`.
- Current state: removed for cached `state=live` price rows by validating `updatedAt` age at snapshot reuse time.
- Residual drift: no evidence in executed suites, but dedicated replay parity coverage is still incomplete for regime and signal engines.

# Comparison Matrix

| Layer | Before patch | After patch | Notes |
| --- | --- | --- | --- |
| Backend cache gate | Trusted `computedAt` only. | Requires symbol parity, fresh `computedAt`, and fresh live quote timestamps. | Removes false-LIVE reuse window. |
| Dashboard live-signal consumer | Could receive stale-but-cache-valid backend truth. | Receives recomputed backend output once live quote timestamps age out. | Architecture preserved. |
| MT5 timestamp authority | Source timestamps already authoritative. | Preserved. | Existing contract suites stayed green. |

# Acceptance Criteria

- [x] Engine snapshot cache invalidates when live quote timestamps exceed the stale threshold.
- [x] Watchlist snapshot invalidation behavior remains intact.
- [x] MT5 timestamp truth remains authoritative after the cache fix.
- [x] Fib/session anchor parity remains green on targeted suites.
- [ ] Dedicated regime replay parity suite executed.
- [ ] Dedicated signal replay parity suite executed.

# Migration Readiness

- Ready for continued MT5-native migration on the targeted freshness/cache path.
- Not yet sufficient to close regime/signal parity governance without the missing replay suites.

# Unresolved Edge Cases

- Closed or disconnected market snapshots are intentionally not invalidated by the new live-quote age guard; they remain governed by their stored non-live state.
- Multi-case regime/signal drift outside this stale-cache path still needs explicit replay coverage.

# Verification Artifacts

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
