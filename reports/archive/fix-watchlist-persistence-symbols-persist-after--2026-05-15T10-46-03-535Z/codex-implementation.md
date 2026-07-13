# Issue summary

Watchlist removals could be overwritten after mutation success because the authoritative `["user-settings"]` cache write was never followed by a confirming `["user-settings"]` invalidation, and the Account settings draft sync read raw cache state while that refetch window could still be in flight. I applied the smallest contract-safe fix in the mutation success path and the Account draft sync path only.

# Root cause implemented

`useWatchlistAdd` and `useWatchlistRemove` already called `writeCanonicalWatchlist`, but they only invalidated downstream watchlist-dependent queries. That left `useUserSettings` eligible to serve stale or reloaded settings later. In `account.tsx`, `syncDraftWatchlistFromCache` read `queryClient.getQueryData(["user-settings"])` directly, which could propagate stale draft state during refetch timing. The implemented fix adds scoped `["user-settings"]` invalidation after the canonical write and defers draft sync until `useUserSettings` is settled.

# Exact files changed

- `src/hooks/useSniperData.ts`
- `src/routes/account.tsx`
- `src/hooks/useSniperData.test.tsx`
- `src/hooks/useSniperData.watchlist.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-15_watchlist-persistence.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx` - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` - PASS
- `npx vitest run` - FAIL, pre-existing unrelated suite/config failures in `src/routes/-admin.test.tsx` and multiple files with no test suite
- `npx tsc --noEmit` - FAIL, pre-existing unrelated type errors in `src/components/PlanCard.tsx`, `src/routes/-plan.test.tsx`, and `src/routes/charts.tsx`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-15_watchlist-persistence.md`
- No parity audit required by contract for this patch
- `reports/codex-implementation.md`

# Remaining risks

- The contract-required manual validations were not fully executable in this CLI-only pass: route navigation, 35-second stale-window verification against a live backend, and forced network-failure rollback checks still need browser/staging confirmation.
- The "removed symbol replaced by another removed symbol" symptom was not confirmed by available evidence and was intentionally left out of scope.
- The full repository Vitest and TypeScript sweeps still contain unrelated pre-existing failures that can mask future regressions if left unresolved.

# Any contract ambiguities resolved during implementation

- `account.tsx` was conditionally in scope. Inspection confirmed `syncDraftWatchlistFromCache` read raw `["user-settings"]` cache state directly, so I applied the contract's guarded path there instead of leaving it unchanged.
- The contract required a parity artifact only when parity re-validation was needed. This watchlist cache fix does not change Pine, MT5, backend formulas, or authority boundaries, so no parity audit was generated.
