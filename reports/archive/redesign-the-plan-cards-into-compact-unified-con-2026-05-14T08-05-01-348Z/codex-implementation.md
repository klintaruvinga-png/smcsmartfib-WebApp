# Issue summary

The plan page was still built around a single fallback-selected hero candidate. This patch converts it to a canonical-watchlist-scoped top-3 plan surface, rendered as compact unified cards and ranked by the existing verdict metric without changing backend authority, ladder math, or execution wiring.

# Root cause implemented

The route resolved one winner through successive `find()` calls after the initial verdict sort, so it could not support a stable ranked multi-card layout. I replaced that winner-only selection with a stable ranked candidate array over the existing deduplicated signal set, then filtered to canonical watchlist members and renderable ladder-backed plans only.

# Exact files changed

- `src/routes/plan.tsx`
- `src/components/PlanCard.tsx`
- `src/routes/-plan.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_plan-card-top3-watchlist.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run src/routes/-plan.test.tsx`
- `npx eslint src/routes/plan.tsx src/components/PlanCard.tsx src/routes/-plan.test.tsx`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_plan-card-top3-watchlist.md`
- `reports/codex-implementation.md`
- Parity audit not generated. The contract marked this change as dashboard render-layer only with no Pine or backend parity re-validation required.

# Remaining risks

- I could not complete an in-app browser visual pass in this session because the browser automation path was not exposed through the available tools.
- The route test harness still depends on exporting `PlanPage` from the route file, which causes a TanStack Router test-time code-splitting warning only. Production build validation passed.

# Any contract ambiguities resolved during implementation

- `useCanonicalWatchlist()` was not already wired in `plan.tsx`; I imported the existing hook and mirrored the semantics already used in `signals.tsx`.
- The card markup exceeded the contract's inline threshold, so I extracted it to `src/components/PlanCard.tsx`.
- The available data shape did not expose a separate dedicated "family pill" field, so the header uses existing `executionSource` and `ladder.e1.family` values when present, with no fabricated fallback values.
