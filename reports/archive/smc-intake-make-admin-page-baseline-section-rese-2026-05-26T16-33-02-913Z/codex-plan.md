# SMC SuperFIB - Admin Soak Baseline Hardening Plan

## 1. Issue validation

**Confirmed:**
- `SoakType` union in `src/routes/admin.tsx` contains only `PHASE_0_RESTART_72H | PHASE_3_STABILITY_72H | CUSTOM`. No `PHASE_4_30_DAY` variant exists. Evidence: direct enum inspection cited in research report.
- `SOAK_TEMPLATES` in `src/types/sniper.ts` has no Phase 4 30-day entry. Any Phase 4 soak type string passed through the existing hydration path will be silently dropped or misclassified.
- `hydrateBaselineForm()` and `inferSoakTypeFromReport()` in `src/routes/admin.tsx` pattern-match only `PHASE_0_RESTART_72H` and `PHASE_3_STABILITY_72H`. A Phase 4 evidence object would fall through with loss of soak metadata.
- `baselineCaptureLocked` (research report uses `aselineCaptureLocked` — assumed typo; treat as `baselineCaptureLocked`) is derived solely from `baselineCheckpoint !== null`. There is no reset path. The baseline section is single-shot by construction.

**Likely:**
- Phase 4 live soak gating and operator signoff are blocked in practice because the admin page cannot represent a Phase 4 soak baseline. This is a workflow consequence of the confirmed defects, not separately evidenced.

**Unconfirmed:**
- Whether backend soak evidence storage (`fetchSoakReport` / checkpoint persistence) already accepts a `PHASE_4_30_DAY` soak type string. The research report flags this as an open unknown. The implementation contract below treats this as an open dependency that must be verified before the frontend change ships.
- Whether any migration-status docs or export utilities hardcode Phase 0/3 soak labels. These are out of scope for this patch unless evidence surfaces during implementation.
- Whether a Phase 4 baseline reset should reuse or discard prior checkpoint history. The contract below chooses preserve-and-restart semantics (append a new baseline record; do not delete prior checkpoints) as the safe default, but this must be confirmed by an operator before merge.

---

## 2. Implementation contract

### File 1: `src/types/sniper.ts`

**Section to modify:** `SoakType` type alias (or union) and `SOAK_TEMPLATES` record.

**Exact change required:**
1. Add `PHASE_4_30_DAY` to the `SoakType` union: `'PHASE_0_RESTART_72H' | 'PHASE_3_STABILITY_72H' | 'PHASE_4_30_DAY' | 'CUSTOM'`.
2. Add a `PHASE_4_30_DAY` entry to `SOAK_TEMPLATES` with:
   - `label`: `'Phase 4 – 30-Day Live Soak'`
   - `durationDays`: `30`
   - `symbols`: `['EURUSD', 'USDJPY', 'XAUUSD']` (sourced from `PHASE4_TESTING_GUIDE.md`)
   - `description`: brief operator-facing string matching the Phase 4 live parity corpus requirement
   - All existing fields present on Phase 0 and Phase 3 template entries must also be present; do not introduce new required fields without a corresponding default in every other template.

**Guard rails:**
- Do not rename or revalue `PHASE_0_RESTART_72H` or `PHASE_3_STABILITY_72H`. String values are serialised into persisted soak reports; changing them is a breaking migration.
- Do not remove or reorder any existing `SOAK_TEMPLATES` keys.
- Do not change the shape of the `SoakTemplate` type if one exists; extend only.

**Why in scope:** The type definitions are the single source of truth consumed by `admin.tsx` hydration and the soak picker. All downstream defects trace to missing Phase 4 representation here.

**Acceptance criterion:** TypeScript compiler accepts `'PHASE_4_30_DAY'` as a valid `SoakType` assignment. `SOAK_TEMPLATES['PHASE_4_30_DAY']` is defined and satisfies the template type. No existing type errors introduced.

---

### File 2: `src/routes/admin.tsx`

**Section A — `inferSoakTypeFromReport()`**

**Exact change required:** Add a branch that recognises `'PHASE_4_30_DAY'` in the incoming soak report and returns `'PHASE_4_30_DAY'`. The function must not fall through to `'CUSTOM'` or `undefined` for a Phase 4 soak type string.

**Guard rails:** Do not alter the `PHASE_0_RESTART_72H` and `PHASE_3_STABILITY_72H` branches. Do not change the function signature or return type beyond widening to include `'PHASE_4_30_DAY'`.

**Why in scope:** Without this branch, a persisted Phase 4 soak report is misclassified on re-hydration, corrupting the operator's view of baseline state.

**Acceptance criterion:** Given a soak report with `soakType: 'PHASE_4_30_DAY'`, `inferSoakTypeFromReport()` returns `'PHASE_4_30_DAY'`.

