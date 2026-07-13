# SMC SuperFIB - Claude Plan Hardening Request

## 1. Issue validation

**Issue title provided:** "SMC Intake - Fix EA compile errors"
**Research title found:** "SMC SuperFIB - Soak Type & Purpose Implementation Research"

**WARNING — issue title does not match research content.** No EA compile errors are described, evidenced, root-caused, or even mentioned in the primary research report. The MQL5 files (`SessionManager.mqh`, `MarketDataEngine.mqh`, `FreshnessEngine.mqh`) appear only in an orphaned fragment appended to the bottom of the research document (starting at the second "### 3. Root cause hypothesis" block). That fragment describes a crypto weekend-classification defect — not compile errors — and is clearly extracted from a different research artifact. The two research topics do not share a root cause, a file surface, or a fix strategy.

**Planning decision:** This contract is built against the primary research (soakType / soakPurpose). The MT5 crypto fragment is excluded. EA compile errors are excluded entirely because no evidence exists to plan against. If the real intent is EA compile errors, a new research artifact is required before planning can proceed.

---

| Claim | Status | Reasoning |
|---|---|---|
| soakType stored as evidence key/value, no dedicated backend schema column | **Confirmed** | `smc-superfib-sniper.php` contains no `soak_template` column; evidence table is the only persistence layer per section 2.4. |
| Export markdown heading uses static or incorrect title instead of template label | **Confirmed** | BUG_SWEEP_REPORT_2026-05-22 explicitly notes `buildSoakReportMarkdown()` emits a static Phase 0 title; export format was outside the prior contract (section 3.2). |
| soakPurpose field has no operator guidance, label, or validation | **Confirmed** | Field label is the generic string "Soak objective"; no placeholder differentiates by template; no required-field enforcement (sections 2.2, 3.3). |
| Phase 3 checkpoint labels are hardcoded fallback instead of confirmed names | **Confirmed** | `phase-3-dashboard-parity-2026-05-22.md` confirms approved fallback labels used because `PHASE3_SOAK_WINDOW_TASKS.md` does not define explicit names (section 3.4). |
| Operator switching template after baseline capture overwrites evidence | **Likely** | Evidence key is UNIQUE in schema; `handleSoakTypeChange()` does not guard against post-capture overwrite. Research section 4.4 describes the mechanism; listed as open unknown, but schema constraint confirms it. |
| CUSTOM soakType is undetected by `inferSoakTypeFromReport()` on reload | **Confirmed** | Research section 2.6 explicitly states the function returns `null` for CUSTOM, preventing re-hydration. |
| Frontend-backend roundtrip for Phase 3 template hydration has been verified | **Unconfirmed** | Research section 8.3 item 1 lists this as an explicit open unknown. No test artifact confirms save-and-reload for Phase 3. |
| Orphaned MT5 fragment root cause (crypto weekend classification) | **Unconfirmed / Out of scope** | Fragment belongs to a different research artifact. No matching issue title, no compile error evidence. |
| EA compile errors | **Unconfirmed / Not evidenced** | No file path, no error message, no symptom description in research. Cannot plan. |

---

## 2. Implementation contract

Path A only. Path B (backend schema migration) is rejected for this patch per planning constraints and research recommendation. All changes are confined to `src/routes/admin.tsx`.

---

### File 1: `src/routes/admin.tsx`

**Target:** Baseline form field section — soakPurpose label, placeholder, and soakType display

**Exact changes required:**
- Change field label from `"Soak objective"` to `"Soak objective (required)"`.
- Replace the existing generic placeholder with a soakType-conditional placeholder. When soakType is `"PHASE_0_RESTART_72H"`: `"e.g. Verify EA restart stability after Phase 0 reset"`. When `"PHASE_3_STABILITY_72H"`: `"e.g. Confirm Phase 3 stability before live deployment"`. When `"CUSTOM"`: `"e.g. Describe the soak objective and acceptance threshold"`.
- Add a read-only display element (not a form input, not a controlled field) labeled `"Soak template"` immediately above the soakPurpose input, rendering `SOAK_TEMPLATES[soakType].label`. This element must update reactively when `soakType` state changes and must be visually non-editable.

**Guard rails:**
- Do not modify `SOAK_TEMPLATES` in `sniper.ts`.
- Do not change evidence keys `"baseline.soak_type"` or `"baseline.soak_purpose"`.
- Do not add a new evidence field or evidence type.
- Do not touch `handleSoakTypeChange()`, `soakTypeInitializedFromReport`, or `soakTypeManuallyChanged` refs.
- The display element must not be a controlled input; it must not participate in form state or trigger re-renders beyond its own reactive update.

