# SMC SuperFIB - Codex Implementation Plan

## 1. Issue validation

**Reported root cause:** `/admin/soak-report` returns 404 because the route is not registered.

**Verdict: Rejected.** The snapshot `INITIAL-20260511T000000Z.json` explicitly lists `"GET /sniper/v1/admin/soak-report"` in the `admin_routes` array, and the PHP file contains both the `register_routes` call and the `get_soak_report` callback. A missing registration cannot produce a registered-route snapshot entry.

**Corrected root cause:** The route registration is present but the handler `get_soak_report` throws an unhandled exception or returns a non-`WP_REST_Response` value at runtime, causing WordPress REST to emit a 404-shape error instead of a structured error response.

---

**Confirmed**
- Route `/sniper/v1/admin/soak-report` is registered in `smc-superfib-sniper.php`.
- Frontend consumer `fetchSoakReport()` exists in `src/lib/api/sniperClient.ts` and targets the correct path.
- A prior implementation cycle (`extend-admin-into-a-phase-0-soak-report-builder--2026-05-10T16-52-04-862Z`) touched this route, confirming it was in active flux before the regression.

**Likely**
- `ensure_soak_tables()` fails silently or the `soak_checkpoints` table does not yet contain a `baseline_checkpoint` row, causing the handler to reach an unguarded code path that crashes or returns `null`, which WordPress wraps as 404.
- The `baseline_checkpoint` row creation logic either was removed in the prior cycle or was never committed.

**Unconfirmed**
- Whether `wpdb` global is available and connected at handler invocation time.
- Whether a PHP fatal error (class not found, undefined method) is the actual crash site.
- Whether the WordPress REST permission callback `permission_admin()` itself rejects the request before reaching `get_soak_report`.

---

## 2. Implementation contract

### File 1

- **Exact file path:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- **Exact target:** Method `get_soak_report` inside the plugin class; and secondarily `ensure_soak_tables`.
- **Exact change required:**
  1. Wrap the entire body of `get_soak_report` in a `try/catch` that returns a `WP_REST_Response` with HTTP 500 and a structured JSON error body on any exception, so WordPress never falls through to its own 404 handler.
  2. After calling `ensure_soak_tables()` at the top of `get_soak_report`, assert the call succeeded (check return value or `$wpdb->last_error`); if it failed, return `WP_REST_Response(['error' => 'table_init_failed', 'detail' => $wpdb->last_error], 500)`.
  3. After querying `soak_checkpoints` for `baseline_checkpoint`, if no row is found, seed an initial row with `type = 'baseline_checkpoint'`, `created_at = now()`, and `payload = '{}'` (or whatever the table schema requires), then re-query. Do not return 404 for a missing row; return the seeded row with a `"seeded": true` flag in the response body.
  4. Ensure the final `return` statement is always a `new WP_REST_Response($data, 200)` — never `null`, never a bare array.
- **Guard rails:**
  - Do not change the route registration string `/admin/soak-report`.
  - Do not change the `permission_admin()` callback.
  - Do not alter the table schema or column names in `ensure_soak_tables()` beyond what is required to make `baseline_checkpoint` seedable.
  - Do not touch any other handler method (`get_soak_evidence`, `get_soak_checkpoint`, `get_health`, etc.).
- **Why this file is in scope:** It is the sole PHP file that owns the failing handler. The 404 originates here.
- **Acceptance criterion:** A GET to `/wp-json/sniper/v1/admin/soak-report` with a valid admin nonce returns HTTP 200 with a JSON body containing at minimum `{ "baseline_checkpoint": { ... } }`. A request with no nonce must still return 401, not 404.

---

### File 2

- **Exact file path:** `src/lib/api/sniperClient.ts`
- **Exact target:** `fetchSoakReport()` function — specifically its error-handling branch.
- **Exact change required:** After the backend fix, this function likely already works. The only permitted change here is: if the current implementation swallows non-200 responses silently, add a guard that throws (or returns a typed error result) on HTTP 4xx/5xx so the caller receives a clear failure rather than an empty object. Do not add retry logic. Do not add caching.
- **Guard rails:**
  - Do not change the URL path string `/admin/soak-report`.
  - Do not change the auth header or nonce-passing mechanism.
  - Do not add new fields to the request.
- **Why this file is in scope:** If the handler was previously returning 404, it is possible the fetch function was silently masking the error and the dashboard was receiving an empty/undefined object. A minimal guard ensures future regressions are surfaced, not swallowed.
- **Acceptance criterion:** When the backend returns 500 (bad state), `fetchSoakReport()` rejects or returns a typed error; when the backend returns 200, it resolves with the full response body.

---

### File 3 (conditional — only if `soak_checkpoints` DDL is incomplete)

- **Exact file path:** `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- **Exact target:** `ensure_soak_tables()` method — the `CREATE TABLE IF NOT EXISTS soak_checkpoints` DDL block.
- **Exact change required:** Verify that the `type` column exists and is indexed; if the DDL is missing the `type` column or the `INDEX` on `type`, add it. This is conditional: only apply if inspection proves the column is absent.
- **Guard rails:**
  - Use `dbDelta()` for all DDL changes — do not run raw `ALTER TABLE`.
  - Do not drop or rename any existing column.
  - Do not change the table name.
- **Why this file is in scope:** If `soak_checkpoints` lacks the `type` column the query for `baseline_checkpoint` will fail with a `wpdb` error, which is one of the confirmed-likely failure modes.
- **Acceptance criterion:** `$wpdb->get_row("SELECT * FROM {$wpdb->prefix}soak_checkpoints WHERE type='baseline_checkpoint'")` executes without `$wpdb->last_error` being non-empty.

---

## 3. Patch sequence

1. **Inspect** `ensure_soak_tables()` DDL to confirm whether `soak_checkpoints` has a `type` column and whether `dbDelta` will create it correctly. This is a read-only pre-flight — no change yet.
2. **If DDL is incomplete**, patch `ensure_soak_tables()` first (File 3 above). This must land before handler changes so the table is correct when the handler runs.
3. **Patch `get_soak_report`** (File 1): add try/catch, `ensure_soak_tables()` assertion, `baseline_checkpoint` seeding, guaranteed `WP_REST_Response` return.
4. **Patch `fetchSoakReport()`** (File 2): add error-surface guard. This is the last change because the backend must be correct first for the acceptance test to be meaningful.

**Sequencing risks:**
- If step 2 (DDL patch) runs `dbDelta` in production before step 3 is deployed, there is a brief window where the table is correct but the handler still crashes. This is acceptable — a crash that returns 500 (after step 3) is safer than a silent 404.
- No cache invalidation is required. This route is not cached on the frontend.
- No database migration script is needed; `dbDelta` is idempotent.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. `curl -s -o /dev/null -w "%{http_code}" -H "X-WP-Nonce: <valid>" https://<host>/wp-json/sniper/v1/admin/soak-report` must return `200`.
2. The same curl without a nonce must return `401` (permission check still enforced).
3. `curl .../wp-json/sniper/v1/admin/health` must still return `200` (adjacent route not broken).
4. `curl .../wp-json/sniper/v1/admin/soak-evidence` and `.../admin/soak-checkpoint` must still return their expected shapes.
5. PHP error log must contain zero new `Fatal error` or `Uncaught Exception` lines after the request.
6. `$wpdb->last_error` must be empty after `ensure_soak_tables()` runs in the patched handler.

**Existing protections that must still hold:**
- `permission_admin()` must continue to block unauthenticated requests with 401.
- Stale-data read-only semantics: `get_soak_report` is a GET — it must not write to `engine_runs`, `audit_events`, or `snapshots`. The only permitted write is seeding the `baseline_checkpoint` row if absent.
- Backend is authoritative for all signal state — the frontend must not derive or override `baseline_checkpoint` from local state.

**Parity re-validations:**
- No Pine or MT5 parity re-validation is required. This route is admin-only dashboard infrastructure; it has no signal-generation surface.

**Logging that must exist after the patch:**
- On successful response, log at `info` level: `soak_report_served baseline_checkpoint_id=<id> seeded=<bool>`.
- On caught exception, log at `error` level: `soak_report_handler_exception message=<msg>`.
- On `ensure_soak_tables()` failure, log at `error` level: `soak_tables_init_failed wpdb_error=<msg>`.

---

## 5. Non-goals

**Out of scope for this patch:**
- Adding new fields to the soak report response beyond what `get_soak_report` already computes.
- Changing the dashboard UI in `src/routes/admin.tsx` beyond what is forced by a corrected API response shape.
- Migrating soak storage from `wpdb` to any other persistence layer.
- Adding authentication middleware beyond the existing `permission_admin()` callback.
- Fixing any other admin route (health, soak-evidence, soak-checkpoint) even if they exhibit similar patterns.
- Writing a backfill script to populate historical `soak_checkpoints` rows.
- Enabling or extending Phase 0 promotion logic — this patch only unblocks the read path.

