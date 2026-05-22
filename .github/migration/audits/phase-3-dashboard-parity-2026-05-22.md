# Phase 3 Dashboard Parity Audit

Date: 2026-05-22
Engine: Dashboard admin soak workspace
Scope: Phase 3 soak workspace parity against the existing generic soak-report backend contract

## Template parity

- Default workspace template is now `PHASE_3_STABILITY_72H`.
- Phase 3 workspace heading renders `Phase 3 - Stability Soak`.
- Phase 3 baseline heading renders `Phase 3 - Stability Soak - Operator Baseline`.
- Phase 3 checkpoint labels use the contract fallback from repository evidence: `T+24h`, `T+48h`, `T+72h`.
- Phase 0 workspace still reproduces the original `T+12h`, `T+24h`, `T+48h`, `T+72h` schedule when explicitly selected.
- CUSTOM schedules derive evenly spaced checkpoint labels from operator input without changing backend types.

## Backend authority parity

- `SoakReport`, `SoakCheckpointRow`, and `SoakEvidenceType` were left unchanged.
- `fetchSoakReport`, `createSoakCheckpoint`, and `upsertSoakEvidence` call sites remain in place with no new endpoint dependencies.
- Soak template selection is intentionally UI-local only; no frontend-only signal truth or forced backend state was introduced.

## Validation results

- `npx tsc --noEmit --pretty false`: passed
- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`: passed (15/15)

## Pending manual parity checks

- `/admin` browser verification of selector placement, Phase 0 reproduction, and Phase 3 default rendering is still pending because the in-app browser tool was not available in this session.
- Live backend confirmation that a captured Phase 3 baseline is reflected with Phase 3-specific labeling is pending. The current backend/report schema does not expose a dedicated soak-template field, so this can only be completed after human runtime verification or a later contract change.

## Known parity limits

- `PHASE3_SOAK_WINDOW_TASKS.md` does not define explicit checkpoint names, so the approved fallback labels were used.
- Markdown export still uses the legacy `Phase 0 Soak Report` title; this audit covers dashboard parity only, not export-format parity.
