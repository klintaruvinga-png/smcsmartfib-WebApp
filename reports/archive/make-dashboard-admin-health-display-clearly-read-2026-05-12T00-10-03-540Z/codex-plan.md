# SMC SuperFIB - Claude Plan Hardening Request

## 1. Issue validation

**Confirmed**

- `fetchAdminHealth()` in `src/lib/api/sniperClient.ts` is correctly backend-driven and cache-busted. Backend authority at the data layer is intact.
- `AdminPage` in `src/routes/admin.tsx` renders backend-fetched fields as static cards. No local health computation is performed.
- The Phase 0 parity audit at `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md` explicitly requires the frontend to consume only the backend health payload.
- The checklist item in `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md` confirms the gap is open and unresolved: "Make dashboard admin health display clearly read-only and backend-driven. UI does not imply local editability or frontend authority."

**Confirmed root cause:** `AdminPage` places backend-owned read-only health diagnostic cards and operator-editable soak evidence/baseline forms in the same visual context without visual hierarchy, section labeling, or affordance distinguishing backend-owned status from operator-entered metadata. The data wiring is correct; the UI contract is not communicated to the operator.

**Likely**

- One or more health fields in the health card section may render in a way that could be mistaken for an input (e.g., unstyled value next to a label, or a field component reused from the editable section). This is unconfirmed until the component tree of the health cards is inspected.
- There is no `aria-readonly`, `disabled`, or `readOnly` attribute on any health-status display element that would formally mark it non-interactive in the accessibility tree.

**Unconfirmed**

- Whether health display elements exist outside `AdminPage` elsewhere in the dashboard that also imply editability. The research report flags this as an open unknown. This plan does not address any such hypothetical secondary surface.
- Whether operator confusion has already caused incorrect soak evidence to be submitted based on misread health state. No evidence of this in the research report.

**Rejected hypotheses**

- That the data wiring in `sniperClient.ts` is incorrect. Evidence is clear that `cacheBust: true` and a backend-only API call are already in place. No change to the API client is warranted.
- That `src/types/sniper.ts` requires modification. The research report lists it as a file "likely affected" but provides no evidence that the `EngineHealth` type contract is wrong or that any type change is needed for read-only labeling.

---

## 2. Implementation contract

### File 1: `src/routes/admin.tsx`

**Function / section to modify:** The JSX block inside `AdminPage` that renders backend health diagnostic cards — specifically the section that maps over or directly renders `feedStatus`, `backendSync`, `engineRunState`, `twelveDataKeyStatus`, and any other fields sourced from the `AdminHealthResponse` payload.

**Exact change required:**

1. Wrap the health diagnostic card block in a clearly labeled section with a visible heading such as `Backend Health Status` and a sub-label such as `Read-only — values are owned and updated by the backend`. The label must be rendered as static text, not an input or tooltip.
2. Apply a visually distinct container style to the health card section that separates it from the operator-entry forms below (e.g., a distinct background, border, or card grouping with a `data-section="backend-health-readonly"` attribute on the wrapper element).
3. Confirm that every value rendered from the `AdminHealthResponse` payload is rendered as a static text node (`<span>`, `<p>`, `<dd>`, or equivalent). If any health field is currently rendered using an `<input>`, `<textarea>`, or reused editable `Field`/`TextField` component, replace it with a read-only text display element.
4. Add a visible section label to the operator-entry area (soak baseline and evidence forms) such as `Operator Evidence — enter metadata only`. This is required to contrast the two sections and make the boundary explicit.
5. Do not add any `onChange`, `onBlur`, or `onSubmit` handler to the health card section. Do not add a save or submit button within the health card section boundary.

**Guard rails:**
- Do not modify `fetchAdminHealth()` call site, its arguments, or its response handling.
- Do not remove, reorder, or alter the soak evidence form or baseline capture form.
- Do not add a new route or sub-route. This is a within-page layout change only.
- Do not alter the authentication or permission guard on the admin route.
- Do not change any field names, selectors, or data keys sourced from `AdminHealthResponse`.
- Do not introduce local state that mirrors or caches any `AdminHealthResponse` field.

**Why in scope:** This is the only confirmed render site for admin health diagnostics. The gap between data correctness and UI communication lives entirely in this file's JSX.

**Acceptance criterion:** After the patch, an operator viewing `/admin` can unambiguously identify which section displays backend-owned read-only status and which section accepts operator input. No health status field must appear editable, focusable as an input, or adjacent to a submit action without a clear visual and textual boundary separating it from the evidence form.

---

### File 2: `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`

**Section to modify:** The checklist item: `"Make dashboard admin health display clearly read-only and backend-driven. UI does not imply local editability or frontend authority."`

**Exact change required:** Mark the checklist item as completed (`- [x]`) after the patch is confirmed to pass its acceptance criterion. Add a one-line note referencing the PR that closes it.

**Guard rails:** Do not alter any other checklist items. Do not change the phase label, date, or file path.

**Why in scope:** This file is the active Phase 0 tracking artifact for this exact item. Leaving it unchecked after a valid fix is a tracking integrity failure.

**Acceptance criterion:** The checklist item reads `[x]` and references the closing PR.

---

### File 3: `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`

**Section to modify:** The section documenting the frontend `/admin` display contract.

**Exact change required:** Append a short verification note confirming that the UI now includes explicit read-only labeling and visual section separation as of this patch. Include the date and PR reference.

**Guard rails:** Do not modify the documented contract itself, the parity test results, or any backend/API parity assertions in the file.

**Why in scope:** This file is the standing guard document for backend health parity on the admin route. The patch changes observable UI behavior in the area this document covers. The document must remain current.

**Acceptance criterion:** The audit file contains a dated addendum that accurately describes the post-patch state of the health display UI contract.

---

## 3. Patch sequence

1. **Inspect `src/routes/admin.tsx` JSX output** — Identify the exact block rendering `AdminHealthResponse` fields and confirm whether any field uses an editable component. No code change yet; this is a pre-patch verification step.

2. **Apply read-only labeling and visual separation in `src/routes/admin.tsx`** — Add the section wrapper, heading, and read-only sub-label. Replace any accidentally editable health field renderers with static text elements. Add the operator-entry section label.

3. **Verify the patch visually** — Render the admin page in a browser or dev environment and confirm the two sections are visually and semantically distinct before proceeding.

4. **Update `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`** — Mark the checklist item complete and reference the PR.

5. **Append to `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`** — Add the dated verification note.

**Dependencies:**
- Step 2 depends on the inspection result from Step 1. If Step 1 reveals that no health field is accidentally editable and all are already static text, the replacement sub-step in Step 2 is a no-op but the labeling and section separation must still be applied.
- Steps 4 and 5 must not be applied until Step 3 confirms the UI is correct. Marking items complete before verification is a tracking integrity failure.

**Sequencing risks:**
- No state, cache, or migration sequencing risk. This is a pure UI and documentation change.
- No backend contract changes means no deployment coordination is required.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. Load `/admin` in the browser while authenticated. Confirm `fetchAdminHealth()` fires and the backend payload populates the health card section. Confirm no network error is introduced.
2. Confirm the soak evidence form and baseline form remain fully functional: inputs accept values, submission still works, no handlers are broken.
3. Confirm no health field in the health card section is focusable as an interactive input element (Tab key must skip over health values).
4. Confirm the section heading and read-only label are visible without interaction (no tooltip-only, no hidden text).
5. Confirm `data-section="backend-health-readonly"` or equivalent semantic marker is present on the health section wrapper (used for future selector stability).

**Existing protections that must still hold:**

- `fetchAdminHealth()` must still call `/admin/health` with `cacheBust: true`. This must not be altered.
- The admin route authentication guard must still be in place.
- The existing soak report load failure handling added in commit `0f49d54` must still function.

**Parity re-validations required:**

- Confirm `/admin/health` endpoint response fields match what the UI renders in the health card section. No field from the backend payload must be silently dropped by the new layout.
- Confirm `/health` (non-admin endpoint) fields are not incorrectly surfaced on the admin page.

**Logging / diagnostics that must exist after the patch:**

- No new logging is required. The existing `fetchAdminHealth()` error path (introduced in `0f49d54`) is sufficient. Confirm it still surfaces on load failure.

