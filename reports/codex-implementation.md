## Issue summary

Implemented the Phase 3 EA candle-engine contract across the MT5 payload builder, per-symbol session/freshness handling, and the WordPress `ea/market-stream` ingestion seam, while preserving the existing backend authority model and legacy snapshot-only compatibility.

## Root cause implemented

The live contract gap was at the EA-to-backend handoff: MT5 freshness/session evaluation was still partly global instead of symbol-aware, the EA payload did not expose flat Phase 3 candle aliases, and the backend route accepted incomplete Phase 3 payloads without surfacing a hard error. The patch makes session/open-state evaluation symbol-aware, normalizes the Phase 3 payload shape, validates required Phase 3 fields when that payload shape is used, and preserves `source='mt5'` authority on persistence.

## Exact files changed

- `mt5/FreshnessEngine.mqh`
- `mt5/SessionManager.mqh`
- `mt5/MarketDataEngine.mqh`
- `mt5/SMC_MarketDataEA.mq5`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/class-market-data-service.php`
- `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`

## Tests run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php -l wordpress/smc-superfib-sniper/class-market-data-service.php`
- `php -l wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- Directory-wide PHP test script sweep in `wordpress/smc-superfib-sniper/tests/php`
  Result: all changed-seam tests passed; one unrelated existing failure remained in `test-phase2-trade-telemetry.php` on streak counting (`current_streak_days` expected `1`, actual `0`).

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-22_ea-market-stream-phase3-contract.md`
- `.github/migration/audits/phase-3-mt5-parity-2026-05-22.md`
- `reports/phase3-ea-implementation-report.md`

## Remaining risks

- MT5 files were patched logically against the contract, but MQL compilation/runtime validation has not been run yet in this workspace.
- The contract text conflicts with repo reality on timestamp format and session canonicalization; the safest repo-compatible interpretation was applied and the changed PHP bridge seam validated, but MT5 runtime parity still needs live verification.
- The directory-wide PHP sweep still has one unrelated failure in `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` on streak counting. This patch did not modify streak logic, but the suite is not fully green.

## Any contract ambiguities resolved during implementation

- `timestamp`: the contract text says Unix milliseconds, but the repo’s MT5/backend live contract and existing PHP normalizers use ISO 8601 UTC strings. ISO 8601 was preserved.
- `session` values: the plan examples and canonical spec are inconsistent. The implementation preserved the repo/spec session vocabulary (`Sydney`, `Tokyo`, `London`, `New York`, `Overlap`, `Closed`) and normalized closed windows to `Closed` instead of inventing new session names.
- `class-market-data-service.php`: the contract names it as the MT5 upsert path, but the live `ea/market-stream` persistence path is in `smc-superfib-sniper.php`. The live route was patched first, and the service class was kept behaviorally consistent without widening architecture.
