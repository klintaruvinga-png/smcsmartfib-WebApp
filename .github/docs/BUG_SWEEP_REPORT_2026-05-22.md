# Executive Summary

- Overall health: Stable after backend contract hardening on the authenticated MT5 snapshot path.
- Bugs found: 1 confirmed HIGH issue in `POST /snapshot`; 0 critical; 2 residual medium-risk coverage gaps.
- Fixes applied: Added a compatibility shim so `/snapshot` now accepts the canonical MT5 payload shape already supported by `/ea/market-stream`.
- Remaining risks: Direct regime and signal replay parity suites were not added in this run; current coverage remains indirect through snapshot/health tests.
- Migration readiness: Phase 2 migration remains viable. Legacy authenticated snapshot writers no longer silently drop canonical MT5 payload fields.

# Confirmed Problems

## Contract and synchronization

| Severity | Component | Root cause | Impact | Blocker |
| --- | --- | --- | --- | --- |
| HIGH | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `post_snapshot()` | The legacy authenticated `/snapshot` route only consumed nested `tick` and `candle_m1` payloads. It returned `ok: true` while silently ignoring canonical MT5 fields such as top-level `bid`/`ask`, `quote_time`, `candles[]`, and broker aliases. | Migration parity gap between `/snapshot` and `/ea/market-stream`; stale or missing snapshot/candle writes could desynchronize backend truth from dashboard/MT5 during mixed-ingest deployments. | No |

## Coverage gaps

| Severity | Component | Root cause | Impact | Blocker |
| --- | --- | --- | --- | --- |
| MEDIUM | Regime parity governance | No direct regime replay suite executed in this run. | Regime drift would still be caught late through downstream health/snapshot symptoms. | No |
| MEDIUM | Signal parity governance | No direct signal replay suite executed in this run. | Signal readiness drift remains indirectly covered rather than explicitly replayed. | No |

# Surgical Fixes Applied

| File | Change | Logic hardened | Regression protection |
| --- | --- | --- | --- |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Added `normalize_snapshot_payload_compat()` and routed `post_snapshot()` through it before persistence. | `/snapshot` now accepts canonical top-level `bid`/`ask`, resolves `quote_time -> tick.timestamp`, promotes `candle` or `candles[0] -> candle_m1`, maps `tick_volume -> volume`, and normalizes broker aliases through `map_symbol_aliases()`. | Prevents false-success ingest responses that previously skipped writes on canonical MT5 payloads. |
| `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | Added canonical payload regression coverage for aliased symbol, `quote_time`, top-level pricing, `candles[]`, and freshness transient writes. | Locks `/snapshot` parity to the same ingress shape already supported by `/ea/market-stream`. | Fails if snapshot persistence, candle promotion, alias normalization, or freshness wiring regresses. |

# Parity Verification Results

| Domain | Result | Notes |
| --- | --- | --- |
| Snapshot contract parity | PASS (100 percent of targeted fields) | Verified `symbol`, `normalized_symbol`, alias mapping, top-level `bid`/`ask`, `quote_time`, `candles[0]`, and `tick_volume` on `/snapshot`. |
| Freshness parity | PASS (100 percent of targeted cases) | Quote timestamp truth preserved; freshness transient stored against canonical symbol; `/ea/market-stream` staleness behavior remained intact. |
| Fib parity | Not rerun today | Last direct fib parity suite pass remains the 2026-05-21 run. No fib logic changed in this patch. |
| Regime parity | Indirect only | No regime math changed; current confidence comes from unchanged backend logic plus passing snapshot/health contract tests. |
| Signal parity | Indirect only | No signal math changed; current confidence comes from unchanged gating logic plus passing snapshot contract tests. |

# Remaining Risks

- The authenticated `/snapshot` route still does not ingest full multi-candle batches; only `candles[0]` is promoted. This is acceptable for current architecture and remains a Phase 3 candidate.
- Dedicated regime replay coverage is still absent from the current run set.
- Dedicated signal replay coverage is still absent from the current run set.

# Regression Checklist

- [x] `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- [x] Verified `/snapshot` now persists canonical MT5 payload writes instead of returning false-success `ok` responses.
- [x] Verified `/ea/market-stream` canonical alias coverage and stale-data guards remain unchanged after the patch.

# Safe Deployment Order

1. Deploy the WordPress plugin patch containing the `/snapshot` compatibility shim.
2. Run the authenticated MT5 snapshot smoke test with canonical payload fields.
3. Run the EA market-stream smoke test to confirm no regression on the API-key path.
4. Resume Phase 2 soak with mixed snapshot writers only after both ingest paths are writing canonical timestamps and symbol keys.

# Do Not Touch List

- `permission_ea_bridge()` and `permission_ea_market_stream()` auth flow.
- Signal-engine readiness gates around MT5 source, price freshness, and candle freshness.
- Fib calculation logic in Pine, backend, or MT5 without reproduced parity drift.
- Stale-data timestamp truth rules that preserve quote time over receipt time.

# Acceptance Criteria

- Canonical MT5 snapshot payload sent to authenticated `/snapshot` writes a price snapshot row.
- `quote_time` is persisted as the snapshot timestamp.
- `candles[0]` is promoted into an M1 candle row with `tick_volume` mapped to `volume`.
- Broker aliases normalize to canonical symbols before persistence and freshness transient writes.
- Existing `/ea/market-stream` tests continue passing unchanged.
