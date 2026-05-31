# Issue summary

Plan page candidate rendering was gated to canonical watchlist matches only. When active display signals existed outside the watchlist, the page rendered the empty watchlist diagnostics instead of the required next-best blueprint list.

# Root cause implemented

Implemented a frontend-only watchlist-preferred/global-fallback selection path in `src/routes/-plan.page.tsx`. Candidates are ranked from the already-loaded display signal pool, watchlist candidates remain preferred when present, and the ranked global pool is used only when no watchlist candidates are active.

# Exact files changed

- `src/routes/-plan.page.tsx` — added local candidate ranking helpers, replaced `topCandidates = watchlistCandidates` with watchlist-first/global-fallback selection sliced to `boardSize`, and added a compact `Fallback top list` label for fallback rendering.
- `src/routes/-plan.test.tsx` — updated mocks from `useLiveSignals` to `useDisplaySignals`, preserved watchlist preference coverage, and added fallback, true-empty, and board-size regression tests.
- `reports/codex-implementation.md` — added this implementation summary required by the contract.
- `reports/codex-implementation.meta.json` — restored required pipeline metadata with the current plan hash.

# Tests run

- `npm test -- src/routes/-plan.test.tsx` — failed because `package.json` has no `test` script.
- `npx vitest run src/routes/-plan.test.tsx` — passed, 1 test file and 27 tests.
- `npm run build` — passed for client and SSR builds; Vite reported existing large chunk warnings.
- `npm run validate:impl` — passed.

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-06-01_pending-blueprints-plan-fallback.md`
- `.github/migration/audits/phase-0-dashboard-parity-2026-06-01.md`
- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`

# Remaining risks

Manual live verification still needs a backend snapshot where canonical watchlist symbols have no active candidates while `/live-signals` returns active display signals. Arbiter replacement remains dependent on the existing polling/refetch path; no backend or API contract was changed.

# Any contract ambiguities resolved during implementation

The contract asked to run a failing test before implementation, but the critical execution order also required writing this summary immediately after code changes and before validation. I followed the critical order and deferred all validation until after this file was written.
