# Bug Sweep Report - 2026-05-14

## Scope

- Issue: compact unified plan cards with top-3 canonical watchlist candidates ranked by the existing verdict metric
- Affected runtime surface: `src/routes/plan.tsx`
- Backend authority impact: none intended

## Sweep Checks

- Verified canonical watchlist scoping uses `useCanonicalWatchlist()` and does not invent new watchlist semantics.
- Verified candidate ranking remains verdict-led, with tie breaks in this order: backend confirmed, `READY`, has plan, stable original order.
- Verified candidates without ladder/plan objects are excluded from rendered cards.
- Verified incomplete plan warnings still render and execution stays blocked for partial backend plans.
- Verified execution CTA still calls `apiClient.postExecuteSignals({ signalIds: [signal.id] })` against the existing `/user/execute-signals` flow.
- Verified no verdict generation, ladder math, API contracts, or stale-data guards were changed.

## Validation Run

- `npx vitest run src/routes/-plan.test.tsx`
- `npx eslint src/routes/plan.tsx src/components/PlanCard.tsx src/routes/-plan.test.tsx`
- `npm run build`

## Findings

- No backend-authority regressions found in the patched route logic.
- No stale-data bypasses or frontend-only signal-truth paths were introduced.
- No execution wiring regressions were found in the code path.

## Residual Risks

- Visual density and spacing were not manually browser-verified in this session because the in-app browser automation path was not available.
- The route test harness still requires `PlanPage` to stay exported from the route file, which produces a TanStack Router test-time code-splitting warning only; build output remained green.

## Recommendation

- Safe to review as a UI-layer patch.
- Human review should confirm real-session visual fidelity and that the top 3 candidates match expected live watchlist ranking.
