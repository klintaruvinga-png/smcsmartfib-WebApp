# Bug Sweep Report - Pending Blueprints Plan Fallback

## Scope

- Runtime integrity surface: Plan page candidate visibility.
- Source-of-truth boundary: frontend display only; backend confirmation and execution gates remain authoritative.
- Files inspected/changed: `src/routes/-plan.page.tsx`, `src/routes/-plan.test.tsx`.

## Confirmed Issue

The Plan page previously derived `topCandidates` directly from canonical watchlist matches. When no active display signal matched the watchlist, the page rendered empty diagnostics even when `useDisplaySignals(boardSize)` had active global candidates available.

## Fix Summary

The Plan page now ranks the loaded display signal pool, prefers ranked watchlist candidates when any exist, and falls back to the ranked global candidate pool only when there are no active watchlist candidates. Fallback rendering is explicitly labelled with `Fallback top list`.

## Runtime Guards Preserved

- `PlanCandidateCard` still owns execution gating and warning text.
- Fallback candidates are not marked backend-confirmed by the frontend.
- Pending/watch/no-plan candidates remain visible but non-executable unless existing backend-confirmed plan guards pass.
- Settings/backend URL loading guards still short-circuit candidate rendering.
- `/ladders` malformed response diagnostics remain in the empty-data branch.

## Regression Checks

- `npm test -- src/routes/-plan.test.tsx` was attempted; the repository has no `test` script.
- `npx vitest run src/routes/-plan.test.tsx` passed: 1 file, 27 tests.
- `npm run build` passed for client and SSR builds.

## Manual Verification Still Required

- Live backend snapshot where watchlist has active matches: watchlist candidates render first.
- Live backend snapshot where watchlist has no active matches but `/live-signals` has candidates: fallback cards render with `Fallback top list`.
- Live backend snapshot with no display signals: empty diagnostics render.
- One polling cycle where Arbiter/backend returns newer or better candidates: existing refetch path replaces fallback display.
