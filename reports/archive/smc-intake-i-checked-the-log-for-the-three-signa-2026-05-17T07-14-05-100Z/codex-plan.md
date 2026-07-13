# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

**Confirmed**

- `permission_ea_bridge()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` is correctly rejecting the EA request with HTTP 400 and code `smc_sf_user_required`. This is intentional behaviour, not a backend bug.
- The log line `SMC SuperFIB EA bridge auth failed: missing user_id` at 2026-05-16 11:48:18–11:48:19 UTC originates inside `permission_ea_bridge()` and confirms that the auth callback received a payload in which `user_id` was absent or zero.
- No `license allowed` or `license blocked` log entries follow, confirming the failure occurs at the auth layer before the license-decision layer is reached.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17.md` classifies this exact failure as a documented correct 400 and notes live validation is still pending — confirming the gate works and the client is the failing party.

**Likely**

- The MT5 EA request construction path for `GET /ea/license-check` is omitting or dropping `user_id` during payload serialisation, query encoding, or HTTP request assembly. `GET` requests with a JSON body are frequently silently dropped by PHP's `php://input` parser or by intermediate HTTP clients; the EA may be sending the body in a form the PHP side does not read for GET.
- The CORS inconsistency warning (`SMC SuperFIB: CORS configuration inconsistency detected.`) is a separate non-fatal diagnostic emitted during plugin `init`. It does not cause the auth rejection. It may indicate an allowed-origins mismatch that could surface as a separate issue on OPTIONS pre-flight if the EA client performs CORS negotiation, but it is not the root cause here.

**Unconfirmed**

- The exact live MT5 payload shape for the failing request (JSON body, query string, or custom header).
- Whether the log entries correspond exclusively to `/ea/license-check` or also to other EA bridge endpoints sharing `permission_ea_bridge()`.
- Whether the GET body is structurally absent from the MT5 request or present but discarded server-side by the PHP request parser in this hosting environment.

**Corrected root cause statement:** The MT5 EA client is not delivering a valid `user_id` to `permission_ea_bridge()` for the `/ea/license-check` request. The backend correctly rejects it. The fix belongs on the MT5/EA request construction path, not in the backend auth handler.

---

## 2. Implementation contract

### File 1

**Path:** MT5 EA client source file that constructs `GET /ea/license-check` (exact path to be confirmed by implementation agent before proceeding — inspect EA source directory for the request-construction function targeting `/ea/license-check`)

**Function/section to modify:** The function or procedure that assembles and sends the `GET /ea/license-check` HTTP request.

**Exact change required:**

1. Confirm that `user_id` (integer, non-zero, matching the licensed WordPress user) is retrieved and in scope before the request is assembled.
2. Transmit `user_id` via a mechanism that `permission_ea_bridge()` can read server-side. The safest proven mechanism for a GET endpoint in this stack is a query parameter: `?user_id=<int>`. If the existing backend reader already consumes `$_GET['user_id']` or `$request->get_param('user_id')`, this requires only adding the parameter to the request URL. If not, see File 2 below.
3. Do not remove or replace the existing API key header(s) (`X-EA-API-Key` / `X-API-KEY`) — these must remain present alongside `user_id`.

**Guard rails:**

- Do not remove authentication. Do not introduce an anonymous fallback path.
- Do not change the target endpoint URL beyond adding the query parameter.
- Do not alter the API key header logic or add alternate auth bypass tokens.

**Why in scope:** The MT5 EA client is the only party that constructs the failing request. The backend already behaves correctly.

**Acceptance criterion:** After the patch, `GET /ea/license-check` with a valid `user_id` and API key reaches `permission_ea_bridge()` and passes auth; the log contains `license allowed` or `license blocked` rather than `missing user_id`.

---

### File 2 (conditional — include only if backend does not already read `user_id` from query string)

**Path:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Function/section to modify:** `permission_ea_bridge()` — the block that resolves `$ea_user_id`.

**Exact change required:** Add a fallback read of `user_id` from `$request->get_param('user_id')` (which reads query string for GET) if `$ea_user_id` is not already resolved from the JSON body. The fallback must cast to integer and must still reject zero or negative values with the same 400 / `smc_sf_user_required` response. No other logic in `permission_ea_bridge()` may change.

**Guard rails:**

- The requirement that `user_id` be a valid positive integer must not be relaxed.
- API key validation logic must not change.
- `wp_set_current_user($ea_user_id)` call on success path must remain.
- 400 vs 403 semantic distinction must be preserved.
- This change is only permitted if the existing body-read path for GET is confirmed to be unreachable in this environment (i.e., PHP drops GET bodies).

