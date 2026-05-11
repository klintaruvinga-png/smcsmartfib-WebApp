# Bug Sweep Report: admin soak report error visibility

## Date

- 2026-05-12

## Issue

- Initial `/admin/soak-report` load failures inside `src/routes/admin.tsx` only surfaced inside the soak panel body. The shared `panelError` banner stayed empty, which made first-load failures materially less visible than manual refresh failures.

## Confirmed root cause

- The mount-time `fetchSoakReport()` effect set `soakState` to `{ kind: "error", message }` for non-auth failures but did not also call `setPanelError(message)`.
- The `soakState.kind === "error"` branch showed only the raw backend message and did not offer a retry control.
- `refreshSoakReport()` already promoted non-auth failures into both `soakState` and `panelError`, so the inconsistency was localized to the initial-load path.

## Files reviewed

- `src/routes/admin.tsx`
- `src/routes/admin.soak-report.tsx`
- `src/lib/api/sniperClient.ts`
- `src/lib/api/sniperClient.test.ts`

## Patch applied

- Promoted initial soak-report load failures into `panelError` in `src/routes/admin.tsx`.
- Hardened the soak error panel with an explicit `"Soak report failed to load."` label, preserved the raw backend error as secondary detail, and added a retry button wired to the existing `refreshSoakReport()` path.
- Documented the intentional `/admin/soak-report` redirect in `src/routes/admin.soak-report.tsx`.
- Added route component regression coverage for non-auth initial failure plus retry recovery, and for `AuthError` redirect behavior.

## Validation run

- `npx vitest run src/lib/api/sniperClient.test.ts src/routes/-admin.test.tsx --environment jsdom`
- `npx eslint src/routes/admin.tsx src/routes/admin.soak-report.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Residual risk

- The contract's manual `/admin` smoke checks against a live or mocked backend were not executed in-browser from this workspace, so final confirmation of the visible banner/retry flow in a running app still depends on manual UI verification.
- The component test requires a direct `AdminPage` export from the route file, which triggers a TanStack route code-splitting warning during test execution only. Runtime build output remained successful.
