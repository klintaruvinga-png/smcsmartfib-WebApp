# Bug Sweep Report

## Scope

Issue: `/admin` soak baseline flow was hardcoded to Phase 0 / Phase 3 and could not be reset locally for a new soak cycle.

## Runtime integrity checks

- Verified Phase 4 soak type now has a typed registry entry and is selectable from the admin soak picker.
- Verified persisted `baseline.soak_type=PHASE_4_30_DAY` is preserved through both report inference and baseline form hydration.
- Verified baseline reset does not delete or clear backend-owned `baseline_checkpoint` data in the rendered admin state.
- Verified baseline capture remains locked by default when a persisted baseline exists and only unlocks after an explicit operator action.

## Stale-data / authority checks

- Backend remains the source of truth for `baseline_checkpoint`, checkpoints, and health payloads.
- Reset is local UI state only until a new baseline capture is submitted.
- Existing checkpoint creation and evidence upsert APIs were not renamed or bypassed.
- No frontend-only signal or parity truth was introduced.

## Validation evidence

- `npx vitest run src/routes/-admin.test.tsx` — PASS
- `npm run build` — PASS
- `npx tsc --noEmit` — FAIL in existing `vite.config.ts` config typing (`test` property not accepted by `@lovable.dev/vite-tanstack-config` options). This failure is outside the patched files.

## Residual risks

- First live Phase 4 baseline submission still depends on backend acceptance of `PHASE_4_30_DAY`.
- Phase 4 checkpoint schedule labels remain intentionally unset pending operator confirmation, so the Phase 4 template exposes duration and selection readiness without inventing milestone labels.
