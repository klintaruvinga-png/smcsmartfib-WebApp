# Issue summary

Strengthened the `/admin` soak workspace so baseline and checkpoint cards are visually distinct at a glance, age/capture timing is promoted into card headers, print rules explicitly preserve evidence sections, and soak report load/refresh failures now surface operator-facing status with source, HTTP status, parsed error code, and next-action guidance.

# Root cause implemented

The soak workspace summary grid relied on generic `HealthCard` rendering with no baseline/checkpoint badge semantics, age context sat in low-priority detail text, print rules did not explicitly force all evidence containers to render as print blocks, and soak report failure copy echoed raw errors without structured operator guidance. The fix stays inside `admin.tsx` by extending the local card presentation API, tightening print-only CSS, and formatting soak report failures through guarded status/code extraction.

# Exact files changed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-ui-polish-soak-report.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-ui-polish-soak-report.md`
- `reports/codex-implementation.md`
- Parity audit not required by contract for this dashboard-only patch.

# Remaining risks

- Browser print preview and live forced `/admin/soak-report` failure were not manually exercised in-session because the in-app browser automation runtime required for local verification is not available in this tool context.
- `Checkpoint age` now prefers the latest checkpoint timestamp when present and otherwise falls back to baseline timing; this remains display-only and uses backend-owned timestamps, but it should still be visually smoke-checked against real report ordering.

# Any contract ambiguities resolved during implementation

- The contract referenced the `panelError` path for soak report failures, but repository reality renders load/refresh failures through `soakState.kind === "error"`. I applied the operator-facing message hardening to the existing soak report error branch via `formatSoakReportError` without changing `AuthError` handling or save-action `panelError` behavior.
- The contract required age promotion without changing the 6-column layout. I kept the six-card grid intact and promoted age/capture context into header metadata on the baseline/checkpoint-related cards instead of replacing the grid structure.
