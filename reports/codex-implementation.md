# Issue summary

Added an explicit baseline-exists warning to `/admin` and locked the baseline capture control when the backend soak report already contains a `baseline_checkpoint`.

# Root cause implemented

The admin route already had the authoritative baseline existence signal from `/admin/soak-report`, but it only exposed a positive `Baseline captured` state. The patch adds a stronger operator warning and a locked capture state from that existing backend field without changing the API contract or checkpoint persistence logic.

# Exact files changed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-baseline-exists-warning.md`
- `.github/migration/audits/phase-0-dashboard-admin-baseline-parity-2026-05-12.md`

# Tests run

- `npx vitest run src/routes/-admin.test.tsx --environment jsdom`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-baseline-exists-warning.md`
- `.github/migration/audits/phase-0-dashboard-admin-baseline-parity-2026-05-12.md`
- `reports/codex-implementation.md`

# Remaining risks

- Live authenticated `/admin` parity was not visually confirmed from this session because the in-app browser runtime required by the local browser skill was not exposed and no authenticated admin session was available in the workspace.
- The patch intentionally does not add backend rejection logic for a second baseline capture attempt because that was outside the contract.

# Any contract ambiguities resolved during implementation

- The existing baseline form doubles as the operator evidence update surface after baseline capture. The contract required the baseline capture control to be disabled once a baseline exists, but fully disabling the only submit path would also remove evidence updates. The smallest safe implementation was to render a disabled baseline capture button for the lock state while preserving a separate `Update Baseline Evidence` submit action under the same backend-authoritative condition.
