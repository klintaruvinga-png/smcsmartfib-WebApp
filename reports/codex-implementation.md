# Issue summary

Implemented the missing `/user/progress` backend contract and wired the Progress page Streak and Milestones panels to that backend-owned read path while preserving the existing Equity and Drawdown card sources.

# Root cause implemented

The Progress page gap was a deferred feature, not a regression: `GET /user/progress` did not exist, the frontend had no typed client/hook for it, and `progress.tsx` was hard-gated behind `PROGRESS_NOT_IMPLEMENTED`.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- `src/types/sniper.ts`
- `src/mocks/sniperData.ts`
- `src/lib/api/sniperClient.ts`
- `src/lib/api/sniperClient.test.ts`
- `src/hooks/useSniperData.ts`
- `src/hooks/useSniperData.test.tsx`
- `src/routes/progress.tsx`
- `src/routes/-progress.page.test.tsx`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-progress.page.test.tsx`
- `npx tsc --noEmit`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md`
- `.github/migration/audits/phase-2-backend-dashboard-progress-parity-2026-05-20.md`

# Remaining risks

`streak.current_streak_days` is intentionally degraded to `0` with `state: "UNAVAILABLE"` until the backend active-day definition receives explicit business sign-off. `equity_pulse.today_pnl_usc` has no Phase 2 telemetry table field, so the handler reads the persisted account snapshot value when present and otherwise falls back to `0`.

# Any contract ambiguities resolved during implementation

Resolved `first_trade_telemetry` to mean confirmed persisted Phase 2 telemetry existence in `smc_sf_account_telemetry`, because that table is authoritative, guaranteed on valid telemetry batches, and already backs `/account-telemetry`. Resolved the missing `today_pnl_usc` Phase 2 source by using the persisted backend account snapshot value rather than inventing frontend truth.
