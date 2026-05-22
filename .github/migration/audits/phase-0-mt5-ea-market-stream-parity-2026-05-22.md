# Executive Summary

- Scope: Authenticated MT5 snapshot ingest parity versus the canonical EA market-stream contract.
- Overall parity: 100 percent for the targeted ingress fields patched in this run.
- Threshold required: 100 percent for shared timestamp, symbol, and candle contract fields.
- Result: PASS for the targeted `/snapshot` and `/ea/market-stream` contract surface.
- Trend: Improving. The remaining parity gap from the prior run is now closed on the authenticated snapshot path.

# Component Parity Metrics

## Snapshot contract parity

| Metric | Canonical expectation | `/snapshot` result | Match | Accuracy |
| --- | --- | --- | --- | --- |
| Symbol alias normalization | Broker alias resolves to canonical symbol key | `USTECH100` persisted as `NAS100` | Yes | 100% |
| Top-level pricing | `bid` and `ask` accepted without nested `tick` wrapper | Snapshot row written from top-level fields | Yes | 100% |
| Quote timestamp truth | `quote_time` persists as quote timestamp | `updated_at` stored from `quote_time` | Yes | 100% |
| Candle array promotion | `candles[0]` promoted into M1 candle when `candle_m1` absent | M1 candle row written | Yes | 100% |
| Tick volume mapping | `tick_volume` accepted on canonical candle payload | Stored as candle `volume` | Yes | 100% |
| Freshness wiring | Freshness transient uses canonical symbol key | `smc_sf_freshness_7_NAS100=LIVE` | Yes | 100% |
| Snapshot parity score | - | - | - | 100% |

## Freshness and timestamp parity

| Metric | Expected behavior | Result | Match | Accuracy |
| --- | --- | --- | --- | --- |
| Quote-time preservation | Backend stores source quote timestamp, not receipt time | Verified on `/snapshot` and existing `/ea/market-stream` regression suite | Yes | 100% |
| Stale-data guard | `/ea/market-stream` rejects payloads older than 300 seconds | Existing regression suite passed unchanged | Yes | 100% |
| Source-of-truth state | Backend remains authoritative for freshness state | No frontend-only overrides introduced | Yes | 100% |
| Freshness parity score | - | - | - | 100% |

## Broader migration parity status

| Domain | Current status | Notes |
| --- | --- | --- |
| Fib engine | Not rerun today | Last direct parity pass remains 2026-05-21. |
| Regime engine | Indirect coverage only | No logic change in this patch; direct replay suite still absent. |
| Signal engine | Indirect coverage only | No logic change in this patch; direct replay suite still absent. |

# Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
| --- | --- | --- | --- | --- |
| Authenticated `/snapshot` silently ignored canonical MT5 fields while returning `ok: true` | HIGH | 1 | Fixed by compatibility normalization before persistence | No |

# Comparison Matrix

| Field | `/ea/market-stream` before run | `/snapshot` before run | `/snapshot` after patch |
| --- | --- | --- | --- |
| `bid` / `ask` top-level | Accepted | Ignored | Accepted |
| `quote_time` | Accepted | Ignored unless manually nested into `tick.timestamp` | Accepted |
| `candles[]` array | Accepted via `candles[0]` shim | Ignored | Accepted via `candles[0]` shim |
| `tick_volume` | Accepted via alias mapping | Ignored with `candles[]` shape | Accepted |
| Broker alias normalization | Applied | Not applied | Applied |

# Acceptable Drift Items

| Item | Difference | Reason | Accepted |
| --- | --- | --- | --- |
| Full multi-candle batch persistence | Only `candles[0]` stored | Phase 3 scope by design; no architecture rewrite in this run | Yes |
| Regime replay coverage | Not rerun | Out of scope for the snapshot contract fix | Yes |
| Signal replay coverage | Not rerun | Out of scope for the snapshot contract fix | Yes |

# Recommendations

1. Keep `/snapshot` and `/ea/market-stream` contract fields in lockstep through shared regression tests whenever either path changes.
2. Add a dedicated regime replay suite before Phase 3 if migration governance requires direct parity evidence.
3. Add a dedicated signal replay suite before widening mixed-ingest rollout beyond current soak coverage.

# Verification Checklist

- [x] Canonical authenticated `/snapshot` payload persisted a snapshot row.
- [x] Canonical authenticated `/snapshot` payload persisted an M1 candle row.
- [x] Alias normalization matched EA market-stream canonical symbol behavior.
- [x] `quote_time` preserved timestamp truth on the snapshot path.
- [x] Existing `/ea/market-stream` regression suite still passed after the patch.
- [x] Market-data service source filtering still passed after the patch.

# Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-22.md`
- Contract regression suite: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- EA parity suite: `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- Source-filter suite: `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
