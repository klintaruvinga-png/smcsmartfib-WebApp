# Phase 0 Admin Health Parity Audit - 2026-05-10

## Scope

Validate parity between:

- existing `GET /wp-json/sniper/v1/health`
- new admin-only `GET /wp-json/sniper/v1/admin/health`
- frontend `/admin` route consumption of the backend health contract

## Contract checks

1. `/health` remains on the same path and keeps its existing response shape.
2. `/admin/health` returns the same payload as `/health` for an authorized admin user.
3. `/admin/health` denies authenticated non-admin users with HTTP 403.
4. Frontend `/admin` fetches only the backend payload and does not compute health truth locally.
5. TanStack route generation includes `/admin` without altering existing route paths.

## Evidence

- PHP regression: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - asserts `/admin/health` route registration
  - asserts `permission_admin` is used
  - asserts non-admin access returns 403
  - asserts admin payload matches `/health`
- Frontend build: `npm run build`
  - regenerated `src/routeTree.gen.ts`
  - emitted `admin` client/server bundles successfully

## Result

PASS

- Backend parity preserved: `/admin/health` proxies the same health payload builder used by `/health`.
- Frontend parity preserved: `/admin` renders backend-owned health fields only.
- Source-of-truth preserved: no frontend-only diagnostic state or fallback health computation was introduced.

## Notes

- The implementation contract referenced manual `__root.tsx` registration and health fields that do not exist in this repo. The safe parity-preserving resolution was:
  - use the generated TanStack route tree instead of manual root registration
  - render the real backend health fields already emitted by `/health`
