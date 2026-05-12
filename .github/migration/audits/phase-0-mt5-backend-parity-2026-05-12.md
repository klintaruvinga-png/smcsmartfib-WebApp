# Phase 0 MT5 Backend Parity Audit - 2026-05-12

## Scope

Re-validate backend parity for:

- MT5 snapshot persistence authority
- `/health` vs `/admin/health` payload parity
- engine snapshot cache invalidation on watchlist and snapshot state transitions
- non-MT5 snapshot exclusion from backend freshness reads

## Contract checks

1. Tick-bearing `/snapshot` writes persist `source='mt5'`, `state='live'`, and MT5 broker quote time in `updated_at`.
2. Freshness-only `/snapshot` writes preserve the prior `updated_at` while updating only `state` and `source`.
3. Explicit non-`mt5` snapshot source attempts are audited and do not write snapshot rows.
4. `ensure_engine_snapshot()` serves cache only when symbol set and age checks remain valid; add/remove watchlist mutations force recompute.
5. `/health` and `/admin/health` remain backed by the same `build_health_payload()` output.
6. Backend snapshot freshness reads ignore non-MT5 rows.

## Evidence

- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - covers tick-bearing live writes
  - covers freshness-only timestamp preservation
  - covers invalid-source audit-and-skip behavior
  - covers live/non-live engine snapshot invalidation
  - covers `/health` and `/admin/health` equality
  - covers cache-currentness for add/remove watchlist changes
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
  - covers bidirectional symbol-set invalidation and canonical watchlist mutation invalidation
- `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
  - confirms the service-level MT5 source filter still excludes non-MT5 snapshot rows
- `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
  - re-confirms EA ingest writes `source='mt5'`, `state='live'`, and broker timestamp authority
- `npx vitest run --environment jsdom src/routes/-admin.test.tsx src/lib/api/sniperClient.test.ts`
  - re-confirms the admin route remains backend-read-only and consumes the backend health contract without local truth overrides

## Result

PASS

- MT5 snapshot authority is preserved on both the dashboard snapshot route and the EA ingest route.
- Health parity remains structurally enforced through the shared backend payload builder.
- Engine snapshot cache invalidation now covers the audited live/non-live snapshot transition case without blanket invalidation.
- Non-MT5 snapshot rows are excluded from active backend freshness reads.

## Notes

- `class-market-data-service.php` required no production code change because its active snapshot read query already filters `source='mt5'`.
- The contract referenced `wp_smc_sf_audit_log`; repository reality uses the existing `smc_sf_audit_events` table through `audit()`, and that path was reused.
- Manual live-soak verification remains pending for the 30-minute MT5 connected/disconnected observation window.
