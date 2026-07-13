### 1. Issue classification
- Severity: MEDIUM
- Category: stale-data
- Layer(s) affected: Dashboard-JS
- Phase impact: Phase 0

### 2. Confirmed evidence
- `useSniperData.ts` contains `useWatchlistAdd` and `useWatchlistRemove` mutations with optimistic updates in `onMutate` and `onSuccess` setting query data via `writeCanonicalWatchlist`.
- `useUserSettings` query has `staleTime: 30_000`, allowing cached data for 30 seconds.
- `invalidateWatchlistQueries` explicitly does not invalidate `["user-settings"]`, with a comment explaining that the mutation response is the source of truth and backend GET can lag, to prevent flickering.
- `account.tsx` displays watchlist using `useCanonicalWatchlist`, which normalizes `data?.watchlist` from `useUserSettings`.
- Watchlist mutations call `syncDraftWatchlistFromCache` in `account.tsx` to update the local draft state with the mutation result.
- Backend test `test-watchlist-snapshot-regression.php` validates watchlist persistence and normalization in PHP, but does not test frontend cache behavior.

### 3. Root cause hypothesis
- Most likely root cause: stale user-settings cache due to lack of query invalidation after watchlist mutations, combined with `staleTime` allowing old data to persist.
- Why that root cause best fits the evidence: The mutations update the query cache optimistically and on success, but do not invalidate the `user-settings` query. If the component remounts or the cache expires within 30 seconds, a refetch could pull stale data from the backend if it lags, overwriting the correct mutation result.
- What likely triggered or surfaced the issue: User removes symbols, then navigates away and back to the account page, or waits for cache expiration, causing a refetch that gets outdated backend data.
- Mark each sub-point as `Confirmed` or `Hypothesis`: Confirmed - mutations don't invalidate user-settings; Hypothesis - backend lag causes overwrite on refetch.

### 4. Blast radius
- Dashboard watchlist UI in `account.tsx` shows incorrect symbols.
- Any component using `useCanonicalWatchlist` or `useWatchlist` displays stale watchlist data.
- `filterItemsByWatchlist` and `alignWatchlistItems` functions filter snapshots and signals based on potentially stale watchlist, affecting data display across the dashboard.
- Parity between displayed watchlist and backend-stored watchlist breaks, potentially causing confusion in trading decisions.

### 5. Regression surface
- Existing guards: Optimistic updates and `onSuccess` setting query data prevent immediate inconsistency; `onError` reverts changes.
- Existing tests: Backend PHP tests validate watchlist persistence, but no frontend cache invalidation tests exist.
- Potential regression: Invalidating `user-settings` could cause flicker if backend truly lags, as noted in the code comment, but since mutations succeed, backend should be updated.

### 6. Resolution path options
- Path A: Add `queryClient.invalidateQueries({ queryKey: ["user-settings"] })` in `onSuccess` of both `useWatchlistAdd` and `useWatchlistRemove` to ensure cache consistency, accepting minor flicker risk.
- Path B: Remove `staleTime` from `useUserSettings` to force refetch on every access, but this increases API load and may not address lag issues.
- Recommended: Path A - narrowest fix to ensure watchlist mutations update the cache correctly without over-invalidating other queries.

### 7. Risk flags
- High-risk system involved: No
- Requires parity re-validation: No
- Migration-blocking: No
- Human review required before merge: No

### 8. Handoff package
- Epicentre files to inspect first: `src/hooks/useSniperData.ts` (lines 240-290 for mutations), `src/routes/account.tsx` (watchlist display and sync logic)
- Inputs Codex must verify before planning: Confirm backend watchlist update latency; test if invalidating user-settings causes unacceptable flicker.
- Open unknowns that could invalidate the current hypothesis: Exact backend update timing; whether lag is real or perceived; if other query invalidations trigger user-settings refetch.