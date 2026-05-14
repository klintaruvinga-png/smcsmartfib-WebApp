# Phase 0 Ladders Parity Audit

## Audit target

- Date: 2026-05-14
- Phase: 0
- Surface: dashboard plan execution guard for backend ladder parity

## Re-validated parity assumptions

- `TradePlan` shape remains unchanged.
- `rr.tp1`, `rr.tp2`, and `rr.tp3` remain backend-owned numeric ratios.
- The dashboard still renders backend-supplied `entries`, `sl`, `stops`, `tps`, `rr`, and `lotSize` directly.
- The new guard does not synthesize ladder truth; it only blocks execution when backend ladder truth is incomplete.

## Verified in-repo changes

- Complete ladders keep the existing render path and allow execution when `backendConfirmed === true`.
- Incomplete ladders now surface a warning and fail the execution gate.
- No Pine, MT5, or formula changes were made.

## Validation evidence

- `isTradePlanComplete(mockPlan) === true`
- `isTradePlanComplete()` returns `false` when:
  - `rr.tp2` and `rr.tp3` are zero
  - `tps.tp2` and `tps.tp3` are zero
  - all `rr` values are zero
- Render validation confirms the incomplete-plan warning appears and the execution button is disabled when backend ladder data is partial.

## Out-of-repo parity still required

- Backend `/ladders` must emit non-zero `tps.tp1`, `tps.tp2`, `tps.tp3`, `rr.tp1`, `rr.tp2`, and `rr.tp3`.
- Live backend responses still need parity verification against engine math and execution behavior.
- MT5/EA publication path was not inspectable in this repository.

## Audit outcome

Frontend parity safeguards are now stricter without changing ladder math ownership. Backend parity itself remains pending until the `/ladders` producer is corrected and re-validated in a live environment.
