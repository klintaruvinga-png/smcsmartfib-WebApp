# Issue summary

The watchlist persistence defect was not an `AUDCAD` symbol-normalization failure. `AUDCAD` was already supported by the backend instrument registry. The implemented fix closes two real contract gaps instead: `post_user_settings()` now returns the canonical persisted `watchlist` like the other watchlist mutation endpoints, and the frontend watchlist mutations no longer refetch `["user-settings"]` immediately after success, which was the stale-overwrite path that could hide newly persisted symbols.

# Root cause implemented

The backend and frontend were drifting on watchlist authority. Backend `post_user_settings()` persisted the watchlist but did not return the authoritative post-persist `watchlist` array, while the frontend watchlist hooks invalidated `["user-settings"]` after already receiving a canonical mutation response. That extra refetch reopened the door for a lagging `GET /user/settings` payload to overwrite the correct cache state. I also normalized snapshot invalidation behavior so it is explicitly change-based and logs no-op skips.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `src/lib/api/sniperClient.ts`
- `src/hooks/useSniperData.ts`
- `src/hooks/useSniperData.watchlist.test.tsx`

# Tests run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npx vitest run src/hooks/useSniperData.watchlist.test.tsx`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-15_watchlist-persistence-mismatch.md`
- `.github/migration/audits/phase-0-watchlist-persistence-parity-2026-05-15.md`
- `reports/codex-implementation.md`

# Remaining risks

- Manual staging verification for Account -> Live Radar add/remove of `AUDCAD` was not run from this repo harness.
- `post_watchlist_remove()` still audits remove requests even when the canonical watchlist is unchanged; snapshot invalidation is now correct, but audit noise on no-op removals remains.
- The patch assumes the WordPress runtime matches the PHP harness behavior for user-meta deletion and query timing.

# Any contract ambiguities resolved during implementation

- The contract framed the frontend change as an invalidation ordering check. Code inspection showed the stronger concrete defect was the presence of `["user-settings"]` invalidation itself, which directly contradicted the local stale-overwrite guard comment. I resolved that by removing the invalidation rather than adding timers or broader cache changes.
- The contract allowed for a possible `AUDCAD` normalization fix. Inspection confirmed `AUDCAD` was already supported in `instrument_specs()` and accepted by `is_supported_symbol()`, so no symbol-map widening was applied.
