# Issue summary

Completed the Phase 0 backend/EA parity hardening contract for MT5 snapshot persistence, timestamp authority, backend health parity re-validation, snapshot coverage expansion, and engine snapshot invalidation audit. The patch stayed inside the WordPress backend and existing test harnesses.

# Root cause implemented

The active gap was not route divergence. It was incomplete contract enforcement around snapshot ingest and freshness reads: `post_snapshot()` trusted payload source attempts, allowed tick-bearing writes to inherit non-live freshness state, and did not invalidate the engine snapshot cache on watched-symbol live/non-live transitions. In repository reality, the non-MT5 source read risk also existed in `smc-superfib-sniper.php` helper reads, not in `class-market-data-service.php`, so the source-filter hardening was applied there.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
- `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_backend-ea-parity-hardening.md`
- `.github/migration/audits/phase-0-mt5-backend-parity-2026-05-12.md`

# Tests run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php -l wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `php -l wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `php -l wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`
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

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_backend-ea-parity-hardening.md`
- `.github/migration/audits/phase-0-mt5-backend-parity-2026-05-12.md`

# Remaining risks

- The contract’s 30-minute live MT5 connected/disconnected observation was not executable in this local harness and remains manual.
- No live row inspection against a real WordPress database was possible here; verification is via the existing PHP harnesses.
- `class-market-data-service.php::store_tick_snapshot()` still uses server time, but that helper was outside the accepted write-path scope and was not changed.

# Any contract ambiguities resolved during implementation

- The contract requested a `wp_smc_sf_audit_log` error entry. Repository reality uses `smc_sf_audit_events` via `audit()`, so the non-MT5 source guard writes there instead of creating a new logging surface.
- The contract targeted source-filter auditing in `class-market-data-service.php`, but the active health/freshness read gap in this repo lives in `smc-superfib-sniper.php`. `class-market-data-service.php` was verified unchanged, and the equivalent live-path fix was applied in the plugin helpers instead.
- The required branch in runtime context (`codex/complete-backend-and-ea-parity-hardening-audit-m`) was used instead of the contract’s recommendation branch example.
