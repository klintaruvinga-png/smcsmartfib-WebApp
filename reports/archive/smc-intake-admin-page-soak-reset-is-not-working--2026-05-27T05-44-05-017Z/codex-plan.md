# SMC SuperFIB — Admin Soak Reset 404 Fix

**Plan artifact:** `reports/codex-plan.md`
**Input artifact:** `reports/copilot-research.md`
**Date:** 2026-05-27

---

## 1. Issue validation

### Confirmed

- **Client call is correct.** `sniperClient.ts::resetSoak()` issues `DELETE /sniper/v1/admin/soak-reset`. The URL construction `${backendUrl}/sniper/v1/admin/soak-reset` is consistent with the WordPress REST namespace and route registration in `smc-superfib-sniper.php`.
- **Server-side route definition is correct.** `register_rest_route(self::NAMESPACE, '/admin/soak-reset', [...'methods' => WP_REST_Server::DELETABLE...])` matches the client exactly. The callback and permission check both exist.
- **The 404 `rest_no_route` is a runtime registration miss, not a code-path mismatch.** WordPress only emits `rest_no_route` when no registered route matches the URL+method at dispatch time. Because the code definition is confirmed correct, the failure is environmental: the route is absent from the live REST registry.

### Likely

- **Plugin bootstrap is not completing in the active instance.** The most probable cause is that the plugin file is not active, the class instantiation block that calls `register_rest_routes()` is gated behind a condition that is false in the current runtime, or the `rest_api_init` hook registration is missing or firing after the route is needed.
- **`backendUrl` may point to a different WordPress install or a reverse-proxy target where the plugin is not active.** If `.env` or a runtime override routes `backendUrl` to a staging or proxy URL that does not load the plugin, the route will never appear.

### Unconfirmed

- Whether a second or stale plugin copy is installed and conflicting with the current code.
- Whether a REST route cache (object cache, Varnish, or WP Super Cache) is returning a stale 404.
- Whether the WordPress instance has the plugin activated at all (plugins must be "activated" in WP admin, not just present on disk).

### Corrected root cause

The research report hypothesis (Path A) is accepted. The route definition in code is correct. The failure is that the route is absent from the live WordPress REST registry at request time. The most likely sub-cause is one of: (a) plugin not activated, (b) `rest_api_init` hook not firing for the class, or (c) `backendUrl` targeting an instance where the plugin is not loaded. Sub-cause (b) is the only one addressable by a code patch; (a) and (c) are deployment/configuration fixes.

---

## 2. Implementation contract

### File 1 — `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

| Field | Value |
|---|---|
| **Exact section** | Plugin bootstrap block — the code path that hooks `register_rest_routes()` (or equivalent) onto `rest_api_init` |
| **Exact change** | Verify that `add_action('rest_api_init', [$this, 'register_rest_routes'])` (or the equivalent method name) is called unconditionally from the plugin's primary instantiation point, not wrapped in an `is_admin()`, `current_user_can()`, capability check, or any other guard that could be false during a REST request. If such a guard exists, remove it from the hook registration (not from the callback). The permission check inside `reset_soak()` must stay. |
| **Guard rails** | The `permission_callback` inside the route registration must not be removed or weakened. The `reset_soak()` callback logic must not change. The route path, namespace constant, and HTTP method (`DELETABLE`) must not change. |
| **Why in scope** | This is the only file that can register the route. If the route is absent at runtime, the registration hook is the only code-level fix available. |
| **Acceptance criterion** | `GET /wp-json/sniper/v1` returns a route index that includes `admin/soak-reset` with method `DELETE`. The soak reset button in /admin completes with HTTP 200 instead of 404. |

### File 2 — `src/lib/api/sniperClient.ts`

| Field | Value |
|---|---|
| **Exact section** | `resetSoak()` method and the `call()` helper — specifically the `backendUrl` source |
| **Exact change** | Add a development-time guard or assertion that logs the fully-constructed URL before the request is dispatched (e.g. `console.debug('[sniperClient] resetSoak →', url)`). This is a diagnostics-only change to confirm the URL in the browser console during verification. No logic change. |
| **Guard rails** | No change to `backendUrl` resolution, `call()` internals, method, path, or error handling. The debug log must be removed if it is not already present; do not add it if a log already exists. |
| **Why in scope** | The research identifies `backendUrl` misconfiguration as a likely sub-cause. A visible log line allows the verifier to confirm the URL is correct without code change to logic. |
| **Acceptance criterion** | Browser console shows the correct WordPress REST base URL during a reset attempt. |

