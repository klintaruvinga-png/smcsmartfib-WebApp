# Bug Sweep Report - 2026-05-29 - SMC Intake Front-End Lot Sizing 0.0 Lots

## Overview

Focused sweep of the backend-dashboard execution-readiness surface for staged lot sizes:

- backend-authored `plan.lotSize` consumption on the plan page
- frontend execution gating for `/user/execute-signals`
- non-executable ladder display state when backend stages are below the backend queue minimum

## Findings

- `1` confirmed frontend integrity defect fixed: the plan card could render backend-authored sub-`0.01` lots as executable-looking labels and leave execution enabled even though the backend queue path would skip those stages.
- `0` confirmed backend-authority regressions introduced. The frontend still does not compute, floor, or override lot sizes.
- `0` confirmed API contract regressions introduced. The execution request shape remains `{ signalIds }`.
- `1` confirmed regression gap closed: the plan page now has explicit coverage for backend-confirmed ladders containing `0.0` and sub-`0.01` stage lots.

## Evidence

- `npx vitest run src/routes/-plan.test.tsx` -> PASS (`18/18`)
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` -> PASS
- DOM capture artifact -> `reports/plan-card-non-executable-stage-lot-dom-2026-05-29.html`

Observed frontend contract after the patch:

- `lotSize.e1 = 0` renders as `Below 0.01 lot`, not `0.00 lot`
- `lotSize.e3 = 0.009` renders as `Below 0.01 lot`, not `0.01 lot`
- the plan card warning states that backend stage lots are non-executable below `0.01`
- the `Send to execution` CTA is disabled while preserving the existing backend confirmation and TP/RR completeness gates
- the component still posts only `apiClient.postExecuteSignals({ signalIds: [signal.id] })`

## Recommendations

1. Keep client behavior display-only and gate-only for staged lots unless a separate approved contract changes backend risk math.
2. Re-run the plan-page regression and PHP queue-threshold regression together on any future staged-lot or execution-readiness change.
3. If backend policy changes from "skip sub-minimum stages" to another behavior, update the PHP authority path first and then re-audit the plan-card state against that threshold.
