## 1. Issue validation

- Confirmed:
  - `src/hooks/useSniperData.ts` is the canonical frontend watchlist source through `useWatchlist()`, and multiple dashboard routes consume that shared state.
  - `src/routes/account.tsx` already treats backend watchlist mutation responses as authoritative and performs optimistic cache update, rollback, and refetch protection.
  - `src/routes/live.tsx` and `src/routes/signals.tsx` both gate visible symbols through the watchlist, so any stale watchlist state becomes user-visible across sections.
  - Backend watchlist persistence already has a known snapshot invalidation surface around `smc_sf_engine_snapshot`.
- Likely:
  - The remaining production defect is cross-section consistency, not one isolated page bug. The patch should verify every watchlist consumer clamps to the same canonical symbol set and that removed symbols cannot survive in local route state or cached backend snapshots.
  - `src/routes/charts.tsx` is a high-probability gap because chart selection often persists its own local symbol state and can drift after watchlist edits if not re-clamped.
- Unconfirmed:
  - The research does not yet prove a specific backend persistence path is still failing today.
  - The research does not yet prove a specific frontend route other than the known watchlist consumers is currently rendering ghost symbols.

## 2. Implementation contract

- File: `src/hooks/useSniperData.ts`
  - Modify: watchlist-related selectors and mutation hooks only.
  - Exact change required: confirm every exported watchlist reader returns a normalized canonical symbol list/set shape that downstream routes can consume consistently; preserve existing optimistic update, rollback, and post-success authoritative refresh behavior.
  - Guard rails: do not weaken mutation rollback, do not widen API contracts, do not change backend authority rules.
  - Why in scope: this file is the frontend source of truth for watchlist state.
  - Acceptance criterion: after add/remove succeeds, all downstream consumers read the same canonical updated watchlist without requiring a hard refresh.

- File: `src/routes/account.tsx`
  - Modify: watchlist mutation handlers and any cache invalidation sequencing tied to add/remove.
  - Exact change required: keep current authoritative mutation flow, and add any missing dependent invalidations only if required to update downstream watchlist consumers deterministically.
  - Guard rails: do not replace authoritative backend responses with UI-derived state, do not remove optimistic UX protections.
  - Why in scope: this route is the write path for watchlist changes.
  - Acceptance criterion: add/remove from Account updates canonical watchlist state once and does not reintroduce removed symbols during refetch.

- File: `src/routes/live.tsx`
  - Modify: symbol filtering / watchlist gating logic.
  - Exact change required: verify live cards are derived from the current canonical watchlist only, and hard-clamp any locally held symbol collections against the latest watchlist snapshot before render.
  - Guard rails: do not alter live pricing contracts or freshness handling.
  - Why in scope: this route already depends on watchlist filtering and exposes ghost-symbol regressions immediately.
  - Acceptance criterion: removed symbols disappear from Live without refresh; newly added symbols become eligible immediately once backend state returns them.

- File: `src/routes/signals.tsx`
  - Modify: `watchlistOnly` filtering path and any derived unique signal symbol list.
  - Exact change required: ensure signal candidates are always recomputed from the current canonical watchlist and do not retain stale symbols in memoized or route-local state.
  - Guard rails: do not change signal ranking, signal truth, or backend signal sourcing.
  - Why in scope: this route is a direct downstream consumer of watchlist state.
  - Acceptance criterion: `watchlistOnly` never shows a removed symbol after a successful mutation.

- File: `src/routes/charts.tsx`
  - Modify: selected symbol state, fallback symbol selection, and watchlist reconciliation logic.
  - Exact change required: if the currently selected chart symbol is removed from the watchlist, deterministically re-clamp to the next valid watchlist symbol or a safe empty state instead of rendering stale selection.
  - Guard rails: do not change chart calculation logic, fib math, or indicator contracts.
  - Why in scope: chart selection is the most likely place for stale local symbol state to survive a watchlist mutation.
  - Acceptance criterion: Charts cannot remain pinned to a removed symbol after the canonical watchlist changes.

- File: `src/lib/api/sniperClient.ts`
  - Modify: watchlist mutation response handling only if the current typing or parsing can hide malformed responses.
  - Exact change required: preserve fail-closed behavior for missing `watchlist` arrays; tighten typing or response guards only if needed by the implementation.
  - Guard rails: do not silently accept incomplete backend watchlist payloads.
  - Why in scope: the frontend mutation contract depends on authoritative watchlist arrays.
  - Acceptance criterion: malformed watchlist mutation responses still fail closed instead of poisoning cache state.

- File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Modify: only the exact watchlist persistence paths implicated by frontend verification.
  - Exact change required: confirm every add/remove/save path invalidates `smc_sf_engine_snapshot` and returns the authoritative persisted watchlist array.
  - Guard rails: do not widen unrelated backend behavior, do not move authority to the frontend.
  - Why in scope: backend snapshot staleness is a known parity and ghost-symbol risk.
  - Acceptance criterion: after backend watchlist mutation, downstream engine snapshot reads cannot serve the old symbol set.

