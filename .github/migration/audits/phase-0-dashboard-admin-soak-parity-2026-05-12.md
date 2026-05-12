# Phase 0 Dashboard Admin Soak Parity Audit - 2026-05-12

## Scope

Re-validate the scoped parity contract for the admin soak workspace after the UI polish patch.

- Backend source: `GET /wp-json/sniper/v1/admin/soak-report`
- Frontend surface: `src/routes/admin.tsx`
- Patch intent: improve operator visibility and export formatting without altering backend authority or the soak-report schema

## Re-validated parity points

1. `fetchSoakReport()` remains the only soak-report fetch path used by `/admin`.
2. `fetchSoakReport()` still uses `cacheBust: true` through `src/lib/api/sniperClient.ts`.
3. No new `SoakReport` fields or frontend-owned derived contract fields were introduced.
4. `Baseline age` and `Checkpoint age` remain sourced from existing backend timestamps only.
5. Refresh failures promote `/admin` back into the soak error state instead of leaving the UI in a stale ready state.
6. Print/export changes stay scoped to `.soak-report-print-section` and do not widen into non-soak admin surfaces.

## Evidence

- Source inspection:
  - `src/routes/admin.tsx`
  - `src/routes/-admin.test.tsx`
  - `src/types/sniper.ts`
  - `src/lib/api/sniperClient.ts`
- Validation commands:
  - `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
  - `npm run build`

## Result

PASS

- Backend authority preserved: the admin soak workspace still renders backend-owned report data only.
- Contract preserved: no API drift, stale-data bypass, or frontend-only signal truth was introduced.
- UI fidelity improved: the admin page now surfaces age context and refresh failures more explicitly while keeping the existing source-of-truth boundary intact.

## Residual risks

- Live browser print-preview verification was not completed in-session because local browser automation was unavailable here.
- The backend still does not expose a distinct checkpoint-age field, so the `Checkpoint age` card intentionally documents its fallback source instead of implying new backend precision.

## Related artifacts

- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-ui-polish-soak-report.md`
- Implementation summary: `reports/codex-implementation.md`
