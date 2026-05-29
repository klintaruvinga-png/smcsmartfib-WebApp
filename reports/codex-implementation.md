## Issue summary

Frontend plan cards treated backend-authored sub-minimum stage lots as normal lot labels and could leave execution enabled when the backend queue would skip one or more ladder legs below `0.01`.

## Root cause implemented

Implemented a frontend-only execution-readiness guard that recognizes backend-authored stage lots below the existing backend execution threshold, renders those stages as non-executable instead of valid lot labels, and blocks the execution CTA without changing backend sizing, routing, or payload authority.

## Exact files changed

- `src/routes/-plan.test.tsx`
- `src/routes/-plan.utils.ts`
- `src/components/PlanCard.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_smc-intake-front-end-lot-sizing-0-0-lots.md`
- `.github/migration/audits/phase-0-backend-dashboard-stage-lot-executability-parity-2026-05-29.md`
- `reports/plan-card-non-executable-stage-lot-dom-2026-05-29.html`
- `reports/codex-implementation.md`

## Tests run

- `npx vitest run src/routes/-plan.test.tsx`
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php`
- `npx vitest run src/routes/_plan-card-dom-capture.test.tsx` (artifact generation only; temporary harness removed after capture)

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_smc-intake-front-end-lot-sizing-0-0-lots.md`
- `.github/migration/audits/phase-0-backend-dashboard-stage-lot-executability-parity-2026-05-29.md`
- `reports/plan-card-non-executable-stage-lot-dom-2026-05-29.html`

## Remaining risks

The patch is validated in repo-local tests and DOM capture, but a running browser session against a seeded plan page still remains the last manual check for final visual placement and interaction behavior.

## Any contract ambiguities resolved during implementation

`reports/copilot-research.md` claimed a backend `0.01` floor and `1:2:3` weights, but `reports/codex-plan.md` and the code path showed the actionable defect is frontend handling of backend-authored sub-minimum lots. Applied the smaller safe interpretation: frontend gating and display-state only, with no backend risk-model changes.
