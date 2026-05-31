# Phase 0 Sniper Parity Audit: Watch Blueprint

Date: 2026-05-31
Issue: SMC Intake - Watch blueprint PATCH

## Scope

- Backend `TradePlan.source` emission.
- Frontend and SDK `TradePlan.source` type contracts.
- Dashboard ranking and rendering for backend-authored ladder plans.

## Formula Parity

Diff inspection confirms no Pine formulas, MT5 formulas, entry ratios, stop ratios, target ratios, lot sizing math, risk conversion, or `build_trade_plan()` calculations were changed.

## Source Literal Parity

- Backend may now emit `watch-blueprint` only for live, unblocked, non-lifecycle-suppressed WATCH signals.
- App `TradePlan.source` accepts `frontend-preview`, `backend-blueprint`, `pending-blueprint`, and `watch-blueprint`.
- SDK `TradePlan.source` accepts `frontend-preview`, `backend-blueprint`, `pending-blueprint`, and `watch-blueprint`.
- Plan card rendering recognizes `pending-blueprint` and `watch-blueprint` as distinct non-executable blueprint states.
- Plan ranking orders same-verdict candidates by confirmed backend plan quality, backend blueprint, pending blueprint, watch blueprint, then no plan.

## Backend Authority

No frontend-only plan synthesis was added. Watch blueprints are backend-authored response payloads only. Execution remains gated by `backendConfirmed`, plan completeness, and executable stage lots.

## Result

Parity re-validation passed for the source-literal contract and confirmed that calculation formulas were untouched.
