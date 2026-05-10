### 1. Issue classification
- Severity: MEDIUM
- Category: wiring
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS / workflow
- Phase impact: Phase 0 / Cross-phase

### 2. Confirmed evidence
- `src/routes/__root.tsx` enforces dashboard authentication and redirects unauthenticated users to `/login`, but the existing route set does not include an `/admin` route.
- `src/routes/*.tsx` currently defines routes for `/`, `/account`, `/analytics`, `/book`, `/charts`, `/live`, `/login`, `/orders`, `/plan`, `/progress`, and `/signals`; no `admin.tsx` or `/admin` route exists.
- `src/lib/api/sniperClient.ts` uses either a WordPress REST nonce (`X-WP-Nonce`) or a Basic auth header from application password credentials; the default backend URL is `https://trader.stokvelsociety.co.za/wp-json`.
- `src/routes/login.tsx` confirms the frontend supports WordPress username + application password authentication for dashboard access.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` registers REST routes under `/wp-json/sniper/v1`, and uses `permission_user()` for authenticated endpoints; the current permission check is `is_user_logged_in()` + `current_user_can('read')`, which is not admin-specific.
- `wordpress/smc-superfib-sniper/README.md` documents the runtime contract: auth is logged-in WordPress user + `X-WP-Nonce`, and the plugin exposes a backend health endpoint under `/wp-json/sniper/v1/health`.
- `.github/migration/PHASE0_SOAK_TRACKER.md` explicitly documents the backend health endpoint `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/health` and example fetch code using `credentials: 'include'` and `X-WP-Nonce`.

### 3. Root cause hypothesis
- Confirmed: the repository currently has no frontend `/admin` route or admin-specific dashboard page, so the requested page cannot be reached through the current route map.
- Hypothesis: the backend auth contract is too broad for an admin-only feature. Current REST permissions grant access to any logged-in WP user with `read` capability, so a new admin-only guard is likely required in the plugin.
- Hypothesis: the requested admin health page must combine existing automated backend health metrics with a new manual observation form, which is not yet represented in the current data contract or UI route set.

### 4. Blast radius
- Files likely affected:
  - `src/routes/__root.tsx`
  - `src/routes/admin.tsx` (new)
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/README.md`
  - `.github/migration/PHASE0_SOAK_TRACKER.md`
- Systems affected:
  - dashboard route engine and client-side auth gating
  - WP REST authentication and capability checks
  - backend health diagnostics and status endpoints
  - API contract between frontend and WordPress backend
- Parity surfaces at risk:
  - backend health endpoint `<->` frontend diagnostic page
  - admin authorization contract `<->` page visibility rules
- Stale-state/caching risks:
  - health fetches must bypass cache for live status values
  - manual observation entries should not be conflated with backend auto-pulled diagnostics
  - exposing diagnostic data via a new page could inadvertently weaken current auth safeguards if not admin-checked

### 5. Regression surface
- Existing auth redirect from `/login` must remain intact; new admin page should not bypass current dashboard access gating.
- `src/lib/api/sniperClient.ts` must continue supporting both `X-WP-Nonce` and app-password Basic auth without soft-falling-back in ways that leak admin-only routes.
- Phase 0 soak docs expect `/wp-json/sniper/v1/health` to remain stable; the new page should consume, not alter, that endpoint contract.
- Current backend auth guard is generic `current_user_can('read')`; a misapplied change could expose diagnostics to non-admin users if the new page or endpoint is not properly scoped.

### 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Add a new frontend route `/admin` in `src/routes/admin.tsx`.
  - Reuse existing backend health endpoints (`/health`, `/authority-diagnostics`) for auto-pulled metrics.
  - Implement client-side admin gating by calling a new or existing endpoint that verifies the current WP user is admin before rendering the page.
- Path B: broader structural risk area if narrow path is unsafe
  - Add a dedicated admin-only REST endpoint in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` with `current_user_can('manage_options')` or explicit administrator role check.
  - Centralize health, diagnostics, and manual observation payloads through that admin route.
  - Build the `/admin` route against that endpoint so frontend permissions and backend data access remain aligned.
- Recommended: Path B
  - Because the current auth contract is too broad for an admin-only feature, explicit backend admin capability enforcement is safer than relying solely on frontend route gating.

### 7. Risk flags
- High-risk system involved: Yes — backend auth + REST exposure is sensitive, and admin-only diagnostics require explicit privilege controls.
- Requires parity re-validation: Yes — API contract between frontend `/admin` page and backend health/diagnostic endpoints.
- Migration-blocking: No — this is Phase 0 stabilization and operator tooling, not MT5 migration logic.
- Human review required before merge: Yes — to confirm admin-role guard, endpoint exposure, and whether manual observation data should persist or remain local.

### 8. Handoff package
- Epicentre files to inspect first:
  - `src/routes/__root.tsx`
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `.github/migration/PHASE0_SOAK_TRACKER.md`
- Inputs Codex must verify before planning:
  - exact `/wp-json/sniper/v1/health` response contract and auth requirements
  - whether an admin-only capability check exists or must be added in the plugin
  - whether `/admin` should be implemented as a dashboard route or a WordPress admin page
  - how manual observation entries should be modeled and stored
- Open unknowns:
  - current backend health endpoint visibility for non-admin logged-in users
  - whether the page should persist manual logs in backend storage or keep them purely frontend/manual
  - whether additional diagnostic endpoints (e.g. `/authority-diagnostics`) should be surfaced on the same page
