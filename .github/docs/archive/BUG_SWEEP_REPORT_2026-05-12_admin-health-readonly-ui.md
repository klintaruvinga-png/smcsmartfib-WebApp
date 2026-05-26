# Bug Sweep Report - 2026-05-12

## Scope

- Issue: admin health display looked editable even though the backend already owned the truth
- PR: #140
- Surface: `src/routes/admin.tsx`

## Confirmed Issue

- Backend health values were already fetched from `fetchAdminHealth()` and rendered without local recomputation.
- The runtime defect was contract clarity: backend-owned diagnostics and operator-editable soak forms lived in the same visual flow, which could imply frontend edit authority over health state.

## Root Cause

- The admin route had no explicit read-only wrapper, no visible backend-ownership copy, and no stable selector marking the health surface as a separate backend-driven section.

## Patch Applied

- Added a dedicated `data-section="backend-health-readonly"` wrapper around all backend health cards and timestamps.
- Added visible `Backend Health Status` and `Read-only - values are owned and updated by the backend.` labeling.
- Added an `Operator Evidence - enter metadata only` banner before the editable soak forms.
- Added route tests covering the read-only section contract and the existing admin-health failure surface.

## Validation

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Runtime Integrity Result

- Backend authority preserved: no `/admin/health` fetch path, payload mapping, or local mirror state was introduced.
- Stale-data protections preserved: the patch does not change health refresh timing, caching, or fallback behavior.
- Operator clarity improved: the UI now explicitly distinguishes backend status from operator-entered metadata.

## Remaining Risks

- Live authenticated browser verification against `/admin` was not executable in this session because the browser runtime tool was unavailable.
- The admin route still depends on manual operator review to confirm the copy and visual separation are sufficiently unambiguous in production context.
