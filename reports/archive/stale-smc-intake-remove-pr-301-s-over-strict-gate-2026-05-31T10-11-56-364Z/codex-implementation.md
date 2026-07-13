# Issue summary

SMC Intake pending blueprints were still blocked by PR 301's over-strict lifecycle gate. Live, engine-unblocked, structurally valid ARMED setups could return `plan: null` when lifecycle diagnostics were missing or not READY.

# Root cause implemented

Updated `SMC_SuperFib_Sniper_REST::build_pending_or_confirmed_plan()` so pending blueprint visibility no longer depends on `lifecycle_diagnostic` array membership or `pre_lifecycle_status === 'READY'`. The pending path now requires backend non-confirmation, live data, `engineBlocker === 'OK'`, non-WATCH status, sweep confirmation, and either MSS confirmation or clean/strong displacement.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` - replaced the lifecycle-dependent pending gate with structural engine checks and guarded pending plan tagging to arrays only.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - added a build_symbol_state regression for a live ARMED structural setup with no lifecycle diagnostic and adjusted the fixture helper to support the needed final candle close.
- `reports/codex-implementation.md` - implementation summary required by the contract.
- `reports/codex-implementation.meta.json` - implementation metadata required by `npm run validate:impl`.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_remove-pr-301-over-strict-gate.md` - runtime integrity bug sweep.
- `.github/migration/audits/phase-0-signalengine-freshnessengine-parity-2026-05-31.md` - parity re-validation audit.

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - RED before implementation; failed at the new no-lifecycle pending blueprint assertion as expected.
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - passed after implementation.
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` - passed.
- `php scripts/parity-validator.php` - passed; synthetic self-test reported 100% parity, 384/384 exact matches, 0 critical mismatches.
- `npm run build` - passed.
- `npm run validate:impl` - initially failed because `reports/codex-implementation.meta.json` was missing from the starting worktree; passed after recreating metadata with the current plan hash.
- `npm run lint` - failed on unrelated existing Prettier/style errors outside the files changed for this patch.

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_remove-pr-301-over-strict-gate.md`
- `.github/migration/audits/phase-0-signalengine-freshnessengine-parity-2026-05-31.md`

# Remaining risks

Engine structural value semantics are interpreted conservatively from current payload values: `present` passes for sweep/MSS, negative/empty values do not, and displacement only passes for `clean` or `strong`. Existing snapshot caches may still contain old `plan: null` payloads until recomputed. Repo-wide lint remains blocked by unrelated pre-existing Prettier/style errors outside this patch scope.

# Any contract ambiguities resolved during implementation

The contract allowed missing or unresolved lifecycle diagnostics; the regression uses the smallest safe missing-lifecycle case through `build_symbol_state()` rather than bypassing the real runtime path or changing private APIs. The existing weak-displacement fixture also had MSS present, which would satisfy the new `MSS or clean/strong displacement` structural rule; it was narrowed to weak displacement without MSS so the existing no-plan protection still tests a structurally invalid pending blueprint.
