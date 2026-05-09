# Issue summary

The `/progress` page was still presenting unavailable streak and milestone tracking with active-looking UI and metadata even though no `/user/progress` backend contract exists in this repository. This patch keeps live account equity and drawdown intact while making the unavailable progress state explicit.

# Root cause implemented

The route already had `PROGRESS_NOT_IMPLEMENTED = true`, but that flag was not being used to control the page metadata, subtitle, or streak-card presentation. As a result, the page copy still advertised milestones and streaks, and the streak icon still used warning styling that read as active progress.

# Exact files changed

- `src/routes/progress.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-09_progress-page-unavailable-state.md`
- `reports/codex-implementation.md`

# Tests run

- `npx eslint src/routes/progress.tsx`
- `npx prettier --check src/routes/progress.tsx`
- `npm run build`
- `npm run lint` failed due to pre-existing unrelated formatting errors outside this patch scope

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-09_progress-page-unavailable-state.md`
- No parity audit required for this contract

# Remaining risks

- `/progress` still contains unavailable streak and milestone sections until `/user/progress` is implemented.
- The repo does not currently expose a dedicated automated test harness for this route, so validation remains build plus targeted lint/format checks.
- Full-repo lint is not green because of unrelated existing formatting issues in other files.

# Any contract ambiguities resolved during implementation

- The contract said to stop presenting demo streak and milestone values as live progress, while the route already displayed placeholder text instead of numeric demo values. I applied the smallest safe interpretation from `reports/codex-plan.md`: harden presentation only by demoting unavailable-state visuals and removing misleading metadata/subtitle copy, without inventing a backend progress flow or removing the route.
