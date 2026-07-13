# SMC SuperFIB - Issue Research Report

## 1. Issue classification
- Severity: HIGH
- Category: runtime-bug
- Layer(s) affected: PHP-backend, REST-API, Dashboard-JS
- Phase impact: Phase 0

## 2. Confirmed evidence
- The Phase 0 checklist reports `/admin/soak-report` returns `404` with "signal not found; this route is not in the engine map."
- Frontend code in `src/lib/api/sniperClient.ts` calls `fetchSoakReport()` which makes a GET request to `/admin/soak-report`.
- Backend code in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` registers the route `/admin/soak-report` with callback `get_soak_report` in the `register_routes` method.
- The `get_soak_report` method is implemented and includes logic to fetch `baseline_checkpoint` from the `soak_checkpoints` table.
- The INITIAL snapshot from `reports/snapshots/stabilize-ea-2026-05-11/INITIAL-20260511T000000Z.json` lists `"GET /sniper/v1/admin/soak-report"` in the `admin_routes` array, indicating the route is registered.
- The archive contains a previous cycle `extend-admin-into-a-phase-0-soak-report-builder--2026-05-10T16-52-04-862Z`, suggesting the route may have been partially implemented.

## 3. Root cause hypothesis
- Most likely root cause: The route is registered but the `get_soak_report` method fails at runtime, possibly due to database query failures or unhandled exceptions, resulting in a 404 response instead of the expected JSON.
- Why that root cause best fits the evidence: The route registration code exists, the method is implemented, and the snapshot shows it as registered, but the checklist reports 404, suggesting runtime failure rather than missing registration.
- What likely triggered or surfaced the issue: Attempting to load the admin soak report during Phase 0 soak validation.
- Mark each sub-point as `Confirmed` or `Hypothesis`: Confirmed - route registration exists; Hypothesis - runtime failure in method execution.

## 4. Blast radius
- Every file that calls `fetchSoakReport()` or accesses `/admin/soak-report`: `src/routes/admin.tsx` uses the soak report data.
- Every system that reads from or writes to the soak tables: `soak_checkpoints`, `soak_evidence`, `snapshots`, `candles`, `engine_runs`, `audit_events`.
- Every parity surface at risk: Dashboard soak report display depends on backend data.
- Any stale-state, cache, sequencing, or authority-boundary risks: Database table creation via `ensure_soak_tables()` could fail.

## 5. Regression surface
- What currently working behavior could break if patched incorrectly: Other admin routes (`/admin/health`, `/admin/soak-evidence`, `/admin/soak-checkpoint`), soak table operations.
- Existing guards, stale-data protections, or validation paths that must not be weakened: Permission checks via `permission_admin()`, database error handling in soak methods.
- Tests, audits, or reports that appear to cover this area today: Test files in `wordpress/smc-superfib-sniper/tests/php/`, smoke test reports.

## 6. Resolution path options
- Path A: narrowest plausible correction surface - Fix runtime issues in `get_soak_report` method, ensure `baseline_checkpoint` is properly fetched or created.
- Path B: broader structural risk area - Re-implement the entire soak report route if the current implementation is fundamentally broken.
- Recommended: Path A - The code exists and appears mostly correct, focus on fixing the runtime failure.
- Do not write implementation code or implementation steps.

## 7. Risk flags
- High-risk system involved: No
- Requires parity re-validation: No
- Migration-blocking: Yes - Blocks Phase 0 soak validation
- Human review required before merge: No

## 8. Handoff package
- Epicentre files to inspect first: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (get_soak_report method), `src/routes/admin.tsx` (soak report usage)
- Inputs Codex must verify before planning: Whether the route actually returns 404 at runtime, current state of soak_checkpoints table, whether baseline_checkpoint exists
- Open unknowns that could invalidate the current hypothesis: Exact cause of 404 if route is registered, whether soak tables are properly created, whether baseline checkpoint creation logic exists