# Issue summary

Extended the admin surface into a Phase 0 soak report builder on the implementation branch without changing `/wp-json/sniper/v1/admin/health`, `/wp-json/sniper/v1/health`, `permission_admin()`, or any existing backend source-of-truth contract. The branch now carries admin-only soak aggregation, manual evidence persistence, checkpoint snapshots, and frontend markdown/print export, and this turn finalized the missing repo-alignment and regression coverage needed to validate that implementation cleanly.

# Root cause implemented

The original gap was additive, not corrective: `origin/main` had no dedicated soak-report endpoints, persistence tables, or `/admin` soak UI. On the implementation branch, those runtime pieces were already present; the missing repo-specific follow-through was that the contract referenced an `AdminHealth` type that does not exist here, and the soak-report backend needed dedicated regression coverage to prove route registration, admin gating, evidence validation/upsert, and 72h checkpoint pruning.

# Exact files changed

- `src/routes/admin.tsx`
- `src/lib/api/sniperClient.ts`
- `src/types/sniper.ts`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-admin-soak-report.php`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-10_phase-0-soak-report-builder.md`
- `.github/migration/audits/phase-0-admin-soak-report-parity-2026-05-10.md`
- `reports/codex-implementation.md`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-admin-soak-report.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `npx tsc --noEmit --pretty false`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-10_phase-0-soak-report-builder.md`
- `.github/migration/audits/phase-0-admin-soak-report-parity-2026-05-10.md`
- `reports/codex-implementation.md`

# Remaining risks

- Real HTTP verification for admin/non-admin REST access was not possible from this workspace, so the live `curl` checks in the contract remain manual follow-up.
- Browser-only behaviors still need an authenticated runtime pass:
  - markdown download
  - print-only layout
  - no console errors on `/admin`
- `watchlist_count` remains `null` by design because the plugin does not define a dedicated `smc_sf_watchlist` table.

# Any contract ambiguities resolved during implementation

- `AdminHealth` type: the repo has no such type, so `AdminHealth` was aliased to the existing `EngineHealth` contract instead of inventing a second health shape.
- `watchlist_count`: the contract referenced `smc_sf_watchlist`, but the plugin schema does not contain that table, so the response remains `null` as the plan required for absent schema.
- `snapshots_24h` timestamp column: the contract named `created_at`, but the real `smc_sf_snapshots` table uses `updated_at`, so the aggregation follows the real schema.
- Response key count: the contract text said "seven top-level keys" while enumerating more fields; the implementation keeps every enumerated field.
- PR handling: the required branch already existed remotely and already had an open normal PR (`#128`), so the safe execution path was to update that branch/PR instead of opening a second PR for the same head branch.
