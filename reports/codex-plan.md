# SMC SuperFIB - Claude Plan Hardening Request

## 1. Issue validation

**Confirmed**

- `src/routes/admin.tsx` exists and calls `/wp-json/sniper/v1/admin/health` via `fetchAdminHealth()`. The page renders health cards and a per-symbol diagnostics table. No aggregation of watchlist, snapshots, candles, engine_runs, or audit_events is present.
- `get_admin_health()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` returns `build_health_payload()` which covers EngineHealth state but not the Phase 0 evidence surfaces (candles row counts, engine_run success rates, audit_event error rates, manual operator entries).
- `PHASE0_SOAK_TRACKER.md` requires 72h stability evidence, manual operator confirmation, and checkpoint snapshots. None of these are persisted or exportable from the current admin page.
- The existing `/admin/health` endpoint contract must remain identical. The research report confirms this is a non-negotiable guard rail.

**Likely**

- A new dedicated endpoint `/wp-json/sniper/v1/admin/soak-report` (Path A) is the correct isolation strategy. Extending the existing health endpoint with optional parameters risks contract drift and breaks the regression surface.
- Client-side export (markdown string generation + `window.print()` for HTML/PDF) is sufficient and eliminates the need for a server-side PDF renderer. This is lower blast radius than server-side rendering.
- Two new database tables are needed: one for persisted checkpoint snapshots (12h TTL, pruned at 72h), one for keyed manual operator evidence entries.

**Unconfirmed**

- The exact column schema of `smc_sf_snapshots`, `smc_sf_candles`, `smc_sf_engine_runs`, and `smc_sf_audit_events`. The aggregation queries in the new endpoint must be verified against the live schema before implementation. Do not assume column names not shown in the research report.
- Whether `smc_sf_watchlist` table exists with that exact name or whether watchlist state is derived from another source. Implementation agent must grep for table registration before writing aggregation queries.
- The exact WordPress `$wpdb->prefix` in use. All table references must use `$wpdb->prefix . 'smc_sf_*'` and must not hard-code the prefix.

**Rejected hypothesis**

- The research report does not show evidence that the existing `/health` endpoint is broken or incorrect. The issue is additive scope, not a defect in the existing endpoint. No correction to existing endpoint logic is warranted.

---

## 2. Implementation contract

### File 1: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Section to modify:** The block where REST routes are registered via `register_rest_route`. Locate the call that registers `admin/health` and add a sibling registration immediately after it.

**Exact change required:**

Register one new endpoint:

```
Route: /wp-json/sniper/v1/admin/soak-report
Method: GET
Permission callback: same permission_admin() function already used for admin/health — do not create a new auth function
Handler: get_soak_report()
```

Register two new endpoints for manual evidence write:

```
Route: /wp-json/sniper/v1/admin/soak-evidence
Method: POST
Permission callback: permission_admin()
Handler: upsert_soak_evidence()
```

```
Route: /wp-json/sniper/v1/admin/soak-checkpoint
Method: POST
Permission callback: permission_admin()
Handler: create_soak_checkpoint()
```

Implement `get_soak_report()` to return a single JSON object containing:
- `health`: the existing `build_health_payload()` output (call the existing function, do not duplicate it)
- `watchlist_count`: integer row count from `$wpdb->prefix . 'smc_sf_watchlist'` (verify table exists; return null if absent)
- `snapshots_24h`: integer row count from `smc_sf_snapshots` WHERE created_at >= NOW() - INTERVAL 24 HOUR
- `candles_24h`: integer row count from `smc_sf_candles` WHERE created_at >= NOW() - INTERVAL 24 HOUR
- `engine_runs_summary`: object with fields `total_24h`, `success_24h`, `error_24h`, `last_run_at` aggregated from `smc_sf_engine_runs` over the past 24h
- `audit_events_summary`: object with fields `total_24h`, `error_count_24h`, `warning_count_24h` aggregated from `smc_sf_audit_events` over the past 24h
- `manual_evidence`: array of all rows from new `smc_sf_soak_evidence` table, ordered by `updated_at DESC`
- `checkpoints`: array of checkpoint rows from new `smc_sf_soak_checkpoints` table WHERE created_at >= NOW() - INTERVAL 72 HOUR, ordered by `created_at DESC`
- `generated_at`: current UTC timestamp (ISO 8601)

