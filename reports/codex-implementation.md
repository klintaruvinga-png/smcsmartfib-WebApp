## Issue summary

Updated the `/admin` soak workspace so operators can switch between Phase 0, Phase 3, and custom soak templates instead of being locked to the retired Phase 0 72h workflow.

## Root cause implemented

The admin render layer hardcoded Phase 0 copy and checkpoint labels even though the underlying soak report types were generic. The patch adds a typed soak template registry, drives the workspace UI from the selected template, and generates custom checkpoint labels locally without changing backend ownership.

## Exact files changed

- `src/types/sniper.ts`
- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`

## Tests run

- `npx tsc --noEmit --pretty false`
- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-22_admin-soak-template-selector.md`
- `.github/migration/audits/phase-3-dashboard-parity-2026-05-22.md`

## Remaining risks

The repository does not expose any backend field or checkpoint API parameter for persisting a soak template label. The selector therefore remains component-local, which matches the contract non-goals, but backend endpoint parity can only be fully verified after manual runtime testing. Manual `/admin` browser verification was not completed because browser tooling was unavailable in this session. Markdown export still uses the legacy `Phase 0 Soak Report` title because export-format changes were outside this patch scope.

## Any contract ambiguities resolved during implementation

`PHASE3_SOAK_WINDOW_TASKS.md` does not define explicit Phase 3 checkpoint names, so the contract fallback was used: `T+24h`, `T+48h`, `T+72h`. The contract also references passing a checkpoint identifier string into backend checkpoint saves, but the existing checkpoint API only accepts `checkpointType` and `operatorNotes`; the smallest safe implementation kept backend calls unchanged and applied the template selection at the UI layer only.
