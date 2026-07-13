# SMC SuperFIB - Codex Plan Hardening Request

### 1. Issue validation

- Confirmed
  - `src/routes/-plan.page.tsx` joins signals to ladders strictly by `signal.id === ladder.signalId`.
  - `compareRankedCandidates()` ranks candidates with `hasPlan: false` behind otherwise equivalent candidates with `hasPlan: true`.
  - `topCandidates` is sliced to 3 cards, so a candidate can disappear when its matching ladder is absent and three stronger ranked candidates remain.
  - `useLiveSignals()` and `useLadders()` poll independently from `src/hooks/useSniperData.ts`.
  - The cited route test path is stale: the actual route test file is `src/routes/-plan.test.tsx`, not `src/routes/-plan.page.test.tsx`.

- Likely
  - Signal ID volatility across candle boundaries can cause a temporary signal-to-ladder mismatch if `/live-signals` returns a new `id` before `/ladders` returns the matching `signalId`.
  - The safest frontend-only continuity patch is to keep prior successful query data visible when a query observer enters a pending state without current data.
  - TanStack Query v5 supports `placeholderData`, and this project uses `@tanstack/react-query` v5. The idiomatic v5 helper is `keepPreviousData`, exported by `@tanstack/react-query`.

- Unconfirmed
  - The report's primary claim that same-key background refetches return `data: undefined` on every poll is not confirmed by the local TanStack Query v5 source. `queryObserver.ts` uses existing `state.data` by default; `placeholderData` is only consulted when `data === undefined` and `status === "pending"`.
  - `staleTime: 0` does not by itself prove UI flicker. It makes data immediately stale, but stale data should still remain available during same-key background refetch.
  - The exact backend contract for `$signal_anchor` and whether signal ID churn is expected every candle remains unverified.

### 2. Implementation contract

- Exact file path: `src/hooks/useSniperData.ts`
  - Exact function, class, hook, selector, or section to modify: top-level React Query import.
  - Exact change required: import `keepPreviousData` from `@tanstack/react-query` alongside the existing React Query imports.
  - Guard rails: do not change query keys, API client calls, polling enablement, `staleTime`, `structuralSharing`, `refetchInterval`, backend URL readiness logic, or watchlist invalidation behavior.
  - Why this file is in scope: it owns the live signal and ladder query observer options that feed the plan page.
  - Acceptance criterion tied to the failure path: query option inspection proves both `["live-signals"]` and `["ladders"]` are configured to retain previous successful data when the observer would otherwise enter pending-without-data state.

- Exact file path: `src/hooks/useSniperData.ts`
  - Exact function, class, hook, selector, or section to modify: `useLiveSignals()`.
  - Exact change required: add `placeholderData: keepPreviousData` to the `useQuery` options object.
  - Guard rails: preserve `queryKey: ["live-signals"]`, `queryFn: () => apiClient.getLiveSignals()`, `enabled`, `staleTime: 0`, `structuralSharing: false`, `refetchOnWindowFocus: false`, and `refetchInterval: enabled ? pollMs : false`.
  - Why this file is in scope: live signals are one side of the plan-page signal-to-ladder join and can affect candidate ordering.
  - Acceptance criterion tied to the failure path: existing `useLiveSignals` option tests pass and a new assertion verifies `placeholderData` is `keepPreviousData`.

- Exact file path: `src/hooks/useSniperData.ts`
  - Exact function, class, hook, selector, or section to modify: `useLadders()`.
  - Exact change required: add `placeholderData: keepPreviousData` to the `useQuery<TradePlan[]>` options object.
  - Guard rails: preserve `queryKey: ["ladders"]`, `queryFn: () => apiClient.getLadders()`, `enabled`, `useLivePollingDiagnostics("LADDERS_POLL", ...)`, and `refetchInterval: enabled ? pollMs : false`.
  - Why this file is in scope: ladders are the second side of the plan-page join; missing ladder data turns `hasPlan` false and can demote cards out of the top-3 slice.
  - Acceptance criterion tied to the failure path: a `useLadders` hook test proves the query keeps the same key, enablement, cadence, and `placeholderData` continuity option.

- Exact file path: `src/hooks/useSniperData.test.tsx`
  - Exact function, class, hook, selector, or section to modify: React Query mock imports and hook option tests for `useLiveSignals`; add coverage for `useLadders`.
  - Exact change required: import `keepPreviousData` from `@tanstack/react-query` in the mocked module or expose the real helper through the mock, then assert `placeholderData: keepPreviousData` for `useLiveSignals()` and `useLadders()`.
  - Guard rails: do not weaken existing assertions for `enabled`, `staleTime`, `structuralSharing`, or `refetchInterval`; do not replace option inspection with snapshot tests.
  - Why this file is in scope: it is the existing hook-level regression surface for query keys, polling cadence, and stale-state options.
  - Acceptance criterion tied to the failure path: tests fail before the hook option patch and pass after it, proving the continuity option is present on both query observers.

- Exact file path: `src/routes/-plan.page.tsx`
  - Exact function, class, hook, selector, or section to modify: none.
  - Exact change required: no edit in this patch.
  - Guard rails: do not change ranking order, `hasPlan` semantics, top-3 slicing, signal-to-ladder join key, card keys, loading guards, or backend-confirmation display logic.
  - Why this file is in scope: it is diagnostic context only; the report does not prove that route logic is wrong.
  - Acceptance criterion tied to the failure path: existing `src/routes/-plan.test.tsx` plan-page ranking and awaiting-blueprint tests still pass unchanged.

