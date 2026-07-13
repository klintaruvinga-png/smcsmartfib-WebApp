# Issue summary

Completed the scoped `/admin` polish patch for Phase 0 soak operations: surfaced separate baseline/checkpoint age cards, hardened soak-report refresh/error handling, and improved soak print/export formatting without changing backend contracts.

# Root cause implemented

The admin soak workspace compressed age visibility into one summary card, had no print-specific block protection for export readability, and allowed refresh-followed-by-success paths to continue even when the soak-report refresh failed. The current `SoakReport` schema also does not expose a dedicated checkpoint-age field, so the safe implementation keeps checkpoint-age messaging explicitly tied to the existing backend timestamp instead of inventing new frontend truth.

# Exact files changed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-ui-polish-soak-report.md`
- `.github/migration/audits/phase-0-dashboard-admin-soak-parity-2026-05-12.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-ui-polish-soak-report.md`
- `.github/migration/audits/phase-0-dashboard-admin-soak-parity-2026-05-12.md`
- `reports/codex-implementation.md`

# Remaining risks

- Browser print-preview validation on a running `/admin` page was not completed because the local browser automation surface required by the contract was unavailable in this session.
- `Checkpoint age` still uses the baseline timestamp fallback until the backend exposes a distinct checkpoint-age field.

# Any contract ambiguities resolved during implementation

- The contract required separate `Baseline age` and `Checkpoint age` output, but `src/types/sniper.ts` does not expose a dedicated checkpoint-age field. I applied the smallest safe interpretation: keep both labels, derive them from the existing backend timestamp, and state the checkpoint-age fallback explicitly in the UI rather than widening the API contract.