**Why in scope:** Confirmed UI gap — operators receive no visual confirmation of the active template inside the form and no differentiated guidance for soakPurpose.

**Acceptance criterion:** An operator with no prior system knowledge can identify the active template and understand what the soakPurpose field requires without reading external documentation.

---

### File 2: `src/routes/admin.tsx`

**Target:** `buildBaselineEvidenceEntries()` — pre-submission validation guard

**Exact changes required:**
- At the start of `buildBaselineEvidenceEntries()`, before any evidence array is assembled, add two sequential guards:
  1. If `soakType` is null or undefined, return an error result (not throw): `{ error: "Soak template must be selected before saving baseline evidence." }`.
  2. If `soakPurpose` trimmed is empty string, return an error result: `{ error: "Soak objective is required before saving baseline evidence." }`.
- The call site that invokes `buildBaselineEvidenceEntries()` must check for an `error` property on the return value. If present, surface it in the existing form error display region and abort before calling `upsertSoakEvidence()`.

**Guard rails:**
- Do not change the evidence key set produced when both guards pass.
- Do not add new evidence keys.
- `baselineCaptureLocked` remains the authority on whether a baseline already exists. The new guard applies only before the first submission. Do not re-validate on locked-state renders.
- Do not alter the `upsertSoakEvidence()` call signature.

**Why in scope:** Confirmed gap — no validation prevents empty soakPurpose from silently persisting as `""` in the evidence table, corrupting the baseline report.

**Acceptance criterion:** Submitting the baseline form with an empty soakPurpose produces a visible error in the form error display region and makes no API call.

---

### File 3: `src/routes/admin.tsx`

**Target:** `inferSoakTypeFromReport()` — CUSTOM soakType return path

**Exact changes required:**
- In the function body, after searching keys `"baseline.soak_type"` → `"soak.type"` → `"soak_type"` (key order must remain unchanged), change the return logic as follows: if the found value is exactly the string `"CUSTOM"`, return `"CUSTOM"`. If the value is `"PHASE_0_RESTART_72H"` or `"PHASE_3_STABILITY_72H"`, return those unchanged. For any other value, return `null`.
- At the call site that consumes the return value: when the return is `"CUSTOM"`, set soakType to `"CUSTOM"` and do not apply template-default duration or checkpoint count overrides. Operator-defined values for custom duration and count must survive re-hydration.

**Guard rails:**
- Do not change the key search order.
- Do not add new evidence key lookups.
- `soakTypeInitializedFromReport` ref must be set to `true` regardless of whether inference returns CUSTOM, a named template, or null.
- Do not change hydration logic for Phase 0 or Phase 3 templates.

**Why in scope:** Confirmed gap per research section 2.6 — CUSTOM soaks reload without template selection restored, causing operator confusion and potentially incorrect evidence on re-save.

**Acceptance criterion:** A CUSTOM soak baseline saved with duration=96 and count=5 re-hydrates to CUSTOM mode with 96h and 5 checkpoints on page reload. No template selector reset to Phase 3 default occurs.

---

### File 4: `src/routes/admin.tsx`

**Target:** `buildSoakReportMarkdown()` — export heading and filename

**Exact changes required:**
- Locate any static string `"Phase 0 Soak Report"` or equivalent hardcoded title in the function body. Replace it with `SOAK_TEMPLATES[soakType].label`. If the heading is already parameterized via `template.label` passed as an argument, confirm the argument is always the correct template label and is not defaulted to Phase 0 at the call site.
- Set the exported markdown filename to: `smc-superfib-soak-${soakType.toLowerCase().replace(/_/g, '-')}-report.md`. If the filename currently uses a different pattern, align it to this exact contract. Do not use `template.label` for the filename (labels may change; type slugs are stable).

**Guard rails:**
- Do not change evidence keys read by `buildSoakReportMarkdown()`.
- Do not change checkpoint label derivation inside `deriveCheckpointLabels()`.
- Do not add soakType as a new field in the markdown body if it is not already present — the export is an evidence artifact; body schema must remain stable.

**Why in scope:** Confirmed export format gap from BUG_SWEEP_REPORT_2026-05-22; static title exists and filename/heading parity was outside the prior contract (section 3.2).

**Acceptance criterion:** A Phase 3 export produces a file whose name contains `phase-3-stability-72h` and whose H1 heading matches `SOAK_TEMPLATES["PHASE_3_STABILITY_72H"].label`. A Phase 0 export produces the equivalent Phase 0 title and slug.

---

## 3. Patch sequence

1. **File 3 — `inferSoakTypeFromReport()` CUSTOM fix.** Apply first. The form validation guard in step 2 fires on load; soakType must be correctly hydrated before validation can be trusted.