**Why in scope:** If PHP silently discards the GET request body and the EA cannot switch to POST, the backend must provide an alternate read path that still enforces the same auth contract.

**Acceptance criterion:** `permission_ea_bridge()` continues to reject missing, zero, or non-integer `user_id` with 400; accepts valid `user_id` via query parameter when body is empty; all existing test assertions in `test-ea-license-check.php` still pass.

---

### File 3

**Path:** `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`

**Function/section to modify:** Add a new test case alongside existing auth failure cases.

**Exact change required:** Add a test that sends `GET /ea/license-check` with a valid API key and `user_id` delivered as a query parameter (not body), and asserts HTTP 200 (or 403 license-blocked — not 400 auth-rejected). This test covers the fixed delivery path and guards against regression if the query-param read path is ever removed from `permission_ea_bridge()`.

**Guard rails:**

- Do not modify or remove any existing test cases.
- The new test must use the same mock/fixture infrastructure as existing tests.
- The new test must not weaken the 400-on-missing-user_id assertion.

**Why in scope:** The existing test suite does not cover `user_id` delivery via query string for GET. The fix adds a new code path; the test must cover it.

**Acceptance criterion:** New test passes; existing tests remain green; `test-cors-regression.php` is unaffected.

---

### File 4

**Path:** `reports/phase-1-ea-bridge-implementation-report.md`

**Function/section to modify:** Known-issues or status section.

**Exact change required:** Add a record of this bug and its resolution: log evidence, root cause (EA not sending `user_id`), fix applied (query param delivery), and confirmation that backend contract was not weakened. Update live-validation status if appropriate after the fix is deployed.

**Guard rails:** No code logic. Documentation only.

**Why in scope:** The BUG_SWEEP_REPORT already tracks this as open. The implementation report must reflect resolution.

**Acceptance criterion:** Report accurately states fix applied and does not misrepresent the root cause as a backend defect.

---

## 3. Patch sequence

1. **Inspect** the MT5 EA source to identify the exact request-construction code for `/ea/license-check` and confirm the current payload shape. Block all subsequent steps on this.
2. **Inspect** `permission_ea_bridge()` in `smc-superfib-sniper.php` to confirm whether `$request->get_param('user_id')` is already called or if only body parsing is used. This determines whether File 2 is required.
3. **Apply File 1** — MT5 EA client: add `user_id` to the query string of the `GET /ea/license-check` request.
4. **Apply File 2** (only if step 2 confirms body-only read) — `permission_ea_bridge()` query-param fallback. This step depends on step 3 because the test in step 5 must reflect the actual delivery mechanism.
5. **Apply File 3** — add the query-param test case. Depends on steps 3 and 4 being complete so the correct delivery path is tested.
6. **Apply File 4** — update the implementation report. Depends on steps 3–5 passing.

**Sequencing risks:**

- If File 2 is applied before File 1 is confirmed working, there is a risk that the backend silently accepts malformed requests (e.g., `user_id=0` in query string if validation logic has an off-by-one). Validate File 2 in isolation before deploying to a live environment.
- No database migrations, cache invalidations, or contract version bumps are required. Auth rejection is stateless.
- If the MT5 EA uses a compiled or deployed binary, the EA-side fix (File 1) may require a separate deployment cycle. In that window, the backend remains correctly rejecting and no data-integrity risk exists.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

- Run `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` in full. All pre-existing assertions must pass without modification.
- Run `wordpress/smc-superfib-sniper/tests/php/test-cors-regression.php`. The CORS warning path must remain isolated and not interfere with auth.
- Send a manual `GET /ea/license-check` request with `user_id` absent — must still return 400 / `smc_sf_user_required`.
- Send a manual `GET /ea/license-check` request with `user_id=0` — must still return 400.
- Send a manual `GET /ea/license-check` request with a valid `user_id` and API key — must return 200 or 403 (never 400).
- Confirm that `wp_set_current_user()` is called on the success path by checking WordPress user context is set for a subsequent write in the same request.

**Existing protections that must still hold:**

- `permission_ea_bridge()` must reject `user_id` that is absent, zero, or non-integer with HTTP 400.
- Invalid or missing API key must return HTTP 403, not 400.
- No anonymous access to any EA bridge route.
- CORS allowed-origins list must not be widened as a side effect of this patch.

**Parity re-validations required:**