---

**Section B — `hydrateBaselineForm()`**

**Exact change required:** Add `'PHASE_4_30_DAY'` to the set of soak types for which `baseline.*` evidence keys are preserved during hydration. The existing preservation logic for `PHASE_0_RESTART_72H` and `PHASE_3_STABILITY_72H` is the reference pattern; apply it identically to `PHASE_4_30_DAY`.

**Guard rails:** Do not change the key list preserved for Phase 0/3. Do not introduce new baseline fields unless they are already present in the soak report schema.

**Why in scope:** Without this, Phase 4 baseline evidence is silently dropped when the admin page re-hydrates from a persisted report.

**Acceptance criterion:** Given a hydrated soak report carrying `baseline.soak_type = 'PHASE_4_30_DAY'` and other `baseline.*` keys, `hydrateBaselineForm()` restores all those keys into form state without loss.

---

**Section C — Soak type picker / dropdown**

**Exact change required:** Add `PHASE_4_30_DAY` as a selectable option in the soak type picker UI, using the label from `SOAK_TEMPLATES['PHASE_4_30_DAY'].label`. Position it after the Phase 3 option and before `CUSTOM`.

**Guard rails:** Do not reorder existing options. Do not change the value emitted by the Phase 0 or Phase 3 options.

**Why in scope:** Without a picker entry, an operator cannot select Phase 4 even after the type is registered.

**Acceptance criterion:** The soak type dropdown renders a `PHASE_4_30_DAY` option with the correct label. Selecting it sets form state to `'PHASE_4_30_DAY'`.

---

**Section D — Baseline reset control**

**Exact change required:** Replace the unconditional `baselineCaptureLocked = baselineCheckpoint !== null` gate with a two-state model:

- **Locked state** (default when `baselineCheckpoint !== null` and no reset has been requested): baseline capture button remains disabled; add a clearly labelled **"Start new soak"** or **"Reset baseline"** button visible to operators.
- **Unlocked-for-reset state** (entered when operator explicitly clicks the reset control): `baselineCaptureLocked` is set to `false` in local UI state, enabling the capture button for a new soak cycle. The prior `baselineCheckpoint` value must be preserved in a `previousBaselineCheckpoint` local state variable (or equivalent) so it is not lost if the operator cancels.

The reset control must:
- Require a single explicit operator click (no confirmation modal required, but a visible intent affordance — e.g., a secondary-style button with a warning label — is sufficient).
- Clear only the local form state that drives `baselineCaptureLocked`; it must not delete persisted checkpoint data from the backend.
- Be labelled in a way that communicates this starts a new soak cycle, not that it deletes prior data.

**Guard rails:**
- Do not delete or overwrite `baselineCheckpoint` on the backend when the reset control is activated. The reset is a UI-state operation only until a new baseline is explicitly captured and submitted.
- Do not change the existing baseline capture submission path (`fetchSoakReport` / checkpoint write). The reset control only re-enables the capture button; the capture flow itself is unchanged.
- Do not expose the reset control to non-admin roles if role gating already exists elsewhere in the admin route.

**Why in scope:** The baseline section is currently single-shot. Phase 4 requires a new 30-day soak baseline to be captured after Phase 3 completes. Operators have no path to do this without a reset flow.

**Acceptance criterion:** When `baselineCheckpoint !== null`, the reset control is visible and interactive. Clicking it sets `baselineCaptureLocked = false` in local state without modifying persisted checkpoint data. The baseline capture button becomes enabled. If the operator captures a new baseline, the new checkpoint is submitted normally.

---

### File 3: `src/routes/-admin.test.tsx`

**Exact change required:** Add the following test cases:
1. Soak type picker renders a `PHASE_4_30_DAY` option.
2. `inferSoakTypeFromReport()` returns `'PHASE_4_30_DAY'` given a report with that soak type.
3. `hydrateBaselineForm()` preserves `baseline.*` keys for a Phase 4 soak report.
4. When `baselineCheckpoint !== null`, the reset control is rendered.
5. Clicking the reset control sets `baselineCaptureLocked` to `false` in local state without clearing `baselineCheckpoint` from the component's data.
6. After reset, the baseline capture button is enabled.

**Guard rails:** Do not modify or delete existing test cases. Extend only.

**Why in scope:** The research report confirms existing tests cover baseline-lock behavior. The new reset flow and Phase 4 type are not covered; leaving them untested creates a regression risk for future baseline refactors.

**Acceptance criterion:** All existing tests pass. All six new test cases pass.

---

## 3. Patch sequence

1. **`src/types/sniper.ts`** — Add `PHASE_4_30_DAY` to `SoakType` and `SOAK_TEMPLATES`.
   *This must land first. All downstream changes in `admin.tsx` depend on the type being valid.*