2. **File 1 — form display field and placeholder.** Apply second. UI-only; no logic dependency. Establishes the display contract that regression checks will verify.

3. **File 2 — `buildBaselineEvidenceEntries()` validation guard.** Apply third. Depends on correct soakType hydration from step 1 being in place before the guard fires on submission.

4. **File 4 — `buildSoakReportMarkdown()` heading and filename.** Apply last. No upstream dependency; does not affect form state or evidence saving.

**Sequencing risk:** All four changes are in the same file. Apply as a single logical patch with clear section demarcations. No database migrations. No backend contract changes. No cache invalidation. No state machine transition between steps. The only inter-step dependency is step 1 → step 3 (hydration precedes validation).

---

## 4. Regression guards

**After patching, the implementation agent must verify:**

1. Run `npx vitest run src/routes/-admin.test.tsx`. All 15 existing tests must pass. If a test fails only because label or placeholder copy changed, update the assertion text — do not change the behavior under test.

2. Verify `baselineCaptureLocked` still prevents a second baseline submission. The new soakPurpose guard must not fire on locked-state renders or interfere with the locked-state UI path.

3. Verify `handleSoakTypeChange()` still clears unsaved checkpoint notes on template switch without removing saved soak history. Confirmed behavior from PR #155 — do not touch this function body.

4. After a baseline save for both Phase 0 and Phase 3 templates, confirm the evidence table contains exactly the original 14 keys including `"baseline.soak_type"` and `"baseline.soak_purpose"`. No new keys. No renamed keys.

5. Generate a Phase 3 markdown export and confirm: (a) H1 heading matches `SOAK_TEMPLATES["PHASE_3_STABILITY_72H"].label`; (b) filename slug contains `phase-3-stability-72h`; (c) checkpoint labels are `T+24h`, `T+48h`, `T+72h`.

6. Save a CUSTOM baseline with operator-defined duration and checkpoint count. Reload. Confirm the form re-hydrates to CUSTOM with operator values intact — not to Phase 3 defaults.

**Existing protections that must still hold:**
- `baselineCaptureLocked` enforcement is active.
- `soakTypeInitializedFromReport` and `soakTypeManuallyChanged` refs are not cleared or reassigned by the new display element.
- Evidence type `"baseline_metadata"` remains the only type emitted by `buildBaselineEvidenceEntries()`.
- All new code paths pass `tsc --noEmit` without error.

**Parity re-validations required:**
- Phase 3 manual browser test (pending from 2026-05-22 audit): template renders label `"Phase 3 - Stability Soak"`, 3 checkpoints, 72h default.
- Phase 0 manual browser test: template renders the confirmed Phase 0 label, 4 checkpoints, 72h default.

**Diagnostics that must exist after the patch:**
- The read-only soak template field is visible in the baseline form at all times when a template is selected. Its absence is a regression.
- A baseline save attempt with empty soakPurpose produces a visible, non-silent error message in the form error display region.

---

## 5. Non-goals

**Out of scope for this patch:**

- **Path B — backend schema migration:** Adding a `soak_template` column to `smc_sf_soak_checkpoints` or any other table. Deferred to Phase 4+. The PHP backend must not be opened.
- **`sniperClient.ts` payload changes:** Do not modify `createSoakCheckpoint()` to pass soakType. Backend contract must remain unchanged.
- **`sniper.ts` type definitions:** `SOAK_TEMPLATES` and `SoakType` enum are confirmed correct. Do not change type definitions.
- **EA compile errors:** Issue title not supported by evidence. No MQL5 file changes in scope.
- **Crypto weekend classification fix:** The orphaned MT5 fragment is from a different research artifact. `mt5/SessionManager.mqh`, `mt5/MarketDataEngine.mqh`, `mt5/FreshnessEngine.mqh`, and `class-market-data-service.php` must not be touched.
- **Multi-operator evidence overwrite prevention:** Confirmed design limitation (section 4.4). Requires Phase 4 schema work. Do not add per-operator evidence keying or evidence versioning.
- **Phase 3 checkpoint label finalization:** Research flags this as an open unknown. Do not change Phase 3 checkpoint labels until phase documentation confirms final naming.

**Attractive but unsafe follow-ons to avoid in this patch:**
- Renaming `"baseline.soak_type"` to `"baseline.template"` — silently breaks all existing saved baselines.
- Adding a backfill migration script for existing evidence rows — out of scope without a confirmed schema contract.
- Expanding the exported markdown body with new fields or sections — export schema is an evidence artifact; changes require a separate contract.
- Moving soakType display into a shared component or extracting form logic into a hook — scope creep; no evidence this abstraction is needed now.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
If the `buildBaselineEvidenceEntries()` validation guard incorrectly classifies a valid soakPurpose as empty (e.g., a trim/whitespace bug, a ref-vs-state timing issue), all operators will be blocked from saving any baseline evidence. This blocks all future phase gate decisions. Recovery requires a revert or targeted hotfix, and would produce a support incident. This is the single highest-risk point in the patch.

