# Issue summary

Implemented the live-signals freshness contract hardening for SMC Intake. The patch preserves backend snapshot authority while removing transport and query-cache conditions that could leave `/live-signals` stale on the dashboard.

# Root cause implemented

Implemented the confirmed client/origin freshness gaps only: `get_live_signals()` now returns route-local anti-cache headers, `apiClient.getLiveSignals()` now opts into the existing cache-bust plus `no-store` GET path, and `useLiveSignals()` now overrides the global React Query stale window with `staleTime: 0`.

# Exact files changed

- `reports/codex-implementation.meta.json`
- `reports/implementation-verification.md`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `src/lib/api/sniperClient.ts`
- `src/hooks/useSniperData.ts`
- `src/lib/api/sniperClient.test.ts`
- `src/hooks/useSniperData.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_live-signals-freshness-contract.md`
- `.github/migration/audits/phase-2-dashboard-live-signals-freshness-parity-2026-05-29.md`
- `reports/codex-implementation.md`

# Tests run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx`
- `npm run validate:impl`

# Reports generated

- `reports/implementation-verification.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_live-signals-freshness-contract.md`
- `.github/migration/audits/phase-2-dashboard-live-signals-freshness-parity-2026-05-29.md`

# Remaining risks

Manual authenticated network verification is still required to confirm the deployed `/live-signals` origin emits the anti-cache headers and that each poll uses a unique cache-bust token. Intermediary caches may still require operational purge after deploy even when the code contract is correct, and `/snapshot` versus `/live-signals` parity after a real backend update cycle remains unverified from this workspace.

# Any contract ambiguities resolved during implementation

Applied the PHP anti-cache headers on the successful `WP_REST_Response` returned by `get_live_signals()` only, which is the smallest safe interpretation of “this route only” without changing shared auth/error handling or snapshot recomputation behavior.
