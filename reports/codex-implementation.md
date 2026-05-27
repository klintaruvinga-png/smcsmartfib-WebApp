# Issue summary

Stopped — the implementation contract conflicts with the current repository state for both targeted code paths.

# Root cause implemented

Not implemented — Codex stopped before code changes. The current `src/routes/-book.page.tsx` already renders Active Book groups from `useUserTrades()` without gating visibility on snapshot membership, and the current `src/hooks/useSniperData.ts` watchlist mutation path does not invalidate `["user-trades"]` or write an empty intermediate cache state to that query.

# Exact files changed

None — no files changed.

# Tests run

None — stopped before code changes.

# Reports generated

None — stopped before code changes.

# Remaining risks

The contract’s prescribed patch cannot be applied as written because the repo no longer contains the failure paths it instructs Codex to change. Proceeding anyway would require widening scope and guessing at an unverified runtime cause, which would violate the contract and risk weakening existing stale-data protections.

# Any contract ambiguities resolved during implementation

Resolved with the smallest safe interpretation: treat the mismatch as a contract conflict and stop. Confirmed mismatches:

- `src/routes/-book.page.tsx` uses `snap?.prices.find(...)` only for decoration (`FreshnessBadge` / stale warning), not as a show/hide gate.
- `src/hooks/useSniperData.ts` watchlist mutations cancel and refresh snapshot-adjacent queries, but do not invalidate `["user-trades"]` and do not call `setQueryData` on that cache key with an empty or partial value.
