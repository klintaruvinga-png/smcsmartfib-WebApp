# SMC SuperFIB - Admin UI Polish: Baseline/Checkpoint Age, Print Formatting, Error Hardening

## 1. Issue validation

### Confirmed

- **Single age indicator insufficient.** `admin.tsx` computes `soakAge = formatSoakAge(baselineCheckpoint?.created_at ?? null)` and renders it in one `Soak age` health card. No separate baseline age vs. checkpoint age distinction exists in the top-level health UI. This directly matches the checklist item "Surface baseline and checkpoint age more prominently."
- **Print isolation scope risk.** The `@media print` block uses `body * { visibility: hidden; }` with only `.soak-report-print-section` made visible. Any element added outside that container boundary — including the new age indicators — is silently excluded from print output. This is the structural root cause of the print/export formatting gap.
- **Error handling exists but state promotion on retry is unverified.** `admin.tsx` sets `soakState.kind = "error"` and renders an operator-facing error panel with a retry button on initial load failure. Whether a retry failure correctly re-promotes to `error` (rather than leaving the UI in a stale `ready` state) is not confirmed by the research report alone. This is the hardening gap flagged in the checklist.

### Likely

- **Backend exposes one timestamp for both age semantics.** The `SoakReport` type in `src/types/sniper.ts` most likely surfaces `baseline_checkpoint.created_at` as the only age-semantics field. If no distinct `checkpoint_age` field exists in the schema, both display labels must derive from the same timestamp without implying false precision. This must be verified in `src/types/sniper.ts` before patching.
- **Retry path shares the error-display code path with initial load** but may not re-enter the error state if `soakState` is already `ready` when the retry is triggered. A fetch that fails mid-retry would then silently leave stale data visible. This is a plausible gap based on common React `useEffect` + state patterns but requires trace-through of the actual state machine to confirm.

### Unconfirmed

- Whether a hidden checkpoint age field already exists in the `SoakReport` type or live backend response that is not currently rendered. No claim about missing schema fields is actionable until `src/types/sniper.ts` and a live or mocked `/admin/soak-report` response are inspected.
- Whether current print output is objectively insufficient for the operator workflow. A browser print preview must be observed before any CSS is changed.
- Whether `refreshSoakReport()` is or is not guarded against concurrent invocation. This requires reading the actual state machine in `admin.tsx`.

---

## 2. Implementation contract

### File 1: `src/routes/admin.tsx` — Age display section

**Exact function/section**: The health card cluster that currently renders the single `Soak age` card.

**Exact change required**:
- Replace the single `Soak age` card with two distinct cards: `Baseline age` and `Checkpoint age`.
- `Baseline age` derives from `baselineCheckpoint?.created_at ?? null` via the existing `formatSoakAge()` call.
- `Checkpoint age` derives from the most recent checkpoint timestamp in the soak report if the schema exposes a distinct field; if not, derives from the same `baseline_checkpoint.created_at` timestamp, with a label that does not claim a distinct data source until the backend exposes one.
- Both cards use `formatSoakAge()` or an equivalent existing utility. No new inline age-formatting logic is introduced.

**Guard rails**:
- Do not remove the existing `Soak age` card until both replacement cards are confirmed rendering correctly in local testing.
- Do not introduce a new `useEffect`, new API call, or new state variable to fetch age data. Both values must derive from the already-fetched `soakReport` state.
- Do not modify `formatSoakAge()`.
- Do not displace or alter the Phase 0 baseline-exists warning or status added in PR #142.

**Why in scope**: Sole rendering site for admin soak health cards. The checklist item targets this component directly.

**Acceptance criterion**: An operator loading `/admin` sees two clearly labeled age values — `Baseline age` and `Checkpoint age` — rendered prominently in the health card cluster. If the backend does not expose separate fields, both values render from the available timestamp with labels that do not imply false precision.

---

### File 1: `src/routes/admin.tsx` — Print/export `@media print` block

**Exact function/section**: The `@media print` CSS block scoped to `.soak-report-print-section`, including the `body * { visibility: hidden; }` rule.

