## Issue summary

Approved the backend active-day definition and enabled live streak computation on the progress page. The definition `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` was formally signed off by the authorized decision-maker on 2026-05-22. `GET /user/progress` now returns `streak.state = "LIVE"` with a non-zero `current_streak_days` for users with engine run history (all historical records backfilled).

## Root cause implemented

The streak was gated by `const ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` and a static `read_progress_streak()` that always returned `state: UNAVAILABLE, current_streak_days: 0`. This was a deliberate governance safety gate, not a bug. With signoff obtained, the constant is replaced and the function now performs a live computation from the `engine_runs` table.

## Exact files changed

**`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`**
- Replaced `ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` with `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN`, with signoff date and authorized decision-maker approval recorded in a comment.
- Replaced static `read_progress_streak()` fallback with live computation: fetches all `engine_runs` rows for the user (full historical backfill), collects distinct UTC calendar dates, counts consecutive days ending today, returns `state = 'LIVE'` when any run data exists and `state = 'UNAVAILABLE'` only when no run data is present.
- Added `WP_DEBUG_LOG`-gated `error_log()` call recording the definition constant and computed streak for auditability.

**`wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`**
- Updated existing assertions (lines 737-738) from `current_streak_days = 0 / state = UNAVAILABLE` to `current_streak_days = 1 / state = LIVE` (consistent with a today-dated engine_run row already present in the fixture).
- Added `test_progress_streak_live_state_with_consecutive_run_fixtures()`: inserts 3 consecutive-day runs, asserts `current_streak_days = 3` and `state = LIVE`.
- Added `test_progress_streak_unavailable_with_no_run_data()`: asserts `state = UNAVAILABLE`, `current_streak_days = 0`, `last_active_date = null` when no engine_runs rows exist.

**`src/routes/progress.tsx`**
- Updated UNAVAILABLE branch message from "Streak remains unavailable until the backend active-day definition is approved." to "No engine run data found for this account yet." — the governance blocker is resolved; UNAVAILABLE now only means no run history.

**`src/routes/-progress.page.test.tsx`**
- Updated the UNAVAILABLE message assertion to match the new message string.

**`.github/migration-status.md`**
- Phase 2 status updated to COMPLETE; active-day signoff recorded in blockers section with definition string and date.

**`PHASE2_IMPLEMENTATION.md`**
- Phase 2 exit validation note updated to reflect that streak truth is live and the active-day definition is formally approved.

## Tests run

- PHP: `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` — all tests passed including 2 new streak test functions (15 assertions total).
- Frontend: `npx vitest run src/routes/-progress.page.test.tsx` — 3/3 tests passed.

## Reports generated

- `reports/codex-implementation.md` — this file.

## Remaining risks

- Staging soak: a live call to `GET /user/progress` with a known test account that has persisted run data should be made post-deploy and the response verified manually.
- EA terminal operational check: if `price.state` remains `UNAVAILABLE` at runtime, verify the deployed EA terminal is on the current branch and sending engine run records.

## Any contract ambiguities resolved during implementation

- State when run data exists but streak = 0 (last run was >1 day ago): implemented as `state = LIVE, current_streak_days = 0`. The plan specified UNAVAILABLE only when no run data exists, which implies LIVE is correct when data is present but the current consecutive-day chain is broken.
- Backfill scope: all historical `engine_runs` records are included (no date cutoff). This matches the signed-off decision.

## Systems intentionally not touched (Do Not Touch)

- `mt5/SMC_MarketDataEA.mq5` and `mt5/MarketDataEngine.mqh` — not implicated.
- `src/hooks/useSniperData.ts` — API client and hooks already handle the `streak` field correctly; no change needed.
- `/ea/heartbeat`, authentication, REST route registration — not touched.
- Equity pulse, drawdown, and milestone logic — not touched.
- Pine scripts — not implicated.