- File: `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
  - Modify: extend targeted regression coverage only if backend changes are required.
  - Exact change required: add or refine assertions covering every persistence path touched by the backend patch.
  - Guard rails: keep tests targeted to snapshot invalidation / watchlist authority.
  - Why in scope: existing repo evidence shows this regression surface is already recognized.
  - Acceptance criterion: backend watchlist mutations fail tests if snapshot invalidation regresses.

## 3. Patch sequence

1. Audit `useWatchlist()` and watchlist mutation outputs in `src/hooks/useSniperData.ts` to confirm the exact canonical shape consumed by routes.
2. Audit `src/routes/account.tsx`, `src/routes/live.tsx`, `src/routes/signals.tsx`, and `src/routes/charts.tsx` for stale local symbol state, memoized lists, or missing re-clamp logic.
3. Apply the smallest frontend fix set so every route derives rendered symbols from the same canonical watchlist snapshot and charts cannot hold a removed symbol.
4. Only if frontend verification still exposes stale symbols after successful authoritative watchlist responses, patch the exact backend persistence path(s) in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
5. Add or update regression coverage for any backend path changed.
6. Re-run watchlist mutation checks across Account, Live, Signals, and Charts in that order because Account is the write path and the other routes are downstream consumers.

Dependencies and sequencing risk:
- Do not change backend persistence first unless frontend audit proves the UI already consumes canonical state correctly.
- Preserve current cache sequencing in Account while adding downstream clamping; otherwise a refetch can overwrite the fresh authoritative mutation result.

## 4. Regression guards

- Confirm optimistic watchlist updates still roll back cleanly on failed add/remove.
- Confirm `postWatchlistAdd()` and `postWatchlistRemove()` still reject responses without authoritative `watchlist` arrays.
- Confirm removed symbols do not survive in Live, Signals, or Charts after the next render cycle.
- Confirm newly added symbols appear across all watchlist consumers without requiring full page reload.
- If backend code changes, confirm `smc_sf_engine_snapshot` invalidation still occurs for every touched mutation path.
- Preserve backend authority, stale-data protections, signal truth, fib calculations, and route IDs/selectors/hooks.
- Keep enough logging or deterministic UI state transitions to diagnose watchlist mutation failure vs stale render state during manual verification.

## 5. Non-goals

- Do not redesign watchlist UX.
- Do not change signal-generation logic, scoring, or MT5/backend truth rules.
- Do not change chart math, fib anchoring, or indicator formulas.
- Do not widen the patch into unrelated dashboard cleanup or phase migration work.
- Do not add speculative caching layers or local storage persistence to mask stale-state defects.

## 6. Risk assessment

- Worst-case failure mode if patched incorrectly: frontend sections diverge further and show different symbol universes after add/remove, creating silent trust loss in live trading views.
- User-visible failure mode: removed symbols continue to appear in Live, Signals, or Charts, or newly added symbols appear in one section but not another.
- Backend authority risk: accepting non-authoritative frontend state or incomplete backend responses would create persistent watchlist drift.
- Stale-state risk: local chart selection or memoized route state may outlive the canonical watchlist and present ghost symbols unless explicitly re-clamped.
- Human approval before merge: not required if the patch remains surgical and all watchlist regression checks pass; required if backend contract changes or parity remains uncertain.

## 7. Test requirements

- Frontend manual verification:
  - Add a symbol from Account and confirm it appears consistently in Account, Live, Signals, and Charts.
  - Remove an active symbol and confirm it disappears from Account, Live, and Signals, and that Charts re-clamps away from the removed symbol.
  - Repeat add/remove with `watchlistOnly` enabled in Signals.
- Frontend regression checks:
  - Failed watchlist mutation must restore previous UI state without leaving partial downstream updates.
  - Refresh after mutation must preserve the authoritative watchlist and not resurrect removed symbols.
- Backend tests:
  - Update `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` only if backend watchlist persistence code changes.
  - Existing snapshot invalidation assertions must still pass.
- Live/parity verification:
  - Re-check backend persisted watchlist vs frontend rendered watchlist after reload.
  - If backend touched, replay add/remove paths that exercise each invalidation branch before merge.

## 8. Implementation handoff

- Branch naming recommendation: `codex/watchlist-consistency-hardening`
- Suggested commit grouping:
  - Commit 1: frontend watchlist consumer consistency and chart re-clamp
  - Commit 2: backend snapshot invalidation hardening and regression tests, only if needed
- Required artifacts after implementation:
  - `reports/codex-implementation.md`
  - Normal PR opened against the repo default branch
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