**User-visible failure modes:**
- If the read-only template display element is implemented as a controlled input or triggers a state update, it may cause the template selector to reset or enter a re-render loop. Visible symptom: template selector reverts to default when the operator attempts to switch it.
- If the export filename slug pattern is wrong, exported files have inconsistent names. Low severity; recoverable without code change.

**Backend authority / stale-state risks:**
- None introduced by this patch. Backend schema is not touched. Evidence keys are unchanged. `upsertSoakEvidence()` call chain is unchanged except for the pre-submission guard.
- The confirmed multi-operator overwrite risk remains after this patch. It is not made worse, but it is not fixed.

**Whether human approval is required before merge:**
**Yes.** Research section 7 explicitly requires it. Specifically: the soakPurpose required-field enforcement must be confirmed acceptable by the operator responsible for Phase 3 soak capture — making a previously optional field required is a workflow-breaking change if operators have been leaving it blank intentionally. The export filename pattern must be confirmed with whoever archives soak reports.

---

## 7. Test requirements

**Tests to add in `src/routes/-admin.test.tsx`:**

1. `buildBaselineEvidenceEntries()` with empty `soakPurpose` returns `{ error: "..." }` and does not produce an evidence array.
2. `buildBaselineEvidenceEntries()` with whitespace-only `soakPurpose` returns `{ error: "..." }`.
3. `buildBaselineEvidenceEntries()` with valid `soakPurpose` and valid `soakType` produces an evidence array containing key `"baseline.soak_purpose"` with the exact input value.
4. `buildBaselineEvidenceEntries()` with null `soakType` returns `{ error: "..." }`.
5. `inferSoakTypeFromReport()` with evidence `{ "baseline.soak_type": "CUSTOM" }` returns `"CUSTOM"`.
6. `inferSoakTypeFromReport()` with evidence `{ "baseline.soak_type": "UNKNOWN_VALUE" }` returns `null`.
7. `buildSoakReportMarkdown()` called with soakType `"PHASE_3_STABILITY_72H"` produces an H1 heading containing `SOAK_TEMPLATES["PHASE_3_STABILITY_72H"].label`.
8. `buildSoakReportMarkdown()` called with soakType `"PHASE_0_RESTART_72H"` produces an H1 heading containing `SOAK_TEMPLATES["PHASE_0_RESTART_72H"].label`.

**Existing tests that must still pass:**
- All 15 existing tests in `src/routes/-admin.test.tsx`. Assertion text updates for copy changes are allowed; behavioral changes are not.

**Manual / browser verification required:**
- Phase 3 template renders: label, 3 checkpoints (`T+24h`, `T+48h`, `T+72h`), 72h default. Required — pending from 2026-05-22 audit.
- Phase 0 template renders: confirmed label, 4 checkpoints (`T+12h`, `T+24h`, `T+48h`, `T+72h`), 72h default.
- CUSTOM template: operator-defined duration and count fields are active; no hardcoded checkpoint labels.
- Baseline save with empty soakPurpose: error visible, no API call made.
- Baseline save with valid soakPurpose: evidence saved, report refresh fires, template display field remains correct.
- CUSTOM baseline save-and-reload: operator values survive re-hydration.

**Soak / live-environment verification:**
- Not required. No backend state changes, no freshness or signal gating affected.

---

## 8. Implementation handoff

**Branch naming:**
```
fix/soak-type-purpose-ui-validation
```

**Suggested commit grouping:**

- Commit 1: `fix(admin): restore CUSTOM soakType hydration in inferSoakTypeFromReport`
- Commit 2: `fix(admin): add read-only soak template display and soakPurpose placeholder guidance`
- Commit 3: `fix(admin): add required-field validation guard to buildBaselineEvidenceEntries`
- Commit 4: `fix(admin): align buildSoakReportMarkdown heading and filename to template label`
- Commit 5: `test(admin): add soakPurpose validation, CUSTOM inference, and export heading tests`

**Required reports or artifacts to generate after implementation:**
- `reports/codex-implementation-report.md` — all files changed, exact lines modified, test results (pass/fail counts), Phase 3 and Phase 0 browser verification results, confirmation that evidence key set is unchanged.
- `reports/codex-review.json` — standard review payload for pipeline watcher.

**State transition required after plan handoff:**
```
READY_FOR_IMPLEMENTATION
editing_locked=false
```
