# Issue summary

Phase 4 soak checkpoints were blocked on `/admin` because `PHASE_4_30_DAY` was configured as a fixed template with zero checkpoint metadata while the page only exposes duration/checkpoint controls for `CUSTOM`. With a baseline present, Phase 4 therefore fell into the same zero-label warning path as an invalid custom schedule and left the checkpoint action disabled.

# Root cause implemented

Updated the fixed Phase 4 soak template in `src/types/sniper.ts` to carry the approved weekly/final 30-day checkpoint cadence instead of zero labels, which restores a non-empty `derivedCheckpointLabels` path without changing backend contracts, stale-data protections, or `CUSTOM` validation guards.

# Exact files changed

- `src/types/sniper.ts`
- `src/routes/-admin.test.tsx`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run src/routes/-admin.test.tsx` - PASS (`28/28`)
- `npm run build` - PASS

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-28_phase4-soak-checkpoint-template.md`

# Remaining risks

The approved repo artifact defines the Phase 4 cadence as three weekly checkpoints plus the final 30-day checkpoint, but it does not prescribe exact UI label strings. This patch maps that cadence to `T+7d`, `T+14d`, `T+21d`, and `T+30d` to preserve the existing `T+…` label convention; human review should confirm that wording is acceptable for live operator evidence. Manual authenticated `/admin` verification against a baseline-backed Phase 4 soak is still pending from this workspace.

# Any contract ambiguities resolved during implementation

The contract required an approved existing Phase 4 checkpoint schedule and prohibited inventing cadence. The smallest safe interpretation was taken from `.github/migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md`, which explicitly schedules weekly checkpoint snapshots #1-#3 and a final 30-day checkpoint. Because that artifact defines cadence but not exact UI labels, the implementation encoded those milestones as `T+7d`, `T+14d`, `T+21d`, and `T+30d`.