**Exact change required**:
- Before editing, audit (via browser print preview) which operator-relevant elements fall outside `.soak-report-print-section` and are therefore hidden in print output.
- For each excluded element that operators need in an exported report (age indicators, baseline status, evidence section headers): either (a) confirm the element is inside `.soak-report-print-section` in the DOM, or (b) add an explicit `visibility: visible; position: relative;` override for that element within the `@media print` block.
- Add `page-break-inside: avoid` to any evidence block that risks splitting across print pages.
- The new `Baseline age` and `Checkpoint age` cards must be visible in print output.

**Guard rails**:
- Do not remove the `body * { visibility: hidden; }` rule. It is the correct mechanism for isolating the print section.
- Do not rename or remove the `.soak-report-print-section` class or selector.
- Do not change print rules for any non-soak-report section of the admin page.

**Why in scope**: Print/export formatting is a confirmed checklist item. The `body * { visibility: hidden; }` pattern silently excludes elements added outside the print container unless explicitly overridden.

**Acceptance criterion**: A browser print preview of `/admin` with a loaded soak report includes all operator-relevant summary fields — age indicators, baseline status, evidence blocks — without requiring the operator to reconstruct data from hidden sections.

---

### File 1: `src/routes/admin.tsx` — Soak report error state machine

**Exact function/section**: The `soakState` transitions on initial load failure and on `refreshSoakReport()` retry failure; the concurrent invocation guard.

**Exact change required**:
- Trace the full state machine: `loading → ready | error` on initial fetch; `(ready|error) → loading → ready | error` on retry.
- If the retry failure path leaves `soakState` in `ready` with stale data, add an explicit guard: on retry failure, always transition to `error` regardless of prior state, and ensure the error panel renders with the retry button.
- Improve the error panel message to include the HTTP status code or error type returned by `fetchSoakReport()`. Use whatever error payload is already returned by `sniperClient.ts` — do not introduce a new error type or modify `sniperClient.ts`.
- If `refreshSoakReport()` is not already guarded against concurrent invocation, add a boolean flag (e.g., `refreshing`) to prevent a second fetch from launching while one is in flight.

**Guard rails**:
- Do not change the error panel's DOM structure or class names. Only improve the displayed message content and the state transition logic.
- Do not modify `sniperClient.ts` or `fetchSoakReport()`.
- Do not remove the retry button.
- Do not introduce a new error type beyond what `sniperClient.ts` already returns.

**Why in scope**: Error hardening is a confirmed checklist item. Both identified gaps — generic error messages and potential stale-state-after-retry — are addressable in `admin.tsx` alone without touching the API layer.

**Acceptance criterion**: (1) An operator who encounters a backend failure on initial load sees an error panel with the HTTP status code or error type, not only "Soak report failed to load." (2) An operator who clicks retry and encounters a second failure sees the error panel updated — not left in a stale ready state. (3) A concurrent retry click while a fetch is in flight does not trigger a second `fetchSoakReport` call.

---

### File 2: `src/routes/-admin.test.tsx` — Error and age display coverage

**Exact function/section**: Soak report error handling tests and soak age display tests.

**Exact change required**:
- Add test: retry failure transitions to `error` state (not stale `ready`).
- Add test: error panel renders status code or error type from the failed fetch, not only the generic string.
- Add test: concurrent retry clicks do not trigger a second `fetchSoakReport` call.
- Add test: `Baseline age` label renders when soak report data is present.
- Add test: `Checkpoint age` label renders when soak report data is present.
- Update any existing snapshot or text-match assertions that reference the old single `Soak age` label.

**Guard rails**:
- Do not remove any pre-existing passing test cases.
- Do not mock the backend schema beyond what is already mocked in the test file.
- Do not add integration tests that reach a live backend — component/unit tests only.

**Why in scope**: The research report confirms existing coverage in this file. Extension is required to cover the three new hardened behaviors and the two new age display assertions.

**Acceptance criterion**: All new test cases pass. No existing test cases regress. The file covers all three error-hardening behaviors and the new age display structure.

---

## 3. Patch sequence