### File 3 — `.env` / runtime environment configuration (not a code file — deployment verification only)

| Field | Value |
|---|---|
| **Exact section** | `VITE_BACKEND_URL` or equivalent environment variable that sets `backendUrl` |
| **Exact change** | Verify the value points to the WordPress instance where the plugin is activated. No code change; document finding in implementation report. |
| **Guard rails** | Do not commit `.env` values to the repository. |
| **Why in scope** | Research identifies `backendUrl` misconfiguration as a co-equal hypothesis with registration failure. Must be ruled out before the patch is considered complete. |
| **Acceptance criterion** | `backendUrl` value matches the hostname of the WordPress install that has the plugin activated. |

---

## 3. Patch sequence

1. **Verify deployment state first (no code change).** Confirm plugin is activated in WordPress admin and confirm `backendUrl` in `.env` targets the correct instance. If either is wrong, fix the deployment before touching code.
2. **Inspect `rest_api_init` hook registration in `smc-superfib-sniper.php`.** Locate the exact line that registers the hook (or fails to). Identify any conditional guard wrapping it.
3. **Remove the guard (if found) from the hook registration line only.** Do not touch the permission callback or callback body.
4. **Add the debug log to `sniperClient.ts::resetSoak()`.** This must be applied before the verification run so the URL is visible.
5. **Flush WordPress rewrite rules** (`Settings → Permalinks → Save` or `wp rewrite flush`) after any plugin change. WordPress REST route registration is cached in the rewrite table; skipping this step will reproduce the 404 even after a correct code fix.
6. **Run acceptance verification** (see §4).
7. **Remove the debug log** from `sniperClient.ts` if it is no longer needed.

### Sequencing risks

- Steps 2–3 depend on step 1 being resolved first. If `backendUrl` is wrong, patching `smc-superfib-sniper.php` will appear to have no effect and waste a deployment cycle.
- Step 5 (permalink flush) is mandatory after step 3. This is a runtime state dependency that does not appear in the code diff. Omitting it is the most common cause of a "code is correct but still 404" failure.
- There is no database migration or cache migration required beyond the permalink flush.

---

## 4. Regression guards

### Checks the implementation agent must run after patching

1. `curl -X DELETE https://<backend>/wp-json/sniper/v1/admin/soak-reset -H "Authorization: Bearer <token>"` must return HTTP 200 with a JSON reset payload, not 404.
2. `GET /wp-json/sniper/v1` route index must list `/admin/soak-reset` with `DELETE` in the methods array.
3. Attempt the reset from the `/admin` UI and confirm the soak state clears.
4. Attempt the reset without authentication and confirm HTTP 401/403 (permission callback still enforced).

### Existing protections that must still hold

- `permission_admin` guard on the route must reject unauthenticated requests.
- All other `sniper/v1` routes must continue to respond correctly (route registration must not have been broken by the change).
- Soak checkpoint and evidence deletion logic inside `reset_soak()` must execute identically to before the patch.

### Parity re-validations

None required. This is admin/soak lifecycle only. No Pine formula, MT5 signal, or regime state is involved.

### Logging / diagnostics that should exist after the patch

- WordPress PHP error log must show no new warnings or fatal errors after the plugin bootstrap change.
- Browser console must show the correct backend URL from the temporary `sniperClient.ts` debug log during the verification run.
- After the verification run, remove the debug log and confirm removal in the final commit.

---

## 5. Non-goals

