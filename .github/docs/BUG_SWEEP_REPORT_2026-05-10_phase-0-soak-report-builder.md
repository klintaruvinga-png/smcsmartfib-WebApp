# Bug Sweep Report - Phase 0 Soak Report Builder

Date: 2026-05-10
Issue: extend `/admin` into an admin-only Phase 0 soak report builder without changing `/health` or weakening backend authority

## Runtime integrity impact

- The patch surface is admin-only, but it touches backend diagnostics, persisted operator evidence, checkpoint history, and frontend export paths.
- The main runtime risks were contract drift on `/admin/health`, stale-data truth drift in the dashboard, and unsafe admin write paths for evidence/checkpoints.
- The implementation keeps health truth backend-owned, preserves the existing admin gate, and stores checkpoint snapshots as point-in-time JSON copies.

## Confirmed findings

1. `origin/main` lacked the soak-report builder surfaces present on the implementation branch:
   - no `GET /wp-json/sniper/v1/admin/soak-report`
   - no `POST /wp-json/sniper/v1/admin/soak-evidence`
   - no `POST /wp-json/sniper/v1/admin/soak-checkpoint`
   - no `/admin` soak report panel, manual evidence form, checkpoint UI, or export controls
2. The repo does not define an `AdminHealth` type; the existing admin health contract is represented by `EngineHealth`.
3. The plugin schema does not contain a dedicated `smc_sf_watchlist` table, so `watchlist_count` cannot be derived from table rows without inventing a new authority source.
4. `smc_sf_snapshots` uses `updated_at`, not `created_at`, so 24h snapshot aggregation had to follow the real schema.

## Patch applied

- Preserved the existing admin soak-report implementation already present on the feature branch and finalized the missing repo-alignment pieces:
  - added `AdminHealth` as an alias of `EngineHealth` so the soak-report type contract compiles without redefining health truth
  - finalized a dedicated PHP regression harness for:
    - route registration
    - admin auth denial
    - soak report key presence
    - health payload reuse
    - evidence validation/upsert
    - checkpoint insert/prune behavior
- Re-verified that the feature branch still preserves:
  - `/wp-json/sniper/v1/admin/health` contract
  - `permission_admin()`
  - backend-owned health aggregation
  - client-side markdown/print export only, with no server-side PDF renderer

## Validation

- `php wordpress/smc-superfib-sniper/tests/php/test-admin-soak-report.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `npx tsc --noEmit --pretty false`
- `npm run build`

## Residual risks

- Live REST verification against a deployed WordPress instance was not possible in this workspace, so the contract checks that require real admin/non-admin HTTP requests remain manual follow-up.
- Browser-console and print-layout checks were validated by compile/build only in this run; export download and print-only rendering still need an authenticated browser pass on `/admin`.
- `watchlist_count` intentionally remains `null` because the plugin has no dedicated watchlist table. That is a documented schema limitation, not a frontend fallback.

## Manual follow-up still required

- Verify `GET /wp-json/sniper/v1/admin/health` is unchanged on the live WordPress backend.
- Verify non-admin `GET /admin/soak-report` and `POST` soak endpoints return `401/403` in the deployed environment.
- In a browser session, create one evidence row and one checkpoint, export markdown, and confirm the print stylesheet isolates the soak report section.
