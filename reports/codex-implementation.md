# Issue summary

Watchlist state could diverge across dashboard sections because frontend consumers were not all reading the same canonical symbol shape, and the backend watchlist sanitizer dropped lowercase symbols before uppercasing them. That combination could leave Account, Live, Signals, Charts, and the header ticker out of sync, especially for legacy persisted watchlists or lowercase mutation payloads.

# Root cause implemented

The frontend canonical watchlist normalization only trimmed symbols, so `user-settings` could still cache mixed-case values while snapshot and signal payloads remained uppercase. Separately, the backend used `preg_replace('/[^A-Z0-9]/', ...)` before `strtoupper(...)`, which strips lowercase letters entirely. I fixed both layers by normalizing `user-settings` watchlists at fetch time, exposing one shared canonical list/set selector for watchlist consumers, syncing the Account draft from canonical cache state after mutations, and hardening backend symbol normalization on watchlist read/write and watchlist-adjacent symbol helpers.

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
- `.github/migration/audits/phase-0-dashboard-js-parity-2026-05-09.md`
- `reports/codex-implementation.md`

# Tests run

- `npx eslint src/hooks/useSniperData.ts src/routes/account.tsx src/routes/live.tsx src/routes/signals.tsx src/routes/charts.tsx src/components/sniper/AppShell.tsx`
- `npm run build`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-09_watchlist-consistency.md`
- `.github/migration/audits/phase-0-dashboard-js-parity-2026-05-09.md`
- `reports/codex-implementation.md`

# Remaining risks

- Interactive add/remove verification across Account, Live, Signals, Charts, and reload state was not run against a live backend session in this environment.
- `src/routes/signals.tsx` still contains older mojibake copy outside the watchlist scope; I only normalized the glyphs required to keep targeted lint green.
- Full repository-wide lint was not re-run because the contract required targeted watchlist validation, not unrelated repo cleanup.

# Any contract ambiguities resolved during implementation

- The contract named the four route consumers, but the dashboard header ticker is also watchlist-gated and user-visible. I included it as the smallest safe extension needed to make watchlisting consistent across dashboard sections.
- The initial plan treated backend changes as conditional. Code verification exposed a confirmed backend defect in symbol normalization for lowercase inputs and legacy persisted watchlists, so I applied the minimal backend hardening needed to preserve backend authority and parity.