- **Do not change the reset logic inside `reset_soak()`.** The callback is not implicated in the failure.
- **Do not change the `permission_callback`.** Authentication and authorization are not the reported problem.
- **Do not change the route path, namespace, or HTTP method.** Both sides of the contract are already aligned.
- **Do not add a fallback HTTP method (e.g., POST).** Changing the contract to accommodate the failure symptom would hide future registration bugs.
- **Do not add client-side retry logic.** A 404 from the backend is a hard failure; retrying it is not a fix.
- **Do not audit or refactor other REST routes.** Scope is this one endpoint only.
- **Do not change soak state data structures or evidence storage.** Only the registration wiring is in scope.
- **Do not modify WordPress plugin activation/deactivation hooks.** These affect other functionality and are outside the patch blast radius.
- **Attractive but unsafe follow-ons to avoid:**
  - Adding a `GET` alias for the reset endpoint "for easier testing."
  - Moving route registration to a different hook (e.g., `init`) because it "feels safer."
  - Consolidating all `register_rest_route` calls into a single file.

---

## 6. Risk assessment

### Worst-case failure mode if patched incorrectly

If the `rest_api_init` guard removal is too broad (e.g., an entire class instantiation block is moved rather than just the hook registration line), unintended code paths may execute during REST requests — including admin-only initialization logic that depends on WordPress admin context. This could produce PHP warnings, break other REST routes, or expose admin state to REST callers.

### User-visible failure mode

If the patch is incomplete (e.g., permalink flush omitted), the 404 will persist despite correct code. The user will see the same error: `API /admin/soak-reset failed: 404 - rest_no_route`. This is observable and does not corrupt data.

If the permission callback is accidentally removed, unauthenticated callers can trigger soak reset. This is a security regression with direct operational impact: soak state and evidence can be destroyed without authorization.

### Backend authority and stale-state risks

The `reset_soak()` callback deletes soak checkpoint data. If it is called twice in rapid succession (e.g., due to a UI retry), the second call may encounter already-cleared state. This is a pre-existing condition, not introduced by this patch. The patch does not change delete semantics.

### Human approval required before merge

**Yes.** The soak reset endpoint directly modifies admin state and clears evidence. The permission callback change risk (even accidental) warrants human review of the diff before merge. The research report also flags this explicitly.

---

## 7. Test requirements

### Tests to add or update

- **`wordpress/smc-superfib-sniper/tests/php/` — add or update REST route registration test:**
  - Assert that after `do_action('rest_api_init')`, the route `sniper/v1/admin/soak-reset` with method `DELETE` is present in the WP REST server's route registry.
  - This test verifies the registration hook fires unconditionally and does not depend on admin context.

- **`wordpress/smc-superfib-sniper/tests/php/` — add unauthenticated rejection test:**
  - Assert that a `DELETE` request to `/wp-json/sniper/v1/admin/soak-reset` without a valid admin nonce/token returns HTTP 401 or 403.
  - This guards against accidental permission callback removal.

### Existing tests that must still pass

- All existing REST API tests in `wordpress/smc-superfib-sniper/tests/php/` must pass without modification.
- All TypeScript/Jest tests in `src/` must pass — the debug log addition to `sniperClient.ts` must not break existing test assertions.

### Soak / replay / live-environment verification

- After deployment, perform a manual end-to-end soak reset from the `/admin` UI on the live WordPress instance and confirm soak state clears and a new soak can be started.
- No automated soak replay is required for this patch.

---

## 8. Implementation handoff

### Branch naming recommendation

`fix/soak-reset-api-404`

### Suggested commit grouping

1. `fix(backend): ensure rest_api_init hook fires unconditionally for sniper/v1 routes` — contains only the `smc-superfib-sniper.php` change
2. `debug(sniperClient): log backendUrl in resetSoak for verification run` — temporary, reverted in commit 3
3. `chore(sniperClient): remove debug log after soak-reset verification` — removes commit 2 addition
4. `test(backend): assert soak-reset route registered and permission-protected` — test additions only

### Required reports or artifacts to generate after implementation

- Append a `## Soak Reset Fix Verification` section to `reports/codex-review.json` (or a separate `reports/soak-reset-fix.md`) containing:
  - Confirmed `backendUrl` value used during verification
  - Result of `GET /wp-json/sniper/v1` route index check
  - Result of authenticated `DELETE` call
  - Result of unauthenticated `DELETE` call (must be 401/403)
  - Confirmation that new test cases pass
  - Permalink flush step confirmed

### State transition

`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
