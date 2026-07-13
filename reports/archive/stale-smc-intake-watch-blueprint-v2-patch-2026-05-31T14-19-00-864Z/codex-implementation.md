# Issue summary

Sweep-present unconfirmed ARMED/READY signals were blocked from producing pending blueprints when MSS was absent and displacement was weak or absent.

# Root cause implemented

Updated the ARMED/READY pending-blueprint gate in `SMC_SuperFIB_Sniper::build_pending_or_confirmed_plan()` so sweep remains the only structural prerequisite after the existing live data, OK engine blocker, and hard lifecycle suppression checks.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — relaxed the pending-blueprint guard from sweep plus MSS/clean displacement to sweep-only.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — updated the weak-displacement ACTIVE_PRE_ENTRY contract case to expect a non-executable `pending-blueprint` and assert it is not persisted to `smc_sf_trade_plans`.
- `reports/codex-implementation.md` — recorded the implementation summary and verification results.
- `reports/codex-implementation.meta.json` — restored the required implementation metadata with the current plan hash for repository validation.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_watch-blueprint-v2-patch.md` — documented runtime integrity findings and regression coverage.
- `.github/migration/audits/phase-0-backend-dashboard-watch-blueprint-v2-parity-2026-05-31.md` — documented scoped backend/dashboard source parity.

# Tests run

- Pre-patch RED check: `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` failed on the new weak-displacement pending-blueprint expectation, as expected.
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — passed.
- `npx vitest run src/routes/-plan.test.tsx` — passed, 24 tests.
- `npm run validate:impl` — passed.

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_watch-blueprint-v2-patch.md`
- `.github/migration/audits/phase-0-backend-dashboard-watch-blueprint-v2-parity-2026-05-31.md`

# Remaining risks

Snapshot replay with representative WATCH, ARMED sweep-only, READY confirmed, and blocked fixtures remains the contract's live-like manual verification item before merge. No Pine formulas, MT5 ingestion, stale thresholds, persistence contracts, or frontend source-of-truth behavior were intentionally changed.

# Any contract ambiguities resolved during implementation

The contract mentioned current frontend support as already present while listing frontend files in the research context. I treated frontend changes as out of scope because the implementation contract named only the PHP backend guard and PHP contract test for modification.
