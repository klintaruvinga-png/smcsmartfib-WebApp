# Bug Sweep Report: Phase 4 Soak Checkpoint Template

**Date**: 2026-05-28  
**Scope**: Admin soak workspace Phase 4 checkpoint scheduling, button enablement, and preserved custom validation behavior  
**Issue type**: Runtime workflow blocker / operator evidence path

## Confirmed findings

- `PHASE_4_30_DAY` was configured with `defaultCheckpointCount: 0` and `checkpointLabels: []` in `src/types/sniper.ts`.
- `/admin` only exposes duration and checkpoint-count controls for `CUSTOM`, so Phase 4 had no operator-facing recovery path once selected or rehydrated.
- `src/routes/admin.tsx` disables checkpoint save when `derivedCheckpointLabels.length === 0`, which pushed Phase 4 into the same warning state as an invalid custom schedule.

## Fix applied

- Updated `src/types/sniper.ts` so `PHASE_4_30_DAY` now carries four fixed checkpoint labels matching the approved repo cadence source: weekly milestones plus the final 30-day checkpoint.
- Preserved backend authority, existing checkpoint API usage, baseline-first gating, and the invalid-custom guard.
- Added route regression coverage in `src/routes/-admin.test.tsx` for:
  - Phase 4 label rendering
  - Phase 4 checkpoint button enablement after baseline exists
  - Continued blocking of invalid custom schedules until duration and checkpoint count are supplied

## Cadence source

- Approved source: `.github/migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md`
- Source-defined cadence: weekly checkpoint snapshots #1-#3 and final 30-day checkpoint
- UI label interpretation used by this patch: `T+7d`, `T+14d`, `T+21d`, `T+30d`

## Validation

- `npx vitest run src/routes/-admin.test.tsx` - PASS (`28/28`)
- `npm run build` - PASS

## Preserved protections

- Baseline must still exist before any checkpoint save is enabled.
- `CUSTOM` still requires `durationHours >= 1` and `checkpointCount >= 1` before checkpoint labels exist.
- No backend contract, stale-data guard, or Pine/MT5 parity surface was changed.

## Remaining risks

- The approved artifact defines cadence but not exact operator-facing label text, so the `T+7d` / `T+14d` / `T+21d` / `T+30d` wording still needs human confirmation against the live Phase 4 operating procedure.
- Manual authenticated `/admin` verification against a baseline-backed Phase 4 soak remains pending in a live or staging environment.
