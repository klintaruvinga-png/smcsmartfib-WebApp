# Bug Sweep Report: admin baseline checkpoint clarity

## Date

- 2026-05-12

## Issue

- The `/admin` soak workspace stored baseline and checkpoint snapshots correctly, but the rendered card list did not make their different roles obvious enough during quick soak scans.

## Confirmed root cause

- `src/routes/admin.tsx` rendered the saved baseline snapshot and later checkpoint snapshots through the same `CheckpointCard` presentation with only minor title text differences.
- The checkpoint area did not separate the immutable baseline reference from additive checkpoint history with a visible section boundary.
- No backend, API, or type ambiguity was found. The defect was limited to presentation clarity.

## Files reviewed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `src/types/sniper.ts`
- `reports/copilot-research.md`
- `reports/codex-plan.md`

## Patch applied

- Split the saved snapshot display into explicit `Baseline Snapshot` and `Checkpoint History` sections inside `src/routes/admin.tsx`.
- Added a neutral `BASELINE` badge and lock indicator to the baseline card to reinforce immutability without implying signal status.
- Added a neutral `CHECKPOINT` badge to periodic checkpoint cards and kept all baseline/checkpoint save paths unchanged.
- Added route regression coverage for the new baseline/checkpoint section markers and lock indicator in `src/routes/-admin.test.tsx`.

## Validation run

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Residual risk

- Manual in-browser `/admin` visual verification could not be executed from this session because the required browser runtime tool was not exposed, so final confirmation of spacing, contrast, and scanability still depends on a live operator check.
- This patch intentionally does not change any baseline or checkpoint mutation logic, so any future operator confusion outside the saved snapshot display surface would need a separate contract.
