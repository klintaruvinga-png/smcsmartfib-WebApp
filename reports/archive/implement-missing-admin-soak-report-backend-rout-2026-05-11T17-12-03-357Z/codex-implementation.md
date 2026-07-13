# Issue summary

`/wp-json/sniper/v1/admin/soak-report` was failing in Phase 0 soak validation even though the route registration already existed. The backend read path was not guaranteeing a structured REST response when soak-table bootstrap or baseline checkpoint lookup failed, and it did not self-heal a missing baseline checkpoint row.

## Root cause implemented

The fix keeps backend authority in PHP. `get_soak_report()` now validates soak-table bootstrap success, wraps the handler in a guarded `try/catch`, seeds exactly one baseline checkpoint when none exists, and always returns `WP_REST_Response`. The baseline seed uses the repository’s real checkpoint schema (`checkpoint_type`, `snapshot_data`) rather than the contract’s generic `type`/`payload` wording.

## Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` - `ensure_soak_tables()` now returns success/failure; `get_soak_report()` now returns structured `200/500` REST responses, seeds a missing baseline checkpoint, and logs success/failure; added `seed_baseline_checkpoint()`.
- `src/types/sniper.ts` - added optional `seeded` on `SoakReport` to reflect the backend response contract.
- `wordpress/smc-superfib-sniper/tests/php/test-get-soak-report.php` - added regression coverage for missing baseline seeding, existing baseline reuse, structured `500` lookup failure, and preserved `401` admin auth rejection.
- `src/lib/api/sniperClient.test.ts` - added a frontend API regression covering soak-report `200` success and surfaced `500` failure.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-11_admin-soak-report-route.md` - added the required bug sweep report.
- `reports/codex-implementation.md` - updated implementation summary for this run.

## Tests run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php -l wordpress/smc-superfib-sniper/tests/php/test-get-soak-report.php`
- All PHP tests under `wordpress/smc-superfib-sniper/tests/php`
- `node --test src/lib/api/soakEvidence.test.ts`
- `npx vitest run src/lib/api/sniperClient.test.ts`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-11_admin-soak-report-route.md`
- `reports/codex-implementation.md`

## Remaining risks

- The contract’s live `curl` checks and PHP error-log inspection could not be run in this workspace because no authenticated WordPress staging target was available.
- Baseline seeding is validated in the local harness only; staging still needs a first-hit/second-hit check to confirm no duplicate baseline rows under the deployed database engine.
- The worktree contains unrelated pre-existing changes and untracked artifacts outside this patch (`.claude/settings.local.json`, `scripts/pipeline-watcher.js`, existing docs/reports inputs, and `.github/migration/phase-updates/`), which were left untouched.

## Any contract ambiguities resolved during implementation

- The contract described the issue as a missing backend route, but repository evidence showed the route was already registered. I applied the smallest safe interpretation: fix the runtime handler path instead of touching route registration.
- The contract referenced a baseline row shape using `type` and `payload`; the repository schema actually uses `checkpoint_type` and `snapshot_data`. I seeded the existing schema to avoid schema drift.
- The contract allowed a `src/lib/api/sniperClient.ts` change only if the client swallowed backend failures. Inspection showed the shared `call()` helper already throws on non-2xx responses, so I preserved production client logic and added a regression test instead.
