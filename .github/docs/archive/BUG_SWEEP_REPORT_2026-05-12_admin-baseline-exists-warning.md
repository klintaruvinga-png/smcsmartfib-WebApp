# Bug Sweep Report: admin baseline exists warning

## Date

- 2026-05-12

## Issue

- The `/admin` soak workspace exposed `baseline_checkpoint` correctly from the backend, but it did not present an explicit operator-facing warning that an existing baseline must not be replaced.

## Confirmed root cause

- `src/routes/admin.tsx` already received the authoritative `baseline_checkpoint` value from `/admin/soak-report`.
- The route only surfaced a positive `Baseline captured` state, which was too weak for a Phase 0 soak governance control.
- The baseline submit path did not present an explicit locked capture state after a baseline existed.

## Files reviewed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `reports/copilot-research.md`
- `reports/codex-plan.md`

## Patch applied

- Added an explicit warning panel in `src/routes/admin.tsx` that renders only when `baseline_checkpoint` is non-null.
- Added a locked baseline capture button with explicit `title` and `aria-label` messaging when a baseline already exists.
- Preserved baseline evidence updates by keeping a separate `Update Baseline Evidence` submit action available after baseline capture.
- Added route regression coverage for warning presence, warning absence, locked capture state, and the preserved update-evidence action in `src/routes/-admin.test.tsx`.

## Validation run

- `npx vitest run src/routes/-admin.test.tsx --environment jsdom`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Residual risk

- Live authenticated `/admin` parity was not visually confirmed in-browser from this session because the required browser runtime tool was not exposed and no authenticated admin browser session was available in the workspace.
- The patch intentionally does not change backend baseline persistence behavior or add backend rejection for a second baseline capture attempt.
