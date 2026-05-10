# Phase 0 Admin Soak Report Parity Audit - 2026-05-10

## Scope

Validate parity between:

- existing `GET /wp-json/sniper/v1/admin/health`
- embedded `health` inside `GET /wp-json/sniper/v1/admin/soak-report`
- `/admin` frontend rendering of backend-owned admin health and soak-report aggregates

## Result

PASS

- Overall parity: 100% on the scoped admin soak-report surface
- Threshold required: 100% for the audited contract surface
- Drift trend: stable

## Re-validated parity points

1. Health payload parity
   - `get_soak_report()` reuses `build_health_payload()` through the existing admin health path.
   - The soak report does not redefine or locally recompute health state.

2. Backend authority parity
   - `/admin` still renders the original health cards from `fetchAdminHealth()` independently of the soak report fetch lifecycle.
   - No frontend-only signal, freshness, or health truth was introduced.

3. Snapshot parity
   - checkpoint rows store `snapshot_data` as JSON at write time, so historical checkpoints do not mutate when live health changes later.
   - evidence rows are stored in dedicated soak tables and do not pollute `audit_events`.

4. Schema-truth parity
   - `watchlist_count` remains `null` because the plugin has no `smc_sf_watchlist` table.
   - `snapshots_24h` uses the real `smc_sf_snapshots.updated_at` column rather than assuming a non-existent `created_at`.

## Evidence

- Feature branch diff against `origin/main`
  - `src/routes/admin.tsx`
  - `src/lib/api/sniperClient.ts`
  - `src/types/sniper.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-admin-soak-report.php`
- Validation run
  - `php wordpress/smc-superfib-sniper/tests/php/test-admin-soak-report.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`

## Residual drift risk

- No fib/regime/signal math changed in this patch, so broader Pine/backend/MT5 replay parity was not recomputed here.
- Live browser verification of print layout and exported markdown content remains manual follow-up.

## Notes

- The implementation contract referenced an `AdminHealth` type that does not exist in this repo. The safe parity-preserving resolution was to alias `AdminHealth` to the existing `EngineHealth` contract instead of introducing a duplicated health shape.
- The implementation branch already contained the main soak-report runtime patch before this turn. This turn finalized repo-alignment and regression coverage on top of that branch state.
