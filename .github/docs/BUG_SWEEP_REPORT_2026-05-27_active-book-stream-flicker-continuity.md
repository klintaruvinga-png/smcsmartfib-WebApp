# Bug Sweep Report - 2026-05-27 - Active Book Stream Flicker Continuity

## Overview

- Scope: frontend trade-telemetry continuity across Active Book, Pending Orders, and Analytics.
- Confirmed defect: transient empty or partial `/positions` and `/orders` polls were rendered immediately as authoritative UI empties, causing flicker and false disappearance between refreshes.
- Fix status: patched with a shared continuity reconciler in `src/lib/tradeContinuity.ts` and a shared `useStableUserTrades()` wrapper in `src/hooks/useSniperData.ts`.
- Parity impact: none. Backend telemetry remains authoritative; the frontend only carries the last known rows for one poll-length grace window and marks them `stale`.

## Findings

### Confirmed fixed

1. One transient empty trade poll no longer clears visible positions or orders immediately.
   Evidence:

- `src/lib/tradeContinuity.test.ts` proves prior rows are preserved and marked `stale` for one grace window when the next payload is empty.
- `src/routes/-book.page.test.tsx` and `src/routes/-orders.page.test.tsx` prove the affected routes keep rendering carried-forward rows instead of falling through to the empty-state copy.

2. Partial trade payloads now reconcile per row id instead of replacing the whole visible book.
   Evidence:

- `src/lib/tradeContinuity.test.ts` proves a missing row survives one partial poll by stable `id` and returns to `live` when the backend row reappears.

3. Carried-forward rows no longer look fully live.
   Evidence:

- `src/routes/-book.page.tsx`, `src/routes/orders.tsx`, and `src/routes/analytics.tsx` now surface `stale` state from the continuity layer in their freshness badges and warnings.
- `src/routes/-analytics.page.test.tsx` proves floating P/L reflects stale trade continuity rather than a live badge during a carried-forward gap.

4. Legitimate closures still clear after the grace window expires.
   Evidence:

- `src/lib/tradeContinuity.test.ts` proves missing rows are dropped once the elapsed time reaches the grace threshold instead of persisting indefinitely.

### Residual risk

1. Live backend timing still needs manual confirmation.
   Details:

- The repo tests prove the frontend continuity logic, but they do not replay the exact MT5 or backend timing gaps seen in production.
- Manual validation is still required to confirm one poll interval is the right smoothing window for real closes versus transient backend gaps.

2. Existing TanStack Router code-splitting warnings remain unchanged.
   Details:

- Vitest logs the pre-existing route-export warnings for `AnalyticsPage` and `OrdersPage`.
- This patch intentionally does not widen scope into route-file export refactors because they are unrelated to the trade continuity defect.

## Recommendations

1. Keep the trade continuity grace window tied to the active polling interval unless production evidence proves a longer or shorter backend gap is legitimate.
2. Treat any future request to extend the grace window as a backend-authority change and require live evidence before widening it.
3. Run one manual live verification cycle with an open position, a pending order, and a real close event before merge approval.
