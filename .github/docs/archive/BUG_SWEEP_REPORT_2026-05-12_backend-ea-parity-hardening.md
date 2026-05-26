# Bug Sweep Report

Date: 2026-05-12
Scope: Backend and EA parity hardening for MT5 snapshot persistence, timestamp authority, health parity, snapshot coverage, and engine snapshot invalidation.

## Confirmed findings

1. `post_snapshot()` accepted explicit non-`mt5` source values from payloads because the route always overwrote `source` at write time without auditing the attempt.
2. Tick-bearing `post_snapshot()` writes could persist a non-live state when `freshness` was supplied, which violated the contract that tick-bearing MT5 snapshots must land as `state='live'`.
3. `post_snapshot()` never invalidated `smc_sf_engine_snapshot` when a watched symbol crossed the live/non-live boundary through snapshot ingest, allowing a short-lived stale engine cache window.
4. The plugin health/cache helpers (`get_cached_price()` and `latest_timestamp('snapshots', ...)`) read snapshot rows without an MT5 source filter, so a non-MT5 row could influence freshness calculations in the active backend path.

## Changes applied

- Hardened `wordpress/smc-superfib-sniper/smc-superfib-sniper.php::post_snapshot()` to:
  - audit and skip explicit non-`mt5` source attempts using the existing `smc_sf_audit_events` mechanism
  - persist `state='live'` on every tick-bearing MT5 write
  - preserve `updated_at` on freshness-only transitions
  - invalidate `smc_sf_engine_snapshot` only when a watched symbol crosses the live/non-live state boundary
- Extracted the engine snapshot minimum refresh interval into `ENGINE_SNAPSHOT_MIN_REFRESH_INTERVAL_SEC`.
- Added a source-filtered snapshot reader helper and routed plugin freshness reads through it.
- Limited snapshot `latest_timestamp()` reads to MT5 rows only.

## Validation evidence

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-get-soak-report.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-rest-bootstrap-settings.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php`
- `npx vitest run --environment jsdom src/routes/-admin.test.tsx src/lib/api/sniperClient.test.ts`

## Residual risks

- No live WordPress + MT5 operator soak was executed in this patch, so the 30-minute connected/disconnected observation remains manual.
- `class-market-data-service.php::store_tick_snapshot()` still timestamps writes with server time, but that helper was outside this contract’s accepted write path and was not changed.
- The contract requested a `wp_smc_sf_audit_log` entry; repository reality uses `smc_sf_audit_events`, so the guard was implemented through the existing audit table instead of introducing a new logging surface.
