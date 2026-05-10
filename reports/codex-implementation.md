# Issue summary

The dashboard had no `/admin` route, and backend health diagnostics had no admin-only REST surface. The implemented fix adds an admin-scoped health endpoint, a frontend `/admin` route that consumes it, and regression coverage proving non-admin users receive 403 while `/health` remains unchanged.

# Root cause implemented

The repo lacked both halves of the contract: no TanStack route module for `/admin`, and no backend `manage_options` guard for an admin diagnostics path. The fix extracts the existing health payload into a shared helper, exposes it through a new admin-only `/admin/health` endpoint, and adds a route that fails closed on denied or unavailable responses.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `src/lib/api/sniperClient.ts`
- `src/routes/admin.tsx`
- `src/routeTree.gen.ts`

# Tests run

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-rest-bootstrap-settings.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-settings-risk-fallbacks.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-10_admin-health-route.md`
- `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`
- `reports/codex-implementation.md`

# Remaining risks

- `manage_options` is assumed to be the correct administrator gate for this WordPress install and should be confirmed in production.
- The frontend intentionally renders a generic denied state for `403`, `404`, and network failures so diagnostics are never leaked during rollout.
- No dashboard navigation item was added for `/admin`; the patch only restores route reachability and backend authority.

# Any contract ambiguities resolved during implementation

- Branch naming conflict: `reports/codex-plan.md` suggested `codex/admin-health-route`, but runtime context required `codex/dashboard-admin-route-no-admin-route-exists-and-`. The runtime-context branch was used.
- Route registration conflict: the contract referenced manual `__root.tsx` registration, but this repo uses TanStack file-based route generation. The safe implementation added `src/routes/admin.tsx` and regenerated `src/routeTree.gen.ts` instead of widening router architecture.
- Health field mismatch: the contract mentioned fields such as system uptime and last signal timestamp that are not present in the repo's existing `/health` payload. The admin page renders the real backend-owned health fields already exposed by `/health` to preserve API truth and avoid inventing new contract fields.