2. **`src/routes/admin.tsx` — `inferSoakTypeFromReport()`** — Add Phase 4 branch.
   *Depends on step 1 (type must be defined). No dependency on the picker or reset changes.*

3. **`src/routes/admin.tsx` — `hydrateBaselineForm()`** — Add Phase 4 evidence preservation.
   *Depends on step 1. No dependency on picker or reset changes.*

4. **`src/routes/admin.tsx` — Soak type picker**  — Add `PHASE_4_30_DAY` option.
   *Depends on steps 1–3 (type and hydration must be correct before the picker is testable end-to-end).*

5. **`src/routes/admin.tsx` — Baseline reset control** — Replace locked gate with two-state model.
   *Logically independent of steps 2–4 but sequenced last because it touches the most sensitive operator-facing state. Easier to review in isolation after the type extension is confirmed.*

6. **`src/routes/-admin.test.tsx`** — Add new test cases.
   *Must be written after all five production changes are in place so the tests reflect final behaviour.*

**Sequencing risks:**
- Steps 2 and 3 share the same file. Apply them in a single commit to avoid a mid-patch state where the type is defined but hydration is inconsistent.
- Steps 4 and 5 also share `admin.tsx`. They may be committed together or separately; if separately, commit step 4 before step 5 so the picker is validated independently before the reset flow is introduced.
- Backend compatibility (whether `PHASE_4_30_DAY` is accepted by the soak evidence endpoint) is an external dependency that must be confirmed before any Phase 4 soak baseline is submitted in production. The frontend changes are safe to merge without this confirmation because no live Phase 4 soak is in flight yet; however, the confirmation must happen before the admin page is used to capture a Phase 4 baseline.

---

## 4. Regression guards

**After patching, the implementation agent must verify:**
1. TypeScript build passes with zero new errors (`tsc --noEmit` or equivalent).
2. All existing tests in `src/routes/-admin.test.tsx` pass without modification.
3. All six new test cases (§2, File 3) pass.
4. Manual inspection: Phase 0 and Phase 3 soak type picker options remain present, labelled correctly, and emit the correct string values.
5. Manual inspection: A soak report with `soakType: 'PHASE_0_RESTART_72H'` still hydrates correctly into the baseline form with no regression.
6. Manual inspection: `baselineCaptureLocked = true` still applies when `baselineCheckpoint !== null` and the reset control has not been activated.
7. Manual inspection: The reset control does not appear when `baselineCheckpoint === null` (first-time baseline capture flow is unchanged).

**Existing protections that must still hold:**
- Baseline capture button is disabled by default when a checkpoint exists (unchanged until operator explicitly resets).
- `hydrateBaselineForm` preserves `baseline.*` keys for Phase 0 and Phase 3 (no regression from Phase 4 addition).
- The `CUSTOM` soak type option remains selectable and functional.

**Parity re-validation required:**
- Phase 4 live soak metadata fields (`durationDays: 30`, `symbols`) must match `PHASE4_TESTING_GUIDE.md` exactly. Implementation agent must cross-reference before committing `SOAK_TEMPLATES`.

**Diagnostics that should exist after the patch:**
- The soak type picker selection for `PHASE_4_30_DAY` should be visible in the rendered admin page with the full label from `SOAK_TEMPLATES`.
- No console errors or TypeScript warnings related to unhandled soak type strings should appear when a Phase 4 soak report is loaded.

---

## 5. Non-goals

- Backend soak evidence endpoint changes. This patch is frontend-only. If the backend does not yet accept `PHASE_4_30_DAY`, that is a separate backend task.
- Refactoring the soak template registry into a dynamic/plugin model. The research report recommends Path A (focused extension); Path B (broad refactor) is explicitly out of scope.
- Changing checkpoint history storage, replay, or deletion semantics beyond the local UI state reset described in §2 Section D.
- Updating migration-status docs, export utilities, or operator runbooks to reference Phase 4 soak labelling. These are documentation tasks, not code tasks, and are out of scope for this patch.
- Adding Phase 4 checkpoint schedule labels or milestone markers within the soak timeline UI. The research report flags checkpoint schedule as an open unknown; do not implement until confirmed.
- Any changes to Pine trading formulas, MT5 signal engine, or backend authority components. None are implicated.
- Role-based access control changes to the admin route. Existing role gating (if any) must be preserved but not extended.
- Removing or deprecating Phase 0 or Phase 3 soak types. Both remain in use.

