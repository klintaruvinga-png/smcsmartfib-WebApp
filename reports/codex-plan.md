### 1. Issue validation

- **Confirmed**: The backend's `normalize_symbol_token()` function only performs basic uppercase and alphanumeric stripping, without mapping aliases like `NASDAQ` to `NAS100` or supporting additional crypto symbols like `SOLUSD`.
- **Confirmed**: The `instrument_specs()` registry is limited to `US30`, `NAS100`, `BTCUSD`, and `ETHUSD`, rejecting `SOLUSD` and aliases for indices.
- **Likely**: Deriv broker may use alternative naming conventions that require alias resolution before validation.
- **Unconfirmed**: Exact Deriv symbol names for top-5 cryptos beyond BTCUSD and ETHUSD.

### 2. Implementation contract

- **File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - **Section**: Add alias mapping function before `normalize_symbol_token()` in the symbol processing chain.
  - **Exact change**: Introduce `map_symbol_aliases()` function that maps known aliases (e.g., `NASDAQ` → `NAS100`, `US TECH 100` → `NAS100`) and returns the input if no alias exists.
  - **Guard rails**: Do not modify `normalize_symbol_token()`; apply alias mapping first in `is_supported_symbol()` and `sanitize_symbols()`.
  - **Why in scope**: This file contains the authoritative symbol validation logic.
  - **Acceptance criterion**: `NASDAQ` and `US TECH 100` are accepted and mapped to `NAS100`; watchlist persistence works for aliases.

- **File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - **Section**: Update `instrument_specs()` to include `SOLUSD` if Deriv supports it.
  - **Exact change**: Add `SOLUSD` entry with appropriate pip sizing (assume 0.01 like other cryptos).
  - **Guard rails**: Only add if confirmed Deriv/MT5 support exists; do not add speculative symbols.
  - **Why in scope**: Expands the registry for top-5 cryptos as requested.
  - **Acceptance criterion**: `SOLUSD` passes `is_supported_symbol()` validation.

### 3. Patch sequence

1. Add `map_symbol_aliases()` function in `smc-superfib-sniper.php`.
2. Modify `is_supported_symbol()` to call `map_symbol_aliases()` before `normalize_symbol_token()`.
3. Modify `sanitize_symbols()` to apply alias mapping before normalization.
4. Update `instrument_specs()` to include `SOLUSD` if supported.
5. No dependencies; changes are sequential and isolated to symbol processing.

### 4. Regression guards

- Run existing watchlist normalization tests to ensure deduplication and basic validation still work.
- Verify that canonical symbols (e.g., `NAS100`) still pass without alias mapping.
- Check parity: backend watchlist state matches dashboard display after alias submission.
- Ensure no unsupported symbols are accepted by broadening the registry without verification.

### 5. Non-goals

- Do not implement Deriv-specific API calls for symbol search.
- Do not modify Pine indicator or MT5 EA symbol handling.
- Do not add more than the requested top-5 cryptos without confirmation.
- Do not change Twelve Data formatting or quote ingestion logic.

### 6. Risk assessment

- **Worst-case failure**: Invalid aliases accepted, causing pricing failures or watchlist corruption.
- **User-visible failure**: Symbols like `NASDAQ` fail to add to watchlist or display incorrectly.
- **Backend authority risks**: If aliases are mapped incorrectly, stale data or mismatched feeds could occur.
- **Human approval required**: Yes, to verify Deriv symbol conventions and top-5 crypto availability.

### 7. Test requirements

- Add unit tests for `map_symbol_aliases()` covering known aliases.
- Update watchlist tests to include alias submission scenarios.
- Manual check: Add `NASDAQ` and `SOLUSD` via dashboard and verify backend acceptance.
- Soak test: Ensure watchlist persistence and price refresh work with aliases.

### 8. Implementation handoff

- **Branch naming**: `feature/symbol-alias-normalization`
- **Commit grouping**: One commit for alias mapping, one for registry expansion.
- **Artifacts**: Generate test results and parity verification logs.
- **State transition**: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`

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
