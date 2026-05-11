# Bug Sweep Report: `/admin/soak-report`

## Scope

- Runtime integrity: admin soak-report read path
- Backend/dashboard truth boundary: `baseline_checkpoint`
- Stale-data protections: preserved

## Confirmed findings

- The REST route `/sniper/v1/admin/soak-report` was already registered; the missing-route theory did not match repository reality.
- The handler did not guarantee a `WP_REST_Response`, did not assert soak-table bootstrap success, and tolerated a missing baseline row without repairing it.
- The soak checkpoint schema in source uses `checkpoint_type` and `snapshot_data`, not `type` and `payload`.

## Patch applied

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `ensure_soak_tables()` now returns success/failure and exposes bootstrap failures to the caller.
  - `get_soak_report()` now runs inside a guarded `try/catch`, returns structured `500` responses for table/bootstrap or baseline lookup failures, and always returns `WP_REST_Response`.
  - Missing baseline state now seeds a single baseline checkpoint row using the existing schema and reports `seeded=true` on first load.
  - Added success/error logging required for soak-report servicing and failure diagnosis.

## Regression checks run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php -l wordpress/smc-superfib-sniper/tests/php/test-get-soak-report.php`
- All PHP tests under `wordpress/smc-superfib-sniper/tests/php`
- `node --test src/lib/api/soakEvidence.test.ts`
- `npx vitest run src/lib/api/sniperClient.test.ts`

## Results

- Local PHP regression suite passed, including the new soak-report coverage:
  - missing baseline seeds once and returns `200`
  - existing baseline returns `200` with `seeded=false`
  - baseline lookup failure returns structured `500`
  - unauthenticated admin permission still returns `401`
- Frontend API tests passed:
  - existing soak evidence validator
  - new soak-report client 200/500 handling

## Remaining staging-only checks

- `curl` verification against `/wp-json/sniper/v1/admin/soak-report`, `/admin/health`, `/admin/soak-evidence`, and `/admin/soak-checkpoint`
- PHP error-log inspection for zero new fatal/uncaught entries after live request handling
- Before/after staging verification that the first soak-report hit creates exactly one baseline row and the second hit does not duplicate it