**Attractive but unsafe follow-on changes to avoid in this patch:**
- Adding a confirmation modal to the baseline reset flow. Useful UX but expands scope; defer to a follow-on.
- Consolidating `inferSoakTypeFromReport` and `hydrateBaselineForm` into a single function. Refactoring is not required to close the defect.
- Extending `SOAK_TEMPLATES` with additional phase types (Phase 5, Phase 6, etc.) pre-emptively. Only Phase 4 is evidenced.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
- The `hydrateBaselineForm` Phase 4 branch is written incorrectly (e.g., evidence keys are cleared rather than preserved). An operator loads a Phase 4 soak report, the baseline form silently loses `baseline.soak_type` and related metadata, and the operator unknowingly submits a corrupt or empty baseline. This could invalidate Phase 4 gate evidence and require a full re-soak.

**User-visible failure mode:**
- If the reset control is wired to clear `baselineCheckpoint` from backend state (violating the guard rail), the operator loses the prior Phase 0/3 baseline permanently. No undo path exists.
- If the Phase 4 picker option emits the wrong string value, persisted soak reports are tagged with an unrecognised type, causing silent hydration failures on every subsequent admin page load.

**Backend authority and stale-state risks:**
- The reset control is a UI-state-only operation; it does not write to the backend. Backend authority is not affected by the reset itself. Risk arises only at the moment a new baseline is captured and submitted — standard submission path, unchanged by this patch.
- If the backend soak endpoint does not yet accept `PHASE_4_30_DAY`, the first Phase 4 baseline capture will fail at the API layer. This is an external dependency risk, not a defect in this patch.

**Human approval required before merge:** Yes. Soak baseline reset behaviour and Phase 4 soak metadata are operationally sensitive. An operator or migration lead must review and sign off on:
1. The exact `PHASE_4_30_DAY` string value and template fields before they are serialised into any production soak report.
2. The reset control UX and the preserve-and-restart semantics before the admin page is used in a live Phase 4 soak cycle.

---

## 7. Test requirements

**Tests to add (all in `src/routes/-admin.test.tsx`):**
1. `renders PHASE_4_30_DAY option in soak type picker` — Assert picker contains an option with value `'PHASE_4_30_DAY'` and the label from `SOAK_TEMPLATES['PHASE_4_30_DAY'].label`.
2. `inferSoakTypeFromReport returns PHASE_4_30_DAY` — Pass a mock report with `soakType: 'PHASE_4_30_DAY'`; assert return value is `'PHASE_4_30_DAY'`.
3. `hydrateBaselineForm preserves baseline keys for Phase 4 soak` — Pass a mock report with `baseline.soak_type = 'PHASE_4_30_DAY'` and at least two other `baseline.*` keys; assert all are present in the hydrated form state.
4. `reset control renders when baselineCheckpoint is not null` — Render the admin page with a non-null `baselineCheckpoint`; assert the reset/new-soak button is in the DOM.
5. `reset control does not render when baselineCheckpoint is null` — Render with `baselineCheckpoint = null`; assert the reset button is absent.
6. `clicking reset control enables baseline capture without clearing checkpoint` — Render with a non-null `baselineCheckpoint`; click the reset control; assert `baselineCaptureLocked` local state is `false` and `baselineCheckpoint` remains unchanged.

**Existing tests that must still pass without modification:**
- All tests currently in `src/routes/-admin.test.tsx` covering admin health load, soak report errors, baseline/checkpoint rendering, and baseline-lock behavior.

**Soak/parity/live-environment verification:**
- Before using the patched admin page to capture a Phase 4 baseline in any live or staging environment, an operator must confirm the backend soak endpoint accepts `'PHASE_4_30_DAY'` as a valid soak type value.
- After the first Phase 4 baseline is captured in a staging environment, reload the admin page and confirm `hydrateBaselineForm` correctly restores all `baseline.*` fields from the persisted report.

---

## 8. Implementation handoff

**Branch naming recommendation:**
`codex/smc-intake-phase4-soak-baseline`

**Suggested commit grouping:**
1. `feat(types): add PHASE_4_30_DAY soak type and template` — covers `src/types/sniper.ts` changes only.
2. `feat(admin): extend soak inference and hydration for Phase 4` — covers `inferSoakTypeFromReport` and `hydrateBaselineForm` changes in `admin.tsx`.
3. `feat(admin): add Phase 4 soak picker option and baseline reset control` — covers picker and reset control changes in `admin.tsx`.
4. `test(admin): add Phase 4 soak type and baseline reset coverage` — covers `src/routes/-admin.test.tsx` additions.

**Required artifacts after implementation:**
- All four commits pushed to the branch.
- PR created via `gh pr create --fill` (per `CLAUDE.md` autonomous PR rules).
- No implementation report file is required by this plan, but the PR body must include: issue summary, root cause, exact files changed and what changed in each, regression protections added, parity impact (Phase 4 live soak gating), and the Do Not Touch list (Pine formulas, MT5 engine, backend soak endpoint, Phase 0/3 soak types).

**State transition required after plan handoff:**
`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
