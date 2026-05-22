# Bug Sweep Report

Date: 2026-05-22
Scope: Admin soak workspace template selection, checkpoint schedule rendering, and backend/dashboard authority preservation.

## Integrity checks performed

- Verified the admin soak workspace no longer hardcodes the retired Phase 0 72h copy in its primary heading, baseline header, or timeline labels.
- Verified the soak type selector is component-local and does not add new backend calls, URL state, or localStorage persistence.
- Verified baseline evidence save flow, checkpoint save flow, soak report refresh, and auth redirect logic were left in place.
- Verified named templates reproduce the expected fixed schedules and CUSTOM generates evenly spaced checkpoint labels from operator-supplied duration/count.
- Verified template switches clear unsaved baseline/checkpoint form state without removing saved soak report history.

## Findings

- Confirmed fixed: `/admin` now defaults to a Phase 3 stability soak template instead of presenting the obsolete Phase 0 workspace unconditionally.
- Confirmed fixed: operators can switch between Phase 0, Phase 3, and CUSTOM soak schedules without widening the `SoakReport` backend contract.
- Confirmed fixed: Phase 0 labels still render exactly as `T+12h`, `T+24h`, `T+48h`, `T+72h` when the Phase 0 template is selected.
- Confirmed fixed: CUSTOM mode exposes duration and checkpoint-count controls and derives the expected label sequence, including the `48h / 3 checkpoints -> T+16h, T+32h, T+48h` case.
- Confirmed preserved: soak report loading, retry behavior, checkpoint history rendering, and backend-owned health status remain covered by the route test suite.

## Residual risks

- The current backend checkpoint/report schema has no dedicated soak-template field, so the selected soak type remains UI-local by design. Live backend parity for a persisted Phase 3 template label could not be verified from this workspace without widening the API contract.
- Manual `/admin` browser verification was not completed because the in-app browser tooling was not exposed in this session.
- `buildSoakReportMarkdown()` still emits a static `Phase 0 Soak Report` title. Export format changes were outside this contract, so that legacy export heading remains a follow-up risk.