### 3. Patch sequence

1. Update `src/hooks/useSniperData.test.tsx` to expose or import `keepPreviousData` from the React Query mock and add failing expectations for `placeholderData` on `useLiveSignals()` and `useLadders()`.
2. Update `src/hooks/useSniperData.ts` to import `keepPreviousData` and add `placeholderData: keepPreviousData` to `useLiveSignals()`.
3. Update `src/hooks/useSniperData.ts` to add `placeholderData: keepPreviousData` to `useLadders()`.
4. Run focused hook tests, then route tests, then the project implementation validator.
5. Do not modify cache state, migrations, API contracts, query keys, backend endpoints, or MT5/Pine formulas.

- Dependencies between changes: tests must be written before implementation so the continuity option is proven instead of assumed.
- State, cache, migration, or contract sequencing risk: `placeholderData` must remain observer-level only; it must not write placeholder data into the cache or replace backend response data.
- Manual invalidation risk: `useEngineBatch()` and watchlist mutation invalidation/refetch flows must still invalidate and refetch `["live-signals"]` and `["ladders"]` without query key changes.

### 4. Regression guards

- Run `npx vitest run src/hooks/useSniperData.test.tsx`.
- Run `npx vitest run src/routes/-plan.test.tsx`.
- Run `npm run validate:impl`.
- Existing protections that must still hold:
  - polling remains disabled until Account settings resolve and `backendReady && pollMs !== null`;
  - `useLiveSignals()` keeps `staleTime: 0` and `structuralSharing: false`;
  - `useLadders()` keeps `useLivePollingDiagnostics("LADDERS_POLL", ...)`;
  - `useEngineBatch()` still invalidates `["live-signals"]` and `["ladders"]`;
  - plan-page execution remains disabled for pending or incomplete backend plans.
- Parity re-validations required:
  - no Pine, MT5, backend, or trading-formula parity revalidation is required for this frontend query-option patch;
  - manually spot-check one candle boundary to confirm the dashboard does not show an executable stale ladder for a newly changed signal ID.
- Logging or diagnostics that should exist after the patch:
  - retain existing `LADDERS_POLL` diagnostics;
  - do not add new production logging for this patch.

### 5. Non-goals

- Do not change backend signal ID generation.
- Do not change `$signal_anchor` semantics.
- Do not change Pine formulas, MT5 logic, backend endpoints, schema fields, or API response normalization.
- Do not make the frontend infer, synthesize, or remap ladders by symbol, direction, timestamp, verdict, or status.
- Do not change the plan-page top-3 ranking contract.
- Do not add a frontend fallback that treats an old ladder as valid for a new signal ID.
- Do not synchronize polling intervals or introduce cross-query orchestration.
- Do not add broad error boundaries, loading-state rewrites, suspense migration, or React Query client default changes.
- Do not rename test files or move route tests.

### 6. Risk assessment

- Worst-case failure mode if patched incorrectly: stale or placeholder ladder data appears authoritative and a user mistakes an old blueprint for an executable current plan.
- User-visible failure mode: cards may still shift at candle boundaries when backend signal IDs legitimately change before matching ladders arrive.
- Backend authority or stale-state risks:
  - backend authority is preserved only if placeholders are display continuity for previously fetched backend data and execution gates still depend on backend-confirmed plan state;
  - stale-state risk increases if implementation changes join keys, card execution logic, cache writes, or invalidation behavior.
- Human approval before merge: required. The patch touches the dashboard query synchronization layer and should be reviewed with slow-network and candle-boundary observations.

### 7. Test requirements

- Add or update tests in `src/hooks/useSniperData.test.tsx`:
  - assert `useLiveSignals()` includes `placeholderData: keepPreviousData` while retaining `staleTime: 0`, `structuralSharing: false`, `enabled: true`, and polling cadence;
  - add a `useLadders()` test that asserts `queryKey: ["ladders"]`, `enabled: true`, `refetchInterval` from Account settings, and `placeholderData: keepPreviousData`.
- Existing tests or manual checks that must still pass:
  - `npx vitest run src/hooks/useSniperData.test.tsx`;
  - `npx vitest run src/routes/-plan.test.tsx`;
  - `npm run validate:impl`.
- Manual verification:
  - open the plan page against a real or staging backend;
  - observe at least 5 poll cycles with normal network and confirm no disappearance caused by loading-state churn;
  - repeat under browser slow 3G throttling for at least 5 poll cycles;
  - observe one candle boundary if available and confirm any missing blueprint remains non-executable and visibly pending or no-blueprint.
- Soak, replay, parity, or live-environment verification:
  - no formula parity replay is required;
  - a short dashboard soak of 10 or more poll cycles is required before merge;
  - live-environment verification must not execute trades.

### 8. Implementation handoff

- Branch naming recommendation: `codex/fix-plan-query-continuity`
- Suggested commit grouping:
  - commit 1: `test: cover signal and ladder query continuity options`;
  - commit 2: `fix: retain previous signal and ladder query data during pending observers`.
- Required reports or artifacts to generate after implementation:
  - implementation summary in `reports/codex-implementation.md`;
  - verification results in the PR body or implementation report, including the exact commands and pass/fail status;
  - note any manual slow-network or candle-boundary verification that could not be performed.
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
