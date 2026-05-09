# Issue summary

Watchlist state could drift across dashboard sections because the frontend did not use one shared clamp/order path everywhere, and the backend settings-save path persisted `watchlist` changes without invalidating the cached engine snapshot.

# Root cause implemented

I fixed the confirmed backend defect in `post_user_settings()` by invalidating `smc_sf_engine_snapshot` whenever the saved watchlist changes. On the frontend, I centralized watchlist clamping and ordering in `src/hooks/useSniperData.ts`, then rewired Account, Live, Signals, Charts, and the header ticker to consume that canonical state instead of route-specific filtering or selection logic.

# Exact files changed

- `src/hooks/useSniperData.ts`
- `src/routes/account.tsx`
- `src/routes/live.tsx`
- `src/routes/signals.tsx`
- `src/routes/charts.tsx`
- `src/components/sniper/AppShell.tsx`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-09_watchlist-consistency.md`
- `.github/migration/audits/phase-0-watchlist-parity-2026-05-09.md`
- `reports/codex-implementation.md`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npx eslint src/hooks/useSniperData.ts src/routes/account.tsx src/routes/live.tsx src/routes/signals.tsx src/routes/charts.tsx src/components/sniper/AppShell.tsx`
- `npm run build`
- `npm run lint`
  - Fails on unrelated pre-existing repo issues, including `scripts/pipeline-watcher.js`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-09_watchlist-consistency.md`
- `.github/migration/audits/phase-0-watchlist-parity-2026-05-09.md`
- `reports/codex-implementation.md`

# Remaining risks

- Manual verification against a live authenticated backend session is still required for final runtime confirmation.
- Full repository lint remains noisy outside this patch, so only the touched watchlist files were lint-cleaned and rechecked directly.

# Any contract ambiguities resolved during implementation

- The contract file list did not name the header ticker component, but the runtime issue explicitly included it. I treated `src/components/sniper/AppShell.tsx` as in-scope because it is the header watchlist consumer.
- The backend changes were initially conditional, but repository verification confirmed that the settings-save path was a real snapshot invalidation gap, so I patched that exact path and extended the existing regression harness.