Implement `upsert_soak_evidence($request)` to:
- Accept JSON body with fields: `evidence_key` (string, required), `evidence_type` (enum: signal_parity_confirm | feed_stable_window | engine_run_observation | manual_note), `evidence_value` (string), `operator` (string)
- Validate all fields server-side; reject with 400 on missing required fields
- Upsert into `smc_sf_soak_evidence` on `evidence_key`
- Return the saved row

Implement `create_soak_checkpoint($request)` to:
- Accept JSON body with fields: `operator_notes` (string, optional)
- Call `get_soak_report()` internally to capture a snapshot
- Insert `snapshot_data` (JSON-encoded report) and `operator_notes` into `smc_sf_soak_checkpoints`
- Prune rows older than 72h from `smc_sf_soak_checkpoints` in the same transaction
- Return the new checkpoint row id and `created_at`

Register a `register_activation_hook` or inline `dbDelta` call (in the existing schema setup section if one exists, otherwise append after route registration) to create:

```sql
CREATE TABLE IF NOT EXISTS {prefix}smc_sf_soak_evidence (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evidence_key VARCHAR(128) NOT NULL UNIQUE,
  evidence_type VARCHAR(64) NOT NULL,
  evidence_value TEXT NOT NULL,
  operator VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS {prefix}smc_sf_soak_checkpoints (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  snapshot_data LONGTEXT NOT NULL,
  operator_notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Use `dbDelta()` via `require_once(ABSPATH . 'wp-admin/includes/upgrade.php')`.

**Guard rails:**
- Do not modify `get_admin_health()`, `build_health_payload()`, or the existing `admin/health` route registration in any way.
- Do not alter `permission_admin()`.
- Do not add columns to existing tables (`smc_sf_engine_runs`, `smc_sf_audit_events`, `smc_sf_snapshots`, `smc_sf_candles`).
- All new SQL must use `$wpdb->prepare()` for any parameterized values. No raw string interpolation into queries.
- `get_soak_report()` must not modify any data; it is read-only.

**Why in scope:** This is the only file that registers REST endpoints and manages the WordPress DB schema for this plugin. Additive changes here are isolated and do not touch existing handlers.

**Acceptance criterion:** `GET /wp-json/sniper/v1/admin/soak-report` returns HTTP 200 with a JSON body containing all seven top-level keys. `GET /wp-json/sniper/v1/admin/health` continues to return an identical response to its pre-patch state.

---

### File 2: `src/lib/api/sniperClient.ts`

**Section to modify:** The block where `fetchAdminHealth` is defined. Add new sibling functions after it.

**Exact change required:**

Add three new exported async functions:

```
fetchSoakReport(): Promise<SoakReport>
  — GET /wp-json/sniper/v1/admin/soak-report with same auth headers as fetchAdminHealth

upsertSoakEvidence(payload: SoakEvidencePayload): Promise<SoakEvidenceRow>
  — POST /wp-json/sniper/v1/admin/soak-evidence with JSON body

createSoakCheckpoint(operatorNotes?: string): Promise<SoakCheckpointRow>
  — POST /wp-json/sniper/v1/admin/soak-checkpoint with JSON body { operator_notes }
```

All three must use the same base URL and auth mechanism as `fetchAdminHealth`. Do not introduce a new HTTP client or auth pattern.

**Guard rails:**
- Do not modify `fetchAdminHealth` or any existing function.
- Do not change the base URL construction or auth token retrieval logic.

**Why in scope:** The frontend requires typed API client functions to consume the new endpoints.

**Acceptance criterion:** All three functions resolve without TypeScript errors and match the backend endpoint signatures exactly.

---

### File 3: `src/types/sniper.ts`

**Section to modify:** Append new type definitions after the last existing export.

**Exact change required:**

Add the following types (do not modify existing types):

```typescript
export type SoakEvidenceType =
  | 'signal_parity_confirm'
  | 'feed_stable_window'
  | 'engine_run_observation'
  | 'manual_note';

export interface SoakEvidenceRow {
  id: number;
  evidence_key: string;
  evidence_type: SoakEvidenceType;
  evidence_value: string;
  operator: string;
  created_at: string;
  updated_at: string;
}

