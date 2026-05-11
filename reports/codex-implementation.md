# Issue summary

Initial `/admin/soak-report` failures in `src/routes/admin.tsx` were already setting `soakState.kind = "error"`, but that failure did not propagate into the shared `panelError` banner and the soak panel provided no retry affordance. The result was a partially failed admin page where first-load soak report failures were materially less visible than refresh failures.

## Root cause implemented

The implemented fix stays inside the existing frontend authority boundaries. The initial `fetchSoakReport()` effect now promotes non-auth failures into both `soakState` and `panelError`, and the soak error panel now renders an explicit failure label plus a retry button wired to the existing `refreshSoakReport()` path. `AuthError` handling and the backend/API contract were left unchanged.

## Exact files changed

- `src/routes/admin.tsx` - promoted initial soak-report load failures into `panelError`; replaced the raw soak error block with an explicit failure label, preserved backend error detail, and added a retry button that calls `refreshSoakReport()`.
- `src/routes/admin.soak-report.tsx` - documented that direct `/admin/soak-report` visits intentionally redirect to `/admin` because the soak workspace lives in `admin.tsx`.
- `src/routes/-admin.test.tsx` - added route component regression coverage for non-auth initial load failure with retry recovery and for `AuthError` redirect behavior.
- `src/lib/api/sniperClient.test.ts` - re-ran existing soak-report API regression coverage unchanged as required by the contract.
- `package.json` - added minimal dev dependencies for local component test execution (`vitest`, `@testing-library/react`, `jsdom`).
- `package-lock.json` - lockfile update for the added test dependencies.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-soak-report-error-visibility.md` - added the required bug sweep report.
- `reports/codex-implementation.md` - updated implementation summary for this run.

## Tests run

- `npx vitest run src/lib/api/sniperClient.test.ts src/routes/-admin.test.tsx --environment jsdom`
- `npx eslint src/routes/admin.tsx src/routes/admin.soak-report.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-soak-report-error-visibility.md`
- `reports/codex-implementation.md`

## Remaining risks

- The contract requested manual `/admin` smoke checks against a live or mocked backend and direct `/admin/soak-report` navigation verification. Those browser/backend validations were not executable from this workspace, so final UI confirmation remains manual.
- The component test imports `AdminPage` directly from the route file, which produces a TanStack route code-splitting warning during test execution. The production build still completed successfully.
- The related `fetchAdminHealth()` non-auth failure semantics remain unchanged by design and can still present as `denied`; that issue was explicitly left out of scope by the contract.

## Any contract ambiguities resolved during implementation

- I applied the smallest safe interpretation of "failures surface explicitly" as: promote initial soak-report load failures into the shared `panelError` banner, add a visible failure label, and add a retry affordance. I did not widen scope into admin-health error semantics or route behavior changes.
- The contract called for a new `src/routes/admin.tsx` component test. Because TanStack route discovery treats files under `src/routes` as route files, I created `src/routes/-admin.test.tsx` so the test is excluded by the repo's configured `-` ignore prefix while still targeting the `admin.tsx` component behavior.
