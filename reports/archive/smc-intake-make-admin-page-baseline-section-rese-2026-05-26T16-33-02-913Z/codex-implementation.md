# Issue summary

Admin soak baseline flow was hardcoded around Phase 0 and Phase 3 templates and treated baseline capture as a single-shot action. This blocked Phase 4 30-day soak selection and prevented operators from re-arming baseline capture for a new soak cycle from `/admin`.

# Root cause implemented

Added `PHASE_4_30_DAY` to the typed soak registry and preserved that value through report inference and baseline hydration. Replaced the baseline lock with a local reset state that unlocks a new baseline capture without deleting the persisted prior baseline checkpoint from backend-owned report data.

# Exact files changed

- `src/types/sniper.ts`: added `PHASE_4_30_DAY`, extended `SoakTemplateConfig` with `durationDays` and `symbols`, and registered the Phase 4 30-day live soak template.
- `src/routes/admin.tsx`: added Phase 4 inference and hydration handling, exported the two pure helpers for direct test coverage, and introduced the admin-only local reset/new-soak baseline unlock flow.
- `src/routes/-admin.test.tsx`: added Phase 4 picker, inference, hydration, reset-render, reset-absence, and reset-unlock coverage.

# Tests run

- `npx vitest run src/routes/-admin.test.tsx` - passed (24 tests).
- `npm run build` - passed.
- `npx tsc --noEmit` - failed in existing `vite.config.ts` typing (`test` property rejected by `@lovable.dev/vite-tanstack-config` options). This failure is outside the patched files.

# Reports generated

- `reports/codex-implementation.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-26_admin-phase4-soak-baseline-reset.md`
- `.github/migration/audits/phase-4-dashboard-parity-2026-05-26.md`

# Remaining risks

Backend soak evidence acceptance for `PHASE_4_30_DAY` remains an external dependency. If the backend rejects that string, the first live Phase 4 baseline submission will fail at the API layer even though the admin UI now supports the flow. Phase 4 checkpoint schedule labels also remain intentionally unset pending operator confirmation.

# Any contract ambiguities resolved during implementation

- `SoakTemplateConfig` did not previously include `durationDays` or `symbols`; I extended the existing shape consistently across all templates instead of special-casing Phase 4.
- The contract requires Phase 4 support without authorizing new checkpoint schedule labels, so the Phase 4 template uses `defaultDurationHours=720` with `defaultCheckpointCount=0` and empty `checkpointLabels`.
- The reset contract required a new baseline capture path without deleting backend baseline data. I implemented reset as local UI state that unlocks capture while preserving the previous baseline checkpoint in view until a new baseline is submitted or reset is cancelled.
