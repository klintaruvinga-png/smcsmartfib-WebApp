# Executive Summary

- Report Date: 2026-05-21
- Phase: Phase 2 market-data parity
- Auditor: Codex automation `code-bug-fix-and-cleanup`
- Status: PASS with scoped caveats

- Overall parity: 100% across the timestamp-ingestion paths exercised in this run
- Threshold required: 100% for broker timestamp preservation on touched paths
- Trend: Improving

# Scope

This audit covers the touched migration boundary only:

- MT5 tick timestamp ingestion
- MT5 M1 candle timestamp ingestion
- Market-data service normalization parity
- Backend fib/session anchor parity regressions that guard downstream chart/signal inputs

This run does not newly certify direct regime-engine or live-signal parity.

# Component Parity Metrics

## Market Timestamp / Freshness Parity

| Metric | Expected | Actual | Match | Accuracy |
| --- | --- | --- | --- | --- |
| Tick ISO timestamp preserved | `2026-05-16 08:15:30` | `2026-05-16 08:15:30` | PASS | 100% |
| Tick `UTC`-suffix timestamp preserved | `2026-05-16 08:16:30` | `2026-05-16 08:16:30` | PASS | 100% |
| Candle dot-format timestamp preserved | `2026-05-16 08:15:00` | `2026-05-16 08:15:00` | PASS | 100% |
| Candle `UTC`-suffix timestamp preserved | `2026-05-16 08:16:00` | `2026-05-16 08:16:00` | PASS | 100% |
| Snapshot contract preserves broker quote time | PASS expected | PASS observed | PASS | 100% |
| State-only MT5 updates do not rewrite quote time | PASS expected | PASS observed | PASS | 100% |
| Freshness hard reject for stale quote_time/timestamp | PASS expected | PASS observed | PASS | 100% |
| **Freshness Parity Score** | - | - | - | **100%** |

Observations:

- Before the patch, the market-data service failed `UTC`-suffix parsing and fell back to receipt time.
- After the patch, the helper path matches the hardened `/ea/market-stream` path, eliminating parser drift between ingress layers.

## Fib Engine Parity

| Metric | Pine / Canonical Expectation | Backend Result | Match | Accuracy |
| --- | --- | --- | --- | --- |
| Session anchor extraction | Stable completed-session anchors | PASS | PASS | 100% |
| HTF authority anchor extraction | Correct prior authority session | PASS | PASS | 100% |
| Weighted SuperFib anchor composition | Expected weighted highs/lows | PASS | PASS | 100% |
| **Fib Parity Score** | - | - | - | **100%** |

Observations:

- `test-fib-parity.php`, `test-session-anchors.php`, and `test-htf-authority-anchor.php` all passed unchanged.
- No new drift was introduced by the market-data timestamp fix.

## Regime Engine Parity

| Metric | Status | Notes |
| --- | --- | --- |
| Regime classification parity | PENDING | No dedicated regime suite executed in this run. |
| Chop / volatility gating parity | PENDING | No direct regime-gating assertions executed in this run. |

Observations:

- No regime code was touched.
- Current status is unchanged, but not newly verified.

## Signal Engine Parity

| Metric | Status | Notes |
| --- | --- | --- |
| Signal readiness vs fresh data | PARTIAL | Indirectly exercised by snapshot/health regressions only. |
| Entry / SL / TP parity | PENDING | No direct signal-generation suite executed in this run. |
| Signal dedupe / persistence parity | PENDING | Not exercised in this run. |

Observations:

- The patch improves upstream freshness truth, which reduces risk of signal evaluation on mis-timestamped data.
- Direct signal-engine parity still requires its own replay/contract suite.

# Confirmed Drift Fixed

| Issue | Severity | Count | Resolution | Blocker |
| --- | --- | --- | --- | --- |
| Market-data service treated `UTC`-suffix timestamps as parse failures and rewrote them to receipt time | HIGH | 1 | Patched parser and added regression coverage | No |

# Acceptable Drift Items

| Item | Difference | Reason | Accepted |
| --- | --- | --- | --- |
| Regime parity not freshly re-run | Not measured in this cycle | No regime code touched; coverage gap remains explicit | No |
| Signal parity not freshly re-run | Not measured in this cycle | No direct signal suite available in current run set | No |

# Recommendations

1. Keep the timestamp parser implementations aligned whenever ingress helpers are modified.
2. Add dedicated regime parity tests before the next migration phase gate.
3. Add direct signal-engine replay/contract tests so freshness truth can be traced into entry decisions.

# Verification Checklist

- [x] Touched-path parity computed from executed regression suites
- [x] Historical timestamp normalization variants validated
- [x] Multi-format timestamp inputs analyzed
- [x] Drift root cause identified
- [x] Corrective action documented
- [ ] Dedicated regime parity revalidated
- [ ] Dedicated signal parity revalidated

# Artifacts

- Test logs: local CLI output from executed PHP/Vitest suites
- Comparison output: `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- Error reproduction: reflection probe confirming pre-patch `UTC`-suffix fallback
