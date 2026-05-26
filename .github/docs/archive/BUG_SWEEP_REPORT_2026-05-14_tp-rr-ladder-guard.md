# Bug Sweep Report: TP/RR ladder completeness guard

## Scope

- Date: 2026-05-14
- Surface: `src/routes/plan.tsx`
- Issue class: runtime integrity / backend-dashboard truth / execution gating

## Verified defect

The plan page previously enabled `Send to execution` whenever `top.backendConfirmed` was true. A backend-confirmed ladder with missing `tps.tp2`, `tps.tp3`, `rr.tp2`, or `rr.tp3` could therefore render partial target truth and still pass the execution gate.

## Guard implemented

- Added a plan completeness check for `tps.tp2`, `tps.tp3`, `rr.tp1`, `rr.tp2`, and `rr.tp3`.
- Added a warning banner when the backend ladder is partial.
- Extended the existing execution gate from `!top.backendConfirmed` to `!top.backendConfirmed || planIncomplete`.
- Preserved all existing backend-authority and stale-data protections.

## Sweep findings

- Confirmed: no frontend TP or R:R calculation was introduced.
- Confirmed: divergence warning behavior is unchanged.
- Confirmed: `plan.stops?.e{n} ?? plan.sl` fallback remains intact.
- Confirmed: the patch does not widen API contracts, query keys, or source-of-truth boundaries.

## Validation run

- `npx vitest run src/routes/-plan.test.tsx`
- `npx eslint src/routes/plan.tsx src/routes/-plan.test.tsx src/routes/-plan.utils.ts`

## Repo-level noise observed

- `npx vitest run` fails for pre-existing reasons outside this patch:
  - DOM tests such as `src/routes/-admin.test.tsx` run without a jsdom environment.
  - legacy/archive files are discovered as tests and report `No test suite found`.
- `npm run lint` fails for pre-existing formatting drift outside this patch, including unrelated files such as `src/hooks/useTickFlash.ts`, `src/routes/-charts.test.ts`, and existing line-ending issues in other tracked files.

## Residual risks

- The authoritative backend `/ladders` contract is out of repo and still needs to publish complete three-stage ladders.
- This patch blocks incomplete ladders in the UI, but it cannot repair missing backend TP/RR values.
- Browser screenshot artifacts were not captured because the required in-app browser control surface was not exposed in this session.