---

## 5. Non-goals

**Out of scope for this patch:**

- Any change to `src/lib/api/sniperClient.ts`. Backend authority at the API layer is confirmed correct.
- Any change to `src/types/sniper.ts`. The `EngineHealth` type contract is not implicated.
- Splitting `AdminPage` into sub-routes or a separate read-only diagnostic page (Path B from the research report). The evidence supports Path A only.
- Adding any new data-fetching, polling, or WebSocket connection for health updates.
- Searching for or fixing health display elements outside `AdminPage`. The research report marks this as an open unknown with no evidence. It is explicitly deferred.
- Modifying the backend REST API or PHP layer.
- Modifying Pine scripts or MT5 logic.
- Accessibility remediation beyond what is strictly required by the read-only labeling (e.g., full ARIA audit of the page).

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not refactor the admin page layout broadly while making this change. The blast radius must remain limited to the health section and its labels.
- Do not add a "refresh" or "force-sync" button to the health section. It would re-introduce ambiguity about who owns the health state.
- Do not convert the health card section into a collapsible or hidden panel. Operators must always see the backend health state without extra interaction.
- Do not move the soak evidence form to a separate route in this patch. That is a valid future improvement but is a scope expansion that risks breaking the existing soak capture workflow.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If the health card section is accidentally wrapped in a form element or if any health field is left as an editable input with a submit handler, an operator could submit a value that overwrites or shadows backend health state in local component state — creating a stale-state divergence between what the operator sees and what the backend actually reports.

**User-visible failure mode:**

Operator sees health values that do not update from the backend because a local state mirror was accidentally introduced by the patch. Or the soak evidence form is broken because a handler or key was removed during the section restructure.

**Backend authority and stale-state risks:**

Low if the guard rails are followed. The only risk is an inadvertent local state introduction. The patch must not introduce `useState` or `useReducer` for any `AdminHealthResponse` field.

**Whether human approval should be required before merge:**

Yes. The research report explicitly requires human review before merge to validate that the wording and visual separation correctly communicate backend ownership to operators. A product owner or operator representative should confirm the section labels and visual treatment are unambiguous before this is merged to `main`.

---

## 7. Test requirements

**Tests to add:**

- In `src/routes/-admin.test.tsx`: add a test that renders `AdminPage` with a mocked `fetchAdminHealth()` response and asserts that:
  - Each health field value is rendered as a non-interactive element (not `<input>`, not `<textarea>`, not a component with an `onChange` prop).
  - The health section container has the `data-section="backend-health-readonly"` attribute or equivalent selector.
  - The read-only label text is present in the rendered output.
- In the same file: add a test that confirms `fetchAdminHealth()` is called on mount and that its error state renders the existing error surface (regression guard for `0f49d54`).

**Existing tests that must still pass:**

- All existing tests in `src/routes/-admin.test.tsx`, particularly the soak report load failure handling tests added in `0f49d54`.

**Manual verification required:**

- Load `/admin` in a browser with a live backend. Confirm the health section shows current backend values, updates on page refresh, and contains no editable controls.
- Confirm the soak evidence and baseline forms remain fully operational end-to-end.
- Parity check: confirm the fields displayed in the health card section match the documented fields in `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`.

**Soak / replay / live-environment verification:**

- Not required for this patch. This is a UI labeling and visual separation change with no data contract modification. A live browser verification against the WordPress backend is sufficient.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`codex/admin-health-readonly-ux-hardening`

**Suggested commit grouping:**

1. `fix(admin): add read-only labeling and visual section separation to health diagnostics` — the `admin.tsx` JSX change only.
2. `docs(phase-0): mark admin health read-only UX checklist item complete` — the checklist file update.
3. `docs(phase-0): append UI contract verification note to admin health parity audit` — the audit file addendum.

**Required reports or artifacts to generate after implementation:**

- No new report files. The existing audit file is updated in place (commit 3 above).
- The PR body must document: the read-only labeling text used, the visual separation mechanism applied, the selector or attribute added to the health section wrapper, and confirmation that `fetchAdminHealth()` was not modified.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
