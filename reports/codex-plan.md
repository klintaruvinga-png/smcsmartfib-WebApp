### 1. Issue validation

- **Confirmed**: No `/admin` route exists in the dashboard frontend. `src/routes/*.tsx` defines routes for `/`, `/account`, `/analytics`, `/book`, `/charts`, `/live`, `/login`, `/orders`, `/plan`, `/progress`, and `/signals` — `admin.tsx` is absent and `/admin` is unreachable.
- **Confirmed**: The backend auth guard in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` uses `is_user_logged_in() + current_user_can('read')` for all protected endpoints including `/health`. This is not admin-specific and would expose health diagnostics to any authenticated WordPress user.
- **Confirmed**: The existing `/wp-json/sniper/v1/health` endpoint is referenced in `.github/migration/PHASE0_SOAK_TRACKER.md` and expected to remain stable on its current path.
- **Likely**: A new admin-only capability check (`current_user_can('manage_options')`) is required in the plugin before surfacing a dedicated admin diagnostics endpoint.
- **Unconfirmed**: Whether manual observation entries should persist in backend storage or remain local/ephemeral on the page. Plan scoped to read-only health display only; persistent observation storage is out of scope.

### 2. Implementation contract

- **File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - **Section**: Add `permission_admin()` helper alongside the existing `permission_user()` function.
  - **Exact change**: Add a new function `smc_sf_permission_admin()` that returns `true` only when `current_user_can('manage_options')`, returning a `WP_Error` with HTTP 403 otherwise. Register a new REST route `GET /wp-json/sniper/v1/admin/health` using this permission callback. The route handler proxies the same data as the existing `/health` handler (system status, uptime, last signal timestamp) — do not duplicate data-fetching logic; call the existing health data assembly function or extract it into a shared helper.
  - **Guard rails**: Do not modify the existing `/health` endpoint path, handler, or its `permission_user()` guard. Existing callers in the soak tracker must remain unaffected.
  - **Why in scope**: Backend must enforce admin capability before exposing diagnostic data. Relying solely on frontend route gating is insufficient.
  - **Acceptance criterion**: A request to `/wp-json/sniper/v1/admin/health` with a non-admin WP nonce returns HTTP 403. A request with an administrator-role nonce returns the health JSON.

- **File**: `src/lib/api/sniperClient.ts`
  - **Section**: Add a new fetch function alongside existing API calls.
  - **Exact change**: Add `fetchAdminHealth(): Promise<AdminHealthResponse>` that calls `GET /sniper/v1/admin/health` with the existing auth header logic (nonce or Basic auth — reuse the `authHeaders()` helper already present). Define `AdminHealthResponse` as the typed shape returned by the backend health handler.
  - **Guard rails**: Do not modify any existing fetch functions, auth header logic, or base URL resolution. Do not add caching — admin health must bypass cache for live values.
  - **Why in scope**: API client is the single authoritative layer for all backend communication.
  - **Acceptance criterion**: `fetchAdminHealth()` returns a typed response on success and throws on 401/403 so the UI can gate rendering.

- **File**: `src/routes/admin.tsx` *(new file)*
  - **Section**: New route module.
  - **Exact change**: Create a new TanStack Router route file exporting a `Route` for path `/admin`. On mount, call `fetchAdminHealth()`. If the response is a 403 or a network error, render an "Access denied" message without leaking diagnostic data. On success, render the health fields (system status, uptime, last signal timestamp). Use the same layout shell and auth redirect pattern as the other route files — check that the user is authenticated before fetch, redirect to `/login` if not.
  - **Guard rails**: Do not add state persistence, do not add a manual observation form (out of scope for this patch), do not bypass the existing `__root.tsx` auth redirect.
  - **Why in scope**: This is the missing route that makes the admin page reachable.
  - **Acceptance criterion**: Navigating to `/admin` as an authenticated admin user shows health data. Navigating as a non-admin authenticated user shows "Access denied". Unauthenticated users are redirected to `/login`.

- **File**: `src/routes/__root.tsx`
  - **Section**: Route tree registration.
  - **Exact change**: Register the new `adminRoute` in the route tree so TanStack Router includes `/admin` in its route map. Follow the exact same pattern used for other routes in this file.
  - **Guard rails**: Do not change the existing auth redirect logic, layout, or any other route registration.
  - **Why in scope**: Without registration the route is unreachable regardless of the file existing.
  - **Acceptance criterion**: `/admin` appears in the resolved route tree without breaking navigation to any existing route.

### 3. Patch sequence

1. Add `smc_sf_permission_admin()` and the `GET /sniper/v1/admin/health` REST route in `smc-superfib-sniper.php`. Extract shared health data assembly into an internal helper if not already structured that way — do this first so the PHP change is self-contained and testable independently.
2. Add `AdminHealthResponse` type and `fetchAdminHealth()` in `sniperClient.ts`. This step depends on knowing the exact JSON shape from step 1.
3. Create `src/routes/admin.tsx` using the type and fetch function from step 2.
4. Register the route in `src/routes/__root.tsx`.

Dependencies: steps 2–4 each depend on the previous. Step 1 is independent and should be applied and verified first (PHP unit test or `curl` against the endpoint).

Sequencing risk: if the PHP endpoint is not deployed before the frontend route is accessed, `fetchAdminHealth()` will return a 404 and the UI must handle this gracefully — treat 404 the same as 403 (show "Access denied" rather than an unhandled error).

### 4. Regression guards

- After PHP change: verify `GET /wp-json/sniper/v1/health` (existing path) still returns 200 for a logged-in non-admin user and is unaffected. Run `wordpress/smc-superfib-sniper/tests/php/` test suite — all existing tests must still pass.
- After PHP change: verify `GET /wp-json/sniper/v1/admin/health` returns 403 for a non-admin authenticated user and 200 for an admin user.
- After frontend change: navigating to `/account`, `/live`, `/signals`, `/charts` must be unaffected — no regression in route resolution or layout rendering.
- After route registration: `/__root.tsx` route tree must not have duplicate registrations or ordering conflicts.
- Auth redirect from `/login` must remain intact — unauthenticated requests to `/admin` must redirect to `/login`, not render a blank page or throw.

### 5. Non-goals

- Do not add a manual observation form or any write endpoint in this patch.
- Do not persist admin observations to backend storage.
- Do not add additional diagnostic endpoints (e.g. `/authority-diagnostics`) to the admin page in this patch.
- Do not change the existing `/health` endpoint path, handler, or auth guard.
- Do not redesign the dashboard layout or navigation chrome.
- Do not migrate any existing route to use the new admin capability check.
- Do not implement WordPress admin-panel pages (wp-admin side) — the target is the existing React dashboard only.

### 6. Risk assessment

- **Worst-case failure if patched incorrectly**: Admin health data exposed to non-admin authenticated users if the `permission_admin()` guard is wired to the wrong route, or if a misconfigured CORS or nonce handling allows unauthenticated reads.
- **User-visible failure mode**: `/admin` shows a blank page, crashes the route tree, or exposes an unhandled 403/404 error to the user instead of a clean "Access denied" message.
- **Backend authority risk**: Modifying the existing `/health` handler instead of adding a new `/admin/health` route would break the Phase 0 soak tracker contract. Guard: the existing route must not be touched.
- **Stale-state risk**: Caching admin health responses could show stale system status. Guard: `fetchAdminHealth()` must not add any cache layer.
- **Human approval required before merge**: Yes — to confirm the `manage_options` capability is the correct admin gate for this WordPress installation, and to verify that diagnostic data shown does not expose sensitive operational details beyond what is appropriate.

### 7. Test requirements

- **PHP**: Add a test in `wordpress/smc-superfib-sniper/tests/php/` covering `GET /wp-json/sniper/v1/admin/health` — assert 403 for `current_user_can('read')` only users and 200 for `current_user_can('manage_options')` users. Assert existing `/health` endpoint tests still pass unchanged.
- **Frontend manual verification**:
  - Log in as admin → navigate to `/admin` → health data renders without error.
  - Log in as non-admin → navigate to `/admin` → "Access denied" renders, no health data visible.
  - Log out → navigate to `/admin` → redirected to `/login`.
  - Navigate back to `/account`, `/live`, `/signals` after visiting `/admin` → no breakage.
- **Route tree**: Confirm TanStack Router devtools (or a route list log) shows `/admin` present alongside existing routes.

### 8. Implementation handoff

- **Branch naming**: `codex/admin-health-route`
- **Commit grouping**:
  - Commit 1: `feat(php): add permission_admin() and GET /sniper/v1/admin/health endpoint`
  - Commit 2: `feat(api): add fetchAdminHealth() and AdminHealthResponse type`
  - Commit 3: `feat(routes): add /admin health page and register route`
- **Required artifacts after implementation**:
  - `reports/codex-implementation.md` summarising all files changed, tests run, and any open risks
  - Normal open PR against the repo default branch
- **State transition required**: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
