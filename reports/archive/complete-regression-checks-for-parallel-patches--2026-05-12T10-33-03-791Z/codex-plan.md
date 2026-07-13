# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

### Confirmed

**C1 — Soak evidence immutability is intact.**
`upsert_soak_evidence()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (lines 340–343) uses INSERT/UPDATE only. The `smc_sf_soak_evidence` table has no DELETE trigger, no truncate call, and no cascade path reachable from any registered endpoint. `assertValidSoakEvidencePayload()` in `src/lib/api/soakEvidence.ts` enforces evidence_type validation before any network call reaches the backend. No parallel patch touched these paths.

**C2 — API contract is stable.**
All four admin endpoints (`GET /admin/health`, `GET /admin/soak-report`, `POST /admin/soak-evidence`, `POST /admin/soak-checkpoint`) are registered in PHP (lines 329–350) with the correct HTTP methods and `permission_admin` callbacks. `src/lib/api/sniperClient.ts` (lines 152–169) calls each with matching methods and parameters. Frontend and backend contracts are aligned.

**C3 — Snapshot invalidation mechanism is intact.**
`is_engine_snapshot_current()` validates symbol-set consistency before accepting a cached snapshot. `delete_engine_snapshot()` removes the `smc_sf_engine_snapshot` user meta key on invalidation. `getSnapshot()` in `sniperClient.ts` (line 247) passes `cacheBust: true`. The `useSnapshot()` hook (lines 24–36) only enables polling when `backendReady && pollMs !== null`. No parallel patch weakened any of these guards.

**C4 — Admin route access control is intact.**
`AdminPage` in `src/routes/admin.tsx` (lines 80–150) checks `hasCredentials()` and `hasWordPressNonce()` before rendering, navigates away on auth failure, and surfaces a denial view (lines 278–295) when `permission_admin` is denied. The backend enforces the same check independently.

**C5 — Export and print functionality is intact.**
`handleExportMarkdown()` (lines 431–443) generates a markdown blob from `buildSoakReportMarkdown()`, downloads it with a datestamped filename, and revokes the object URL. `handlePrint()` (lines 446–449) calls `window.print()` with an SSR guard. Both buttons are disabled when `soakState !== "ready"` (lines 651–663). Print CSS (lines 459–530) hides interactive elements and preserves the soak-report-print-section.

### Likely

**L1 — No cross-patch interference occurred.**
Parallel patches targeted isolated code paths (admin health, soak evidence, export). The research identifies no shared mutable state between these subsystems. Likelihood of interference is low but cannot be fully confirmed without runtime verification of database state, WordPress object cache state, and build artifact integrity.

### Unconfirmed

**U1 — Database state post-parallel-patches.**
The research does not confirm whether any parallel patch modified table indices, column defaults, or added/removed rows in soak tables as a side effect. This must be verified at runtime before this plan can be closed.

**U2 — Build artifact integrity.**
TypeScript and CSS bundle correctness after parallel merges is not confirmed from static analysis alone. A clean build and bundle hash check is required.

**U3 — WordPress object cache state.**
Whether any parallel patch triggered an unintended object cache flush or stale cache read in the snapshot or soak-report paths is not determinable from code inspection alone.

**U4 — Snapshot polling race under concurrent watchlist changes.**
The research flags this as an open unknown. `refetchInterval` is set to `pollMs` or `DEFAULT_POLL_MS`, but whether a watchlist mutation arriving mid-poll produces a race that bypasses `is_engine_snapshot_current()` is not tested by existing suites.

---

**Corrected root cause statement:** There is no confirmed regression. The issue is a verification obligation created by the completion of multiple parallel patches. The plan is a structured regression check, not a bug fix. No code changes are prescribed unless a verification step fails and surfaces a concrete defect.

---

## 2. Implementation contract

**No files require modification under this plan.**

This is a verification-only contract. Code changes are out of scope unless a verification step in Section 7 fails and produces a concrete, locatable defect. If a failure is found, a new research report must be filed and a new plan must be produced before any code is touched.

The following table records the verification obligations against the files identified as in-scope by the research report. It is not a change list.

| File | Surface to verify | Verification method | Guard rails |
|---|---|---|---|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | `upsert_soak_evidence()`, endpoint registrations (lines 329–352) | PHP test suite + manual API call | Must not gain a DELETE path; permission callbacks must remain `permission_admin` |
| `src/lib/api/sniperClient.ts` | `upsertSoakEvidence()`, `getSnapshot()`, `cacheBust` flag (lines 152–169, 247) | Jest unit tests + network trace | `cacheBust: true` must remain on all snapshot calls; method verbs must not drift |
| `src/routes/admin.tsx` | `handleExportMarkdown()`, `handlePrint()`, button disabled states, print CSS (lines 431–663) | Manual browser test | Export blob must use `text/markdown` type; print CSS `@media print` block must not be removed |
| `src/hooks/useSniperData.ts` | `useSnapshot()` enable guard (lines 24–36) | Jest unit test | `backendReady` gate must not be bypassed; `pollMs !== null` check must remain |
| `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` | Symbol-set mismatch invalidation tests (lines 220–256) | PHP test runner | All existing assertions must pass; none may be skipped or marked xfail |
| `src/routes/-admin.test.tsx` | AdminPage render assertions (lines 180–195) | Jest test runner | All heading and health-card assertions must pass |
| `src/lib/api/soakEvidence.test.ts` | Evidence payload validation | Jest test runner | All type-validation assertions must pass |

---

## 3. Patch sequence

This plan has no code patch sequence. It is a verification sequence.

1. **Build verification** — Run `npm run build` (or equivalent) and confirm zero TypeScript errors and no bundle hash collision with the pre-patch baseline. This must complete before any runtime check, because a broken build invalidates all subsequent results.

2. **PHP test suite** — Execute `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` in isolation. Confirm all snapshot invalidation and cache deletion assertions pass. This step has no dependency on the JS build.

3. **JS unit test suite** — Run `npm test src/routes/-admin.test.tsx` and `npm test src/lib/api/soakEvidence.test.ts` sequentially. These depend on the build completing cleanly (step 1).

4. **Database state check** — Query the `smc_sf_soak_evidence` table directly and confirm: (a) row count matches expected evidence count, (b) no rows were deleted since the last pre-patch snapshot, (c) schema columns match the table definition at line 293+ of the PHP file. This step is independent of steps 2–3.

5. **WordPress object cache check** — Flush and re-prime the object cache, then call `GET /admin/soak-report` and confirm the response reflects the current database state, not a stale cached payload.

6. **Admin route runtime check** — Navigate to `/admin` in a browser as a WordPress administrator. Confirm the page loads, health cards render, and no JavaScript console errors appear.

7. **Export runtime check** — From the loaded admin page, trigger the markdown export. Confirm the downloaded file is named `phase0-soak-YYYY-MM-DD.md`, is non-empty, and contains baseline/checkpoint/evidence sections.

8. **Print runtime check** — Trigger the browser print dialog from the admin page. Confirm the print preview shows the soak-report-print-section and hides buttons and forms.

9. **Snapshot polling check** — With the dashboard open, change the watchlist (add or remove a symbol) and confirm the snapshot is invalidated and re-fetched within one poll cycle. Confirm no stale data persists.

**Sequencing dependencies:**
- Step 1 must complete before steps 3, 6, 7, 8, 9.
- Steps 2 and 4 are independent of all other steps and may run in parallel.
- Steps 6–9 depend on step 5 (cache state must be clean before runtime checks).

**No migration, schema change, or state transition is required by this plan.**

---

## 4. Regression guards

### Checks the implementation agent must run after this verification pass

1. Confirm `npm run build` exits with code 0 and produces no TypeScript errors.
2. Confirm all assertions in `test-watchlist-snapshot-regression.php` pass without skips.
3. Confirm all assertions in `-admin.test.tsx` pass, specifically the heading and health-card assertions at lines 180–195.
4. Confirm all assertions in `soakEvidence.test.ts` pass, specifically evidence_type validation.
5. Confirm `GET /admin/soak-report` returns a non-empty report with a timestamp reflecting the current run, not a cached prior run.
6. Confirm the exported markdown file contains all three tables: baseline, checkpoint, evidence.
7. Confirm no JavaScript console errors on admin page load.
8. Confirm snapshot re-fetch occurs after watchlist mutation within one poll cycle.

### Existing protections that must still hold

- `assertValidSoakEvidencePayload()` must reject malformed evidence_type values — do not weaken or bypass.
- `permission_admin` callback must remain on all `/admin/*` endpoints — do not add public or subscriber-level access.
- `cacheBust: true` must remain on all snapshot fetch calls — do not remove or make conditional.
- `backendReady` gate in `useSnapshot()` must remain — do not allow polling before backend readiness is confirmed.
- `@media print` CSS block must remain intact — do not consolidate or remove print-specific rules.
- `data-print-hide="true"` attributes on export/print buttons must remain — do not strip data attributes during refactor.

### Parity re-validations required

None. The research confirms no Pine formula, MT5 bridge, or backend signal logic was touched by the parallel patches under review. Parity re-validation is not required for this regression check.

### Logging and diagnostics that should exist after the pass

- The admin health section must display per-symbol diagnostics (confirmed by test at lines 180–195 of `-admin.test.tsx`).
- The soak report endpoint must return `created_at` and `updated_at` timestamps on each evidence row.
- The snapshot response must include the symbol set that was used to compute it, enabling `is_engine_snapshot_current()` to compare against the current watchlist.

---

## 5. Non-goals

### Out of scope for this plan

- Any modification to `smc_sf_soak_evidence` table schema or indices.
- Any new admin endpoint or new soak evidence field.
- Any change to `buildSoakReportMarkdown()` output format.
- Any change to poll interval logic in `useSnapshot()`.
- Any refactor of `AdminPage` component structure.
- Any update to print CSS beyond confirming it is intact.
- Any change to `normalizeSnapshot()` validation logic.
- Any database migration or data backfill.
- Any WordPress object cache configuration change.

### Attractive but unsafe follow-on changes to avoid in this patch

- **Adding a DELETE endpoint for soak evidence** — explicitly prohibited. Evidence immutability is a Phase 0 architectural guarantee. Even if a test entry needs to be removed, a soft-delete flag is the only permissible path, and that requires a separate research report and plan.
- **Increasing snapshot poll frequency** — would mask race conditions rather than expose them. Do not adjust `DEFAULT_POLL_MS` as a workaround for U4.
- **Adding client-side caching to soak report fetches** — the current design deliberately bypasses caches with `cacheBust`. Do not introduce memoization without a backend-authority analysis.
- **Merging print CSS into a shared stylesheet** — the isolation of `@media print` rules inside `admin.tsx` is intentional. Extracting them creates a risk of print styles leaking into or being overridden by the main stylesheet.
- **Widening `permission_admin` to allow non-admin roles to read soak data** — out of scope and a security regression.

---

## 6. Risk assessment

### Worst-case failure mode if the verification pass is handled incorrectly

If a verification step is marked passing without actually executing (e.g., the test runner is invoked against a stale build), a real regression in soak evidence persistence or snapshot invalidation could be declared absent when it is present. A future parallel patch would then build on a falsely validated baseline, compounding the regression.

### User-visible failure mode

If snapshot invalidation is broken: users see stale signal levels on the dashboard after changing their watchlist, with no indication that the data is stale. This is silent and high-impact.

If export is broken: the markdown download produces an empty or malformed file. Users lose their Phase 0 soak record for compliance review.

If the admin route is broken: the admin page fails to load or renders without health cards, blocking Phase 0 sign-off.

### Backend authority and stale-state risks

- **Backend authority**: No risk from this verification pass. No code changes are made to backend endpoints or permission callbacks.
- **Stale state**: The primary stale-state risk is the WordPress object cache (U3). If the cache is not flushed before runtime checks, the soak-report endpoint may return a stale payload that passes the check but does not reflect actual database state. Mitigation: flush cache before runtime verification (step 5 of patch sequence).

### Whether human approval should be required before merge

**No merge is required for this plan.** This is a verification-only task. If all verification steps pass, the outcome is a signed-off regression check report, not a code merge.

If any verification step fails and a defect is identified, the resulting code patch must go through a standard PR review with human approval before merge, regardless of patch size.

---

## 7. Test requirements

### Tests to run (no new tests required)

| Test | Command | Pass criterion |
|---|---|---|
| Admin route rendering | `npm test src/routes/-admin.test.tsx` | All assertions pass; health heading, health cards, per-symbol diagnostics all render |
| Soak evidence validation | `npm test src/lib/api/soakEvidence.test.ts` | All evidence_type validation assertions pass |
| Snapshot invalidation (PHP) | Run `test-watchlist-snapshot-regression.php` via PHP test runner | Symbol-set mismatch invalidates snapshot; cache deletion removes correct meta key |
| Full JS unit suite | `npm test` (or equivalent) | Zero failures, zero skips on soak/snapshot/admin paths |

### Existing tests that must still pass

All tests listed above were passing before the parallel patches. They must pass after. No test may be skipped, marked xfail, or have its assertions loosened as part of accepting this regression check.

### Manual checks required

1. Admin page loads at `/admin` for a WordPress administrator account — no JS errors, health cards visible.
2. Export markdown download — file named `phase0-soak-YYYY-MM-DD.md`, non-empty, contains baseline/checkpoint/evidence sections.
3. Browser print dialog — print preview shows soak report, hides buttons and forms.
4. Soak evidence submission — submit a test evidence entry, reload the page, confirm the entry persists.
5. Snapshot invalidation — change watchlist, confirm snapshot re-fetches within one poll cycle, confirm stale data does not persist.

### Soak, replay, parity, and live-environment verification

- No soak replay is required for this regression check.
- No parity re-validation is required (no Pine/MT5/backend signal logic touched).
- Live-environment verification of the admin page, export, and print (checks 1–3 above) must be performed in the actual WordPress environment, not a mock, because these checks depend on backend endpoint responses and WordPress authentication state.

---

## 8. Implementation handoff

### Branch naming recommendation

No new branch is required. This plan produces a verification report, not a code patch. If a defect is discovered during verification and a code patch becomes necessary, the branch should be named:

```
fix/phase0-regression-<short-descriptor>
```

where `<short-descriptor>` identifies the specific defect found (e.g., `fix/phase0-regression-snapshot-cache-flush`).

### Suggested commit grouping

If no defect is found: no commits. The output is a signed-off artifact (`reports/codex-plan.md` and a verification result log), not a code change.

If a defect is found: one commit per isolated defect, never bundling unrelated fixes into a single commit.

### Required artifacts after implementation

1. `reports/codex-plan.md` — this document (already produced).
2. A verification result log (may be appended to `reports/copilot-research.md` or filed as a new artifact) recording: pass/fail for each verification step, the build hash, the PHP test runner output summary, and the JS test runner output summary.
3. If all steps pass: a sign-off comment in the relevant PR or issue confirming Phase 0 regression checks are complete.
4. If any step fails: a new research report filed immediately, blocking Phase 0 sign-off until resolved.

### State transition

```
READY_FOR_IMPLEMENTATION
editing_locked=false
```