export interface SoakEvidencePayload {
  evidence_key: string;
  evidence_type: SoakEvidenceType;
  evidence_value: string;
  operator: string;
}

export interface SoakCheckpointRow {
  id: number;
  snapshot_data: SoakReport;
  operator_notes: string | null;
  created_at: string;
}

export interface SoakReport {
  health: AdminHealth; // existing AdminHealth type — do not redefine
  watchlist_count: number | null;
  snapshots_24h: number;
  candles_24h: number;
  engine_runs_summary: {
    total_24h: number;
    success_24h: number;
    error_24h: number;
    last_run_at: string | null;
  };
  audit_events_summary: {
    total_24h: number;
    error_count_24h: number;
    warning_count_24h: number;
  };
  manual_evidence: SoakEvidenceRow[];
  checkpoints: SoakCheckpointRow[];
  generated_at: string;
}
```

**Guard rails:**
- Do not rename or alter `AdminHealth` or any existing type.
- `SoakReport.health` must reference the existing `AdminHealth` type exactly, not a copy.

**Why in scope:** New API response shapes require TypeScript contracts before the UI can safely consume them.

**Acceptance criterion:** `tsc --noEmit` passes with zero new errors after these types are added.

---

### File 4: `src/routes/admin.tsx`

**Section to modify:** The component body of the existing admin route component. Extend it; do not replace it.

**Exact change required:**

Below the existing health display section, add a collapsible "Phase 0 Soak Report" panel containing:

**A. Aggregated data display (read from `fetchSoakReport`):**
- Summary row: watchlist symbols count, snapshots 24h, candles 24h
- Engine runs table: total / success / error counts over 24h, last run timestamp
- Audit events table: total / error / warning counts over 24h
- Separate fetch lifecycle from the existing `fetchAdminHealth` call — do not merge them into a single call or replace the existing health fetch

**B. Manual evidence form:**
- Fields: `evidence_key` (text), `evidence_type` (select from enum values), `evidence_value` (textarea), `operator` (text, pre-filled with logged-in user identifier if available)
- Submit button calls `upsertSoakEvidence` and refreshes the soak report
- Display existing manual evidence rows in a table below the form

**C. Checkpoint controls:**
- "Save 12h Checkpoint" button with an optional notes textarea
- Calls `createSoakCheckpoint` and refreshes the checkpoint list
- Display last 5 checkpoints with `created_at` and `operator_notes`

**D. Export controls:**
- "Export Markdown" button: generates a markdown string from current `SoakReport` state (client-side, no API call) and triggers a browser download of `soak-report-{ISO-date}.md`
- "Print / Save PDF" button: calls `window.print()` — the print stylesheet must hide the nav and sidebar so only the soak report section prints

Add a CSS class `soak-report-print-section` to the soak report container and add a `@media print` rule to the component's stylesheet (or inline style block) that sets `display: none` on everything except `.soak-report-print-section`.

**Guard rails:**
- The existing health cards and per-symbol diagnostics table must remain visually and functionally unchanged above the new panel.
- Do not remove or alter the `fetchAdminHealth` call or its result rendering.
- Do not introduce a global state manager or context for soak report state; use local component state only.
- The soak report panel must render only for users who can already see the admin page (the existing admin gate is sufficient — do not add a second auth check in the component).
- Do not add routing changes; the panel lives on the same `/admin` route.

**Why in scope:** This is the only frontend file for the admin route; the new panel must live here.

**Acceptance criterion:** Admin page loads without console errors. Existing health cards render correctly. Soak report panel loads its data independently. Export download triggers on button click. Print stylesheet hides navigation.

---

## 3. Patch sequence

1. **Verify DB schema** — Before writing any PHP, the implementation agent must run `SHOW CREATE TABLE` or grep for `smc_sf_engine_runs`, `smc_sf_audit_events`, `smc_sf_snapshots`, `smc_sf_candles`, `smc_sf_watchlist` in the plugin PHP to confirm exact column names used in aggregation queries. If `smc_sf_watchlist` does not exist, `watchlist_count` must be hardcoded to `null` in the response.

2. **PHP — new table registration** (`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`) — Add `dbDelta` calls for the two new tables. This must be applied first because the route handlers depend on the tables existing.

3. **PHP — new endpoint registrations and handlers** (`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`) — Add route registrations and implement `get_soak_report()`, `upsert_soak_evidence()`, `create_soak_checkpoint()`. No other file changes are needed on the PHP side.

4. **TypeScript types** (`src/types/sniper.ts`) — Add new types. Must precede API client changes.

5. **TypeScript API client** (`src/lib/api/sniperClient.ts`) — Add three new functions. Must follow type additions.

6. **Frontend UI** (`src/routes/admin.tsx`) — Add the soak report panel. Must follow API client changes so imports resolve.

**Dependencies:** Steps 2 and 3 are both in the same PHP file; apply them in a single commit to avoid an intermediate state where routes are registered but tables do not exist. Steps 4 → 5 → 6 are strictly ordered by TypeScript import resolution.

**State/migration sequencing risk:** The `dbDelta` call is idempotent and safe to run on an already-installed WordPress instance. No data migration is required. The new tables start empty; manual evidence and checkpoint data populate on first operator use.

---

## 4. Regression guards

**After patching, the implementation agent must verify:**

- `curl -H "Authorization: Bearer {admin_token}" /wp-json/sniper/v1/admin/health` returns HTTP 200 with the identical JSON shape as pre-patch (no new keys, no removed keys, no type changes).
- `curl -H "Authorization: Bearer {admin_token}" /wp-json/sniper/v1/admin/soak-report` returns HTTP 200 with all seven top-level keys present.
- A non-admin request to `/wp-json/sniper/v1/admin/soak-report` returns HTTP 401 or 403.
- A non-admin POST to `/wp-json/sniper/v1/admin/soak-evidence` returns HTTP 401 or 403.
- The `/admin` frontend page loads without JavaScript errors in the browser console.
- The existing health cards section is visually unchanged.
- `tsc --noEmit` exits 0.
- `POST /wp-json/sniper/v1/admin/soak-evidence` with a missing `evidence_key` returns HTTP 400.
- `POST /wp-json/sniper/v1/admin/soak-checkpoint` inserts a row and the GET soak-report response contains that row in `checkpoints`.
- After inserting a checkpoint, rows older than 72h are pruned from `smc_sf_soak_checkpoints`.

**Existing protections that must still hold:**

- `permission_admin()` function unmodified.
- `manage_options` capability check unmodified.
- `build_health_payload()` output unmodified.
- Phase 0 soak tracker document unmodified.

**Parity re-validation required:**

- Verify that aggregation queries against `smc_sf_engine_runs` and `smc_sf_audit_events` use read-only SELECT statements and do not write or alter those tables.
- Verify that `snapshot_data` stored in checkpoints is a JSON copy (not a reference) so future health changes do not retroactively alter historical checkpoints.

**Logging/diagnostics that must exist after the patch:**

- `get_soak_report()` must not silently swallow DB errors. If a table query fails, the corresponding field in the response should return `null` with an optional `_error` sibling key (e.g., `engine_runs_summary: null, engine_runs_summary_error: "table not found"`).
- `upsert_soak_evidence()` must log WordPress `error_log()` on DB failure.

---

## 5. Non-goals

**Out of scope for this patch:**

- Any changes to `get_admin_health()`, `build_health_payload()`, or the `/admin/health` route.
- Changes to `smc_sf_engine_runs`, `smc_sf_audit_events`, `smc_sf_snapshots`, or `smc_sf_candles` table schemas.
- Server-side PDF generation (no headless browser, no wkhtmltopdf, no PHP PDF library).
- Server-side markdown rendering.
- Changes to any non-admin REST endpoints (`/health`, `/market-data-authority`, `/authority-diagnostics`).
- Changes to the Pine script or MT5 EA.
- Changes to any route other than `/admin`.
- Automated checkpoint scheduling (cron jobs, WordPress scheduled events). Checkpoints are operator-initiated only.
- Role management beyond the existing `manage_options` capability gate.
- Data retention policy changes for existing tables.
- A dedicated soak report route (e.g., `/admin/soak-report`). The panel lives on `/admin`.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Merging `fetchSoakReport` and `fetchAdminHealth` into a single combined call. This would couple two independently managed data concerns and risk breaking the health display if the new aggregation queries are slow or fail.
- Adding a `?include_soak=true` parameter to the existing `/admin/health` endpoint (Path B from the research report). Rejected: contaminates the existing contract.
- Storing manual evidence in `smc_sf_audit_events` instead of a dedicated table. Rejected: audit_events is a backend source-of-truth table; operator manual entries must not pollute it.
- Auto-generating and emailing soak reports. Out of scope for Phase 0.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

An SQL injection vulnerability in `upsert_soak_evidence()` or `create_soak_checkpoint()` if `$wpdb->prepare()` is omitted. Attacker with admin credentials could execute arbitrary SQL against the WordPress database. All parameterized values must use `$wpdb->prepare()` without exception.

**User-visible failure mode:**

If the `smc_sf_watchlist` table does not exist and the PHP handler throws an uncaught exception rather than returning `null`, the entire `/admin` page could blank out for admin users. The implementation must catch DB errors per field and degrade gracefully.

**Backend authority or stale-state risks:**

`get_soak_report()` embeds a live call to `build_health_payload()`. If health payload generation is slow (e.g., external feed timeout), the soak report response will be slow. The frontend must manage the soak report fetch with its own loading state and must not block the existing health card render on it.

Checkpoint `snapshot_data` is a JSON copy of the report at point-in-time. If the checkpoint is created during a degraded health state, it will accurately record that degraded state. This is correct behavior, not a bug.

**Whether human approval should be required before merge:**

**Yes.** New admin-only backend aggregation, new database tables, and a new write endpoint (`upsert_soak_evidence`) require security review before merge. Specifically: SQL injection surface of all new `$wpdb` calls, and correctness of the auth gate on all three new endpoints.

---

## 7. Test requirements

**Tests to add:**

- PHP unit or integration test for `get_soak_report()`: assert all seven top-level keys are present; assert `health` key matches the output of `build_health_payload()`.
- PHP test for `upsert_soak_evidence()`: assert missing `evidence_key` returns WP_Error with 400 status; assert valid payload upserts and returns the row.
- PHP test for `create_soak_checkpoint()`: assert a row is inserted; assert rows older than 72h are pruned after insertion.
- PHP test for auth gate: assert all three new endpoints return 401/403 without `manage_options`.
- TypeScript: if the project has existing API client tests, add corresponding tests for the three new functions that mock the fetch response and assert return types.
- TypeScript: `tsc --noEmit` must pass — this is a required gate, not optional.

**Existing tests or manual checks that must still pass:**

- Any existing test covering `get_admin_health()` or `build_health_payload()` must pass unchanged.
- The `/admin` frontend route must load in the browser without errors (manual check if no E2E tests exist).
- The existing per-symbol diagnostics table must render correctly on the admin page.

**Soak, replay, or live-environment verification needed:**

- After deploy to the WordPress instance, an operator must manually create one soak evidence entry and one checkpoint via the UI, then export the markdown and verify the output contains the evidence entry and the checkpoint.
- Verify the `smc_sf_soak_checkpoints` row is present in the database with correct JSON in `snapshot_data`.
- Verify that a re-fetch of `GET /wp-json/sniper/v1/admin/health` after these operations returns an identical response to its pre-patch state.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`feature/phase0-soak-report-builder`

**Suggested commit grouping:**

1. `feat(php): register smc_sf_soak_evidence and smc_sf_soak_checkpoints tables via dbDelta`
2. `feat(php): add /admin/soak-report GET, /admin/soak-evidence POST, /admin/soak-checkpoint POST endpoints`
3. `feat(types): add SoakReport, SoakEvidenceRow, SoakCheckpointRow, SoakEvidencePayload types`
4. `feat(api): add fetchSoakReport, upsertSoakEvidence, createSoakCheckpoint to sniperClient`
5. `feat(admin): add Phase 0 soak report panel with manual evidence form, checkpoint controls, and export`

**Required reports or artifacts to generate after implementation:**

- One manually created checkpoint snapshot exported as `soak-report-{date}.md` and attached to the PR as evidence that the export flow works end-to-end.
- PR body must include: confirmation that `/admin/health` response is byte-identical pre/post patch, list of new DB tables created, confirmation that all three new endpoints reject non-admin requests, and confirmation that `tsc --noEmit` exits 0.

**State transition:**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
