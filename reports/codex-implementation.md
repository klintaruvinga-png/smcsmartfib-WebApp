# Issue summary

The `/admin` soak workspace already preserved baseline and checkpoint snapshots correctly, but the saved snapshot display did not make the baseline-versus-checkpoint distinction clear enough during quick operator scans.

## Root cause implemented

`src/routes/admin.tsx` rendered baseline and checkpoint snapshots through the same visual card pattern with only light title text differences and no strong section split. The implemented fix keeps the existing save logic intact and only strengthens presentation with explicit grouping, neutral badges, and a baseline lock indicator.

## Exact files changed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-baseline-checkpoint-clarity.md`
- `reports/codex-implementation.md`

## Tests run

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-12_admin-baseline-checkpoint-clarity.md`
- No parity audit required by the contract for this render-only patch.

## Remaining risks

- Manual in-browser `/admin` visual verification could not be executed from this session because the required browser runtime tool was not exposed.
- Operator soak-environment confirmation of final scanability remains pending after deployment.

## Any contract ambiguities resolved during implementation

- The contract required stronger baseline/checkpoint distinction but forbade prop-contract churn. Smallest safe resolution: keep the existing shared `CheckpointCard` API and derive the visual treatment from `checkpoint.checkpoint_type` while adding section boundaries at the render site.
