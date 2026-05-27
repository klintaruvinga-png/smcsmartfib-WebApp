## Issue summary

Active Book, Pending Orders, and Analytics were rendering the latest `user-trades` payload as immediately authoritative, so a one-poll empty or partial backend response caused visible trade rows to disappear and then reappear on the next good poll.

## Root cause implemented

Added a frontend continuity layer around raw trade telemetry that preserves last known positions and orders for one poll-length grace window, reconciles by stable row `id`, reuses unchanged row objects, downgrades carried-forward rows to `stale`, and expires them deterministically once the grace window is exceeded.

## Exact files changed

- `src/lib/tradeContinuity.ts` - added pure trade row reconciliation and continuity state handling.
- `src/lib/tradeContinuity.test.ts` - added deterministic continuity regression coverage.
- `src/hooks/useSniperData.ts` - added `useStableUserTrades()` wrapper over the existing raw trade query.
- `src/routes/-book.page.tsx` - switched Active Book to stable trade telemetry and surfaced stale carried rows in the freshness badge.
- `src/routes/orders.tsx` - switched Pending Orders to stable trade telemetry and surfaced stale carried rows in the freshness badge and warning line.
- `src/routes/analytics.tsx` - switched floating P/L inputs to stable trade telemetry and marks the stat stale when positions are carried forward.
- `src/routes/-book.page.test.tsx` - added route coverage for stale carried positions remaining visible.
- `src/routes/-orders.page.test.tsx` - added route coverage for stale carried orders remaining visible.
- `src/routes/-analytics.page.test.tsx` - added route coverage for stale carried positions affecting analytics state.

## Tests run

- `npx vitest run src/lib/tradeContinuity.test.ts src/routes/-book.page.test.tsx src/routes/-orders.page.test.tsx src/routes/-analytics.page.test.tsx`
- `npx eslint src/lib/tradeContinuity.ts src/lib/tradeContinuity.test.ts src/hooks/useSniperData.ts src/routes/-book.page.tsx src/routes/orders.tsx src/routes/analytics.tsx src/routes/-book.page.test.tsx src/routes/-orders.page.test.tsx src/routes/-analytics.page.test.tsx`
- `npm run validate:impl` pending final rerun after implementation metadata and workflow-state updates are written.

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-27_active-book-stream-flicker-continuity.md`
- No parity audit required by this contract.

## Remaining risks

Manual live verification is still required to confirm the chosen one-poll grace window smooths transient backend gaps without making legitimate closes linger longer than intended in production conditions.

## Any contract ambiguities resolved during implementation

Interpreted "short grace window tied to the current poll interval" as exactly one active polling interval (`pollMs`), which preserves one missed trade poll without weakening backend authority by carrying rows indefinitely.