**Step 0 — Pre-patch verification (blocking, no code written until complete)**:
- Read `src/types/sniper.ts`: confirm the full `SoakReport` type and determine whether a distinct checkpoint age field exists beyond `baseline_checkpoint.created_at`. This finding determines whether Step 2 renders two labels from one timestamp or from two distinct fields.
- Read `src/routes/admin.tsx` in full: trace the complete `soakState` state machine for both initial load and retry paths. Confirm whether the retry failure promotes to `error` and whether a concurrent invocation guard already exists.
- Run a browser print preview of `/admin` with a loaded soak report (or with mocked data): identify which fields are currently excluded from print output.

**Step 1 — Error state hardening** (`admin.tsx` state machine):
- Apply retry failure guard and concurrent invocation guard.
- This change is isolated to state transition logic and has no dependency on Steps 2 or 3.

**Step 2 — Age display** (`admin.tsx` health cards):
- Add distinct `Baseline age` and `Checkpoint age` labels, informed by the `SoakReport` schema confirmed in Step 0.
- Depends on Step 1 being complete so the error path is correct before adding new rendering paths.

**Step 3 — Print/export CSS** (`admin.tsx` print rules):
- Apply print CSS improvements after age display is confirmed rendering, so the print audit is accurate for the final DOM structure.
- Depends on Step 2 so the audit reflects the correct set of rendered elements.

**Step 4 — Test extension** (`-admin.test.tsx`):
- Update and extend tests after all `admin.tsx` changes are complete.
- Depends on Steps 1–3.

**Sequencing risk**: If Step 0 confirms no distinct checkpoint age field exists in the schema, Step 2 must render both labels from `baseline_checkpoint.created_at` with clear labeling. It must not introduce a new API field or modify `src/types/sniper.ts`. If the schema is expanded in a future patch, Step 2 will need re-validation against the new field.

No database migrations, cache invalidations, or backend contract changes are required if Step 0 confirms the age fields are already available in the existing schema.

---

## 4. Regression guards

**Checks the implementation agent must run after patching**:
- Run the full `src/routes/-admin.test.tsx` test suite. All pre-existing tests must pass without modification.
- Confirm the Phase 0 baseline-exists warning added in PR #142 still renders correctly and is not displaced by the new age display cards.
- Confirm `fetchSoakReport()` is still called with `cacheBust: true` and is not altered.
- Confirm the retry button is present and functional in the error panel after the state machine change.
- Confirm the concurrent invocation guard does not block a legitimate retry after the in-flight fetch completes.
- Perform a browser print preview and confirm all operator-relevant summary fields appear.

**Existing protections that must still hold**:
- Backend authority: soak report data must come exclusively from `fetchSoakReport()` with `cacheBust: true`. No client-side caching or default values may be introduced for age fields.
- Stale-data protection: if `fetchSoakReport()` fails, the UI must not display stale age data as if it were current. The error state must be promoted.
- PR #142 baseline-exists warning must remain visible and accurate.

**Parity re-validations required**:
- Confirm the displayed age values match the raw `created_at` timestamps in the backend response. No client-side offset or transformation may be introduced. Verify via browser devtools during manual testing.
- If the backend exposes a distinct checkpoint age field in a future patch, the rendering change in Step 2 must be re-validated against that field at that time.

**Logging/diagnostics that must exist after the patch**:
- The error panel must surface the HTTP status code or error class from the failed fetch.
- Console logging for soak report fetch failures must be preserved — confirm it is not removed during the error-message improvement.

---

## 5. Non-goals

**Out of scope for this patch**:
- Any change to `src/lib/api/sniperClient.ts` or `fetchSoakReport()`.
- Any change to the `/admin/soak-report` backend route implementation.
- Any addition of new fields to `SoakReport` in `src/types/sniper.ts`.
- Any modification to `formatSoakAge()`.
- Any Pine script formula changes.
- Any MT5 integration changes.
- Any signal engine or strategy logic changes.
- Moving to a different data-fetching pattern (React Query, SWR, etc.) for the soak report.
- Implementing live-refresh or polling for the soak report.
- Operator authentication or role-based access changes on the admin page.
- Any change to soak report backend persistence or checkpoint storage logic.

