# Phase 0 Dashboard Parity Audit - Pending Blueprints Plan Fallback

## Scope

This audit covers Dashboard-JS plan candidate display parity with existing backend contracts for the pending blueprints fallback patch.

## Dashboard-to-Backend Contract

- `useDisplaySignals(boardSize)` still consumes the existing `LiveSignalsResponse` shape.
- No `/live-signals`, `/ladders`, or `/user/execute-signals` response contract was changed.
- No new frontend persistence, push channel, or local source-of-truth state was introduced.

## Watchlist Parity

- `useCanonicalWatchlist()` remains the source for watchlist membership.
- Watchlist candidates remain preferred whenever at least one active candidate matches the canonical watchlist.
- Global fallback is display-only and activates only when the ranked watchlist candidate list is empty.
- Existing watchlist invalidation/refetch behavior is unchanged.

## Backend Authority

- Backend-confirmed status is read from existing signal data and is never inferred or upgraded by the frontend.
- `PlanCandidateCard` remains responsible for execution safety, incomplete-plan warnings, pending/watch blueprint warnings, and disabled execution states.
- Fallback candidates with no matching ladder continue to render as awaiting-blueprint cards.

## Pine Parity

No Pine formulas or trading calculations were changed. Pine replay validation is not required for this frontend-only display gate patch.

## Validation Evidence

- `npx vitest run src/routes/-plan.test.tsx` passed: 27 tests.
- `npm run build` passed for client and SSR builds.
- `npm test -- src/routes/-plan.test.tsx` is not runnable in this repository because `package.json` has no `test` script.

## Residual Risk

Live operator verification is still required to confirm that existing polling replaces fallback candidates when Arbiter/backend-confirmed blueprints arrive through the current endpoints.
