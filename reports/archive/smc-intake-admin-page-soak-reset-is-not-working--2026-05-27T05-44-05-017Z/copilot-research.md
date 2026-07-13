# SMC SuperFIB - Admin Soak Reset Research

**Date:** 2026-05-27
**Issue:** SMC Intake - /admin page soak reset is not working so we can start a new soak. Error: API /admin/soak-reset failed: 404 - {"code":"rest_no_route","message":"No route was found matching the URL and request method.","data":{"status":404}}

---

## 1. Issue classification

- **Severity:** HIGH
- **Category:** REST-API / wiring
- **Layer(s) affected:** PHP-backend / Dashboard-JS
- **Phase impact:** Phase 0 / Phase 4

---

## 2. Confirmed evidence

- `src/lib/api/sniperClient.ts`
  - `resetSoak()` calls `call("/admin/soak-reset", { method: "DELETE" })`.
  - `call()` constructs the request URL as `${backendUrl.replace(/\/$/, "")}/sniper/v1${path}`.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `const NAMESPACE = 'sniper/v1';`
  - `register_rest_route(self::NAMESPACE, '/admin/soak-reset', array('methods' => WP_REST_Server::DELETABLE, 'callback' => array($this, 'reset_soak'), ...))`.
  - `public function reset_soak(WP_REST_Request $request)` exists and returns a successful reset payload.
- The reported failure is a WordPress REST `404 rest_no_route`, which means the endpoint/method was not found at request time.

---

## 3. Root cause hypothesis

- Confirmed: the codebase defines the expected route path and HTTP method on both client and backend.
- Hypothesis: the route is not registered or not reachable in the active backend instance.
- Hypothesis: the frontend may be sending the request to a misconfigured `backendUrl`, causing a different server to respond.
- Hypothesis: the plugin bootstrap or REST registration phase may be skipped in the current runtime environment, making the route absent despite the code existing.

---

## 4. Blast radius

- Files likely affected:
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Systems affected:
  - Admin dashboard soak reset UI
  - WordPress REST API backend
  - Soak lifecycle reset and evidence deletion flow
- Parity surface at risk:
  - No Pine parity impact
  - Admin/soak control flow only
- Risk area:
  - inability to start a fresh soak or clear prior soak state

---

## 5. Regression surface

- The endpoint clears soak checkpoints and evidence; the delete semantics must be preserved.
- The route is protected by `permission_admin`; permission behavior must remain intact.
- Existing REST route tests in `wordpress/smc-superfib-sniper/tests/php/` may cover the broader REST API bootstrap area.

---

## 6. Resolution path options

- Path A: repair backend route registration / runtime availability so `DELETE /wp-json/sniper/v1/admin/soak-reset` resolves correctly.
- Path B: fix backend URL configuration or app runtime routing if the client is targeting the wrong server.
- Recommended: Path A, because the endpoint is already defined correctly in the current code and the failure is most likely a registration/runtime availability issue.

---

## 7. Risk flags

- High-risk system involved: Yes — admin soak reset controls restart of soak state.
- Requires parity re-validation: No.
- Migration-blocking: Yes — new soak start is blocked until reset works.
- Human review required before merge: Yes — admin API and reset semantics should be validated carefully.

---

## 8. Handoff package

- Epicentre files to inspect first:
  - `src/lib/api/sniperClient.ts`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Inputs Codex must verify before planning:
  1. The runtime backend URL used by the admin app.
  2. Whether `wp-json/sniper/v1/admin/soak-reset` is registered and reachable in the current backend.
  3. Whether `DELETE` is accepted by the route and not blocked by plugin bootstrap.
- Open unknowns:
  - whether the active backend instance has the plugin loaded and routes registered
  - whether `backendUrl` is overridden in the runtime environment
  - whether the failure is specific to the current environment or general to the route