- MT5-to-PHP bridge contract: confirm `user_id` is now present and matches the expected WordPress user ID in the live EA payload.
- Phase 1 gate: re-run the Phase 1 bridge migration audit check for `/ea/license-check` readiness after fix is deployed.

**Logging and diagnostics that must exist after the patch:**

- `SMC SuperFIB EA bridge auth failed: missing user_id` must no longer appear in the live log for normal EA traffic.
- Successful auth must produce a log entry (confirm the existing success log path is present in `permission_ea_bridge()`; if absent, add a single `error_log` or equivalent at the `wp_set_current_user` call site — but only if it does not already exist).

---

## 5. Non-goals

- Do not relax or bypass the `user_id` requirement in `permission_ea_bridge()`.
- Do not change the HTTP method of `/ea/license-check` from GET to POST — method changes affect the REST route registration and are out of scope for this patch.
- Do not resolve the CORS inconsistency warning in this patch. It is a separate diagnostic and has its own investigation path.
- Do not modify the license-decision layer, license-check response payload, or any logic that executes after successful auth.
- Do not change API key header handling, validation logic, or the four supported header name forms.
- Do not add retry logic, exponential backoff, or resilience patterns to the EA client in this patch.
- Do not update or extend the allowed-origins CORS list.
- Do not touch Pine trading formulas, frontend selectors, dashboard state, or MT5 signal-generation logic.
- Do not audit or refactor other EA bridge endpoints beyond `/ea/license-check`.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If `permission_ea_bridge()` is modified incorrectly (e.g., zero-check removed, or anonymous fallback introduced), the backend auth gate is weakened, allowing unauthenticated writes into the EA ingest path, which could corrupt the WordPress user binding for license records. This would be a security and data-integrity failure.

**User-visible failure mode:**

If the MT5 EA fix is applied but the query param is not delivered correctly (e.g., encoding error, wrong parameter name), the EA continues to be rejected with 400 and the license-check gate remains blocked. The user sees no change. This is safe but non-functional.

**Backend authority and stale-state risks:**

Low. The failure is at the auth layer before any persistence occurs. No stale data is written during the failing requests. Fixing the EA delivery path does not introduce any new persistence race.

**Whether human approval should be required before merge:**

Yes. This patch touches an authentication boundary (`permission_ea_bridge()`), a Phase 1 live gate, and the MT5-to-PHP contract. The conditional File 2 change, if required, modifies the auth callback directly. A human reviewer must confirm:

1. The `user_id` validation logic after the patch is not weakened.
2. The EA-side change is confirmed to send a non-zero `user_id` for the correct licensed user.
3. Test results from `test-ea-license-check.php` are attached to the PR.

---

## 7. Test requirements

**Tests to add:**

- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`: one new test case — `GET /ea/license-check` with valid API key and `user_id` as query parameter — asserts non-400 response. Target: the query-param read path in `permission_ea_bridge()`.

**Existing tests that must still pass:**

- All existing cases in `test-ea-license-check.php` (valid auth, missing auth, missing payload, invalid API key).
- All existing cases in `test-cors-regression.php`.

**Manual checks required:**

- Live EA-side verification: fire a real `GET /ea/license-check` from the MT5 EA after the fix and confirm the log no longer contains `missing user_id`.
- Confirm `license allowed` or `license blocked` appears in the log, confirming the auth layer was passed and the license-decision layer was reached.

**Soak / parity / live-environment verification:**

- After the EA-side fix is deployed, monitor the live log for a minimum of one full EA session cycle (connect, license-check, ingest sequence) to confirm the auth failure does not recur.
- Re-run the Phase 1 bridge parity audit (`/wp-json/sniper/v1/ea/license-check` registration and `permission_ea_bridge` binding) after deployment.

---

## 8. Implementation handoff

**Branch naming recommendation:** `fix/ea-bridge-license-check-missing-user-id`

**Suggested commit grouping:**

1. `fix(ea-client): include user_id as query param in GET /ea/license-check request` — MT5 EA client change (File 1).
2. `fix(permission-ea-bridge): accept user_id from query string for GET requests` — conditional backend fallback (File 2), only if required.
3. `test(ea-license-check): add query-param user_id delivery test case` — File 3.
4. `docs(phase-1-report): record ea-bridge missing-user_id fix and resolution` — File 4.

**Required reports or artifacts after implementation:**

- Updated `reports/phase-1-ea-bridge-implementation-report.md` with resolution record.
- Test run output from `test-ea-license-check.php` attached to the PR.
- Live log excerpt confirming `license allowed` or `license blocked` (not `missing user_id`) from at least one successful post-fix EA session.

**State transition:** `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