**Attractive but unsafe follow-on changes to avoid in this patch:**
- Do not refactor the entire `register_routes` method while fixing `get_soak_report` — route registration is confirmed working and any refactor risks introducing a real 404.
- Do not change the `ensure_soak_tables()` schema to consolidate soak tables — the DDL change scope is strictly additive (missing column only).
- Do not add frontend state management for the soak report (caching, polling, optimistic updates) — the frontend must remain a passive consumer.
- Do not bump the `sniper/v1` API version prefix to resolve the conflict — the route prefix is confirmed correct in the snapshot.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
- If the try/catch in `get_soak_report` catches an exception but the fallback return value is malformed, the frontend may receive a 200 with an empty or null body. `src/routes/admin.tsx` could then render a blank soak report with no visible error, silently blocking Phase 0 validation without surfacing the fault.

**User-visible failure mode:**
- Before patch: Admin soak report page shows a 404 error or fails silently with no data.
- After incorrect patch: Admin soak report page loads but shows empty/zero values, misleading the operator into believing soak state is clean when it is not.
- After correct patch: Admin soak report page displays `baseline_checkpoint` data with a `"seeded": true` flag on first load, confirming the row was just created.

**Backend authority or stale-state risks:**
- The `baseline_checkpoint` seeding logic (step 3 of the patch) writes to `soak_checkpoints`. This is the only write introduced. It must be idempotent: seed only if the row does not exist (`INSERT ... IF NOT EXISTS` or equivalent). A non-idempotent seed could create duplicate rows on concurrent requests, corrupting the checkpoint baseline.
- `ensure_soak_tables()` is already called elsewhere in the plugin lifecycle. The DDL patch (if needed) must use `dbDelta` to avoid double-execution conflicts.

**Human approval before merge:**
- Not required per the research report's own risk flags. However, given the seeding write into `soak_checkpoints`, the implementation agent should attach a before/after snapshot of the `soak_checkpoints` table row count to the PR body so a human reviewer can confirm no data was duplicated in staging.

---

## 7. Test requirements

**Tests to add:**

1. **PHP unit test** — `wordpress/smc-superfib-sniper/tests/php/` — new test class `Test_Get_Soak_Report`:
   - Case A: `soak_checkpoints` table is empty → handler returns 200 with `baseline_checkpoint` present and `seeded = true`.
   - Case B: `soak_checkpoints` table already has a `baseline_checkpoint` row → handler returns 200 with that row and `seeded = false`.
   - Case C: `wpdb` query returns a `WP_Error` → handler returns 500 with structured error JSON, not 404.
   - Case D: Unauthenticated request → `permission_admin()` returns false → handler returns 401, never reaches `get_soak_report` body.

2. **TypeScript/Vitest test** — `src/lib/api/` — extend or add test for `fetchSoakReport()`:
   - Case A: Mock server returns 200 with valid body → resolves with typed data.
   - Case B: Mock server returns 500 → rejects or returns typed error (not silent empty object).

**Existing tests that must still pass:**
- All tests under `wordpress/smc-superfib-sniper/tests/php/` must continue to pass without modification.
- All existing frontend API tests in `src/lib/api/` must pass.
- Smoke test report (if automated) must show `/admin/soak-report` green after patch.

**Soak / live-environment verification:**
- After deploy to staging: run the Phase 0 checklist item that originally reported the 404 and confirm it resolves to 200.
- Confirm `soak_checkpoints` table has exactly one row with `type = 'baseline_checkpoint'` after first hit.
- Confirm the row is not duplicated on second hit.

---

## 8. Implementation handoff

**Branch naming recommendation:**
```
fix/soak-report-handler-runtime-404
```

**Suggested commit grouping:**

1. `fix(backend): guard get_soak_report against runtime exceptions and missing baseline_checkpoint` — PHP handler changes only.
2. `fix(backend): ensure soak_checkpoints DDL includes type column` — DDL change only (commit separately so it can be skipped if inspection proves it is not needed).
3. `fix(api): surface errors from fetchSoakReport instead of swallowing them` — TypeScript client change only.

**Required artifacts to generate after implementation:**
- Updated smoke test report showing `/admin/soak-report` returning 200.
- `soak_checkpoints` table row-count snapshot (before and after first POST to staging).
- PHP error log excerpt confirming zero new fatal errors after the patch.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
