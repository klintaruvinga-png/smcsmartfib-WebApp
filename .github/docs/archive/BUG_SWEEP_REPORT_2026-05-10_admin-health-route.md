# Bug Sweep Report - Admin Health Route

Date: 2026-05-10
Issue: dashboard `/admin` route missing and backend health diagnostics lacked an admin-only capability boundary

## Runtime integrity impact

- Frontend routing defect: `/admin` was unreachable because no route module existed.
- Backend auth defect: health diagnostics could only be read through `/health`, which was not admin-scoped.
- Truth-boundary risk: adding an admin page without backend capability enforcement would have leaked operational diagnostics to any authenticated user with `read`.

## Confirmed findings

1. No frontend `/admin` route existed in the generated TanStack route tree.
2. The plugin exposed `/health` without an admin-only counterpart.
3. The plugin had no dedicated `manage_options` permission gate for admin diagnostics.

## Patch applied

- Added `GET /wp-json/sniper/v1/admin/health` behind `permission_admin()`.
- Kept `/wp-json/sniper/v1/health` path and behavior intact.
- Extracted shared health payload assembly so `/health` and `/admin/health` stay in parity.
- Added `fetchAdminHealth()` in the frontend API client with cache-busting enabled.
- Added `src/routes/admin.tsx` and regenerated `src/routeTree.gen.ts`.
- Added PHP regression coverage for route registration, 403 denial for non-admins, and payload parity for admins.

## Validation

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-rest-bootstrap-settings.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npm run build`

## Residual risks

- `manage_options` is the implemented admin capability. If this WordPress installation uses a narrower custom capability model, that should be reviewed before deploy.
- The new page is reachable by direct route and generated route tree only; no navigation chrome was widened in this patch.
- The frontend intentionally collapses `403`, `404`, and network failures into the same denied state so diagnostics are never leaked before backend deploy parity is complete.