**Attractive but unsafe follow-on changes to avoid in this patch**:
- Do not extend `SoakReport` with derived fields (e.g., `checkpoint_age_seconds`) even if it simplifies rendering — this widens the backend contract boundary.
- Do not refactor the `soakState` state machine into a separate hook or reducer even if it would improve testability — this is scope-widening refactor.
- Do not improve print formatting for non-soak-report sections of the admin page (e.g., the health card grid) even if they appear suboptimal in print preview.
- Do not add a download/export button or CSV export capability — the checklist item refers to browser print/export only.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly**:
- If the retry state machine guard is implemented incorrectly, the admin UI could permanently lock into the error state and refuse to display a valid soak report even after the backend recovers, requiring a page reload to escape. This would directly impair operator visibility into Phase 0 soak status.
- If the `body * { visibility: hidden; }` print rule is modified or removed incorrectly, browser print output for `/admin` becomes entirely blank or exposes unintended sections of the admin page.

**User-visible failure mode**:
- Both `Baseline age` and `Checkpoint age` cards render `--` or an invalid value because the rendering code references a field that does not exist in the schema (if Step 0 verification is skipped).
- Operators print the soak report and receive a blank or incomplete page.
- Operators in an error state click retry and see no state change — UI appears frozen.

**Backend authority or stale-state risks**:
- Low for this patch. No backend changes are in scope. `cacheBust: true` remains intact. The only stale-state risk is if error hardening incorrectly retains error state after a successful retry — explicitly covered by the new test cases.

**Whether human approval should be required before merge**:
- **Yes.** Operator-facing admin UI and soak report behavior are Phase 0 gate items. The research report explicitly flags human review as required. This patch must not be auto-merged.

---

## 7. Test requirements

**Tests to add in `src/routes/-admin.test.tsx`**:

| Test case | Target behavior |
|---|---|
| `retry failure transitions to error state` | Mock `fetchSoakReport` to succeed on first call, fail on retry; assert `soakState.kind === "error"` and error panel visible after retry |
| `error panel shows status code or error type` | Mock `fetchSoakReport` to return an error with a known status; assert rendered error panel contains that status value |
| `concurrent retry is blocked` | Simulate two rapid retry clicks while fetch is in flight; assert `fetchSoakReport` called only once |
| `baseline age label renders` | Mock soak report response with valid data; assert text `Baseline age` present in rendered output |
| `checkpoint age label renders` | Mock soak report response with valid data; assert text `Checkpoint age` present in rendered output |
| `snapshot update` | Update any snapshot or text-match assertion referencing the old single `Soak age` label |

**Existing tests that must still pass**:
- All pre-existing test cases in `src/routes/-admin.test.tsx` without modification.
- Any smoke or integration tests that load the admin route.

**Manual and live-environment verification required**:
- A browser print preview of `/admin` with a live or mocked soak report must be performed by the implementation agent and its result described (with screenshot or explicit field enumeration) in the PR body before merge.
- No automated soak or replay verification is required — this is UI polish, not a signal-engine change.
- Parity check: confirm displayed age values match raw `created_at` timestamps in the backend response via browser devtools during manual testing.

---

## 8. Implementation handoff

**Branch naming recommendation**:
`claude/admin-ui-polish-age-print-error-hardening`

**Suggested commit grouping**:
1. `fix(admin): harden soak-report retry error promotion and concurrent fetch guard`
2. `feat(admin): surface baseline age and checkpoint age as distinct health card indicators`
3. `fix(admin): improve print/export formatting for soak report print section`
4. `test(admin): extend soak report coverage for retry error, concurrent guard, and age display`

**Required reports or artifacts to generate after implementation**:
- Screenshot or explicit field enumeration of browser print preview before and after patch, included in PR body.
- Confirmation in PR body that `src/routes/-admin.test.tsx` test suite passes in full with no regressions.
- PR body must follow the CLAUDE.md contract: issue summary, root cause, exact files changed and what changed in each, regression protections added, parity impact, and Do Not Touch list.

**State transition**: `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
