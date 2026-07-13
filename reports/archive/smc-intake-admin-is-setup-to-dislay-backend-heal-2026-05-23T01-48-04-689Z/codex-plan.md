# SMC SuperFIB - Hardened Implementation Contract

## 1. Issue validation

**Confirmed**

| Claim | Status | Reasoning |
|---|---|---|
| `src/routes/admin.tsx` hardcodes Phase 0 soak language and a fixed `T+12h / T+24h / T+48h / T+72h` checkpoint schedule | **Confirmed** | Research report cites exact label text (`Operator Gathered Baseline`, phase-0-specific timeline copy) and confirms the file is the sole owner of the soak workspace UI. |
| `src/routes/admin.soak-report.tsx` delegates entirely to `/admin` | **Confirmed** | File simply redirects; no independent soak UI logic resides there. |
| `src/types/sniper.ts` `SoakReport` / `SoakCheckpointRow` are already generic | **Confirmed** | Report states the types do not enforce Phase 0 semantics; the stale semantics live in the render layer only. |
| Phase 3 soak is active and migration-blocking | **Confirmed** | `PHASE3_SOAK_WINDOW_TASKS.md` documents the 2026-05-22 → 2026-05-25 window with an explicit Phase 3 T0 baseline capture requirement against the admin workspace. |
| Backend `SoakReport` schema requires extension before this fix can work | **Unconfirmed / Rejected as prerequisite** | The research recommends Path A precisely because the existing generic contract is sufficient for a UI-layer adaptation. No backend field changes are justified until a concrete schema gap is proven. |
| Phase 3 checkpoint schedule is known and fixed | **Unconfirmed** | The research does not document Phase 3 checkpoint intervals. The implementation must derive them from `PHASE3_SOAK_WINDOW_TASKS.md` at read time; they must not be assumed equal to Phase 0. |

**Corrected root cause (precise form):** The admin soak workspace renders Phase 0-specific static copy and a Phase 0-specific checkpoint template unconditionally. The `SoakReport` data model is already generic; the failure is entirely in the render layer. Operators who use the current UI to capture Phase 3 evidence will produce mislabeled baseline and checkpoint records, degrading confidence in Phase 3 gate evidence.

---

## 2. Implementation contract

### File 1 — `src/types/sniper.ts`

**Scope:** Add a `SoakTemplate` discriminated union and a `SoakTypeConfig` record. Do not touch `SoakReport`, `SoakCheckpointRow`, `SoakEvidenceType`, or any existing type member.

**Exact change required:**

Append after the existing soak-related types:

```
export type SoakType =
  | 'PHASE_0_RESTART_72H'
  | 'PHASE_3_STABILITY_72H'
  | 'CUSTOM';

export interface SoakTemplateConfig {
  soakType: SoakType;
  label: string;
  description: string;
  defaultDurationHours: number;
  defaultCheckpointCount: number;
  checkpointLabels: string[];   // length must equal defaultCheckpointCount
}
```

Define a `SOAK_TEMPLATES` constant (not exported as a type — exported as a value) mapping each `SoakType` to its `SoakTemplateConfig`:

- `PHASE_0_RESTART_72H`: label `Phase 0 — Restart Soak`, duration 72h, 4 checkpoints: `['T+12h','T+24h','T+48h','T+72h']`
- `PHASE_3_STABILITY_72H`: label `Phase 3 — Stability Soak`, duration 72h, checkpoint labels derived verbatim from `PHASE3_SOAK_WINDOW_TASKS.md` checkpoint names. If that document does not specify labels, use `['T+24h','T+48h','T+72h']` as the default pending operator confirmation.
- `CUSTOM`: label `Custom Soak`, duration 0 (operator-supplied), checkpoint labels empty array (operator-supplied at selection time).

**Guard rails:**
- Do not alter `SoakReport`, `SoakCheckpointRow`, `SoakEvidenceType`, or any existing exported type.
- `SOAK_TEMPLATES` is a pure constant; it must not import from any route or component file.
- No runtime API calls in this file.

**Why in scope:** The admin UI needs a stable, typed template registry to drive its controls. Defining templates here keeps the render layer thin and makes the template set testable in isolation.

**Acceptance criterion:** TypeScript compilation succeeds with no new errors. `SOAK_TEMPLATES['PHASE_0_RESTART_72H'].checkpointLabels` returns exactly `['T+12h','T+24h','T+48h','T+72h']`.

---

### File 2 — `src/routes/admin.tsx`

**Scope:** Replace the hardcoded Phase 0 soak section with a template-driven soak workspace. All other admin panel sections (backend health, auth redirect, error handling, `fetchSoakReport`, `createSoakCheckpoint`, `upsertSoakEvidence` call sites) are **frozen**.

**Exact function / section to modify:**

Locate the JSX block that currently renders:
- The `Phase 0 Soak Workspace` heading
- The `Operator Gathered Baseline` baseline form
- The `T+12h / T+24h / T+48h / T+72h` checkpoint timeline instructions
- The checkpoint save/submit controls tied to those fixed labels

Replace that block — and only that block — with a new `<SoakWorkspace>` inline section (or extracted component if the block exceeds ~120 lines) that does the following:

**Step A — Soak type selector (renders before the baseline form):**
- A labeled `<select>` (or equivalent) bound to local state `soakType: SoakType`.
- Options populated from `Object.values(SOAK_TEMPLATES)` using `label` field as display text and `soakType` field as value.
- Default selected value: `'PHASE_3_STABILITY_72H'` (Phase 3 is the active soak).
- On change: update `soakType` state; reset `durationHours` and `checkpointCount` to the template defaults; reset any unsaved baseline/checkpoint form state.

**Step B — Duration and checkpoint count controls (renders when `soakType === 'CUSTOM'` only):**
- A numeric input for `durationHours` (min 1, max 720, step 1).
- A numeric input for `checkpointCount` (min 1, max 24, step 1).
- For non-CUSTOM types, display duration and checkpoint count as read-only text derived from the selected template.

**Step C — Baseline form:**
- Header text becomes: `{SOAK_TEMPLATES[soakType].label} — Operator Baseline`.
- Instructions text becomes: `Capture the T0 baseline at soak start. Use checkpoint snapshots for {derivedCheckpointLabels.join(', ')}.`
- All baseline form fields, submit handler, and API calls (`upsertSoakEvidence`) remain unchanged.

**Step D — Checkpoint timeline:**
- Checkpoint labels are derived: for CUSTOM, generate `['T+Xh', ...]` evenly spaced across `durationHours` for `checkpointCount` intervals. For named types, use `SOAK_TEMPLATES[soakType].checkpointLabels`.
- Render the checkpoint save controls using derived labels in place of the hardcoded `T+12h` etc. strings.
- The `createSoakCheckpoint` call signature does not change; pass the derived label as the checkpoint identifier string.

**Guard rails:**
- Do not touch `fetchSoakReport`, auth redirect logic, error boundary, or loading state.
- Do not alter the `createSoakCheckpoint` or `upsertSoakEvidence` function signatures or their call arguments except the checkpoint label string.
- Do not add any new API endpoints or new network calls.
- Do not remove checkpoint history rendering.
- Soak type selection state is component-local only — do not persist to backend, localStorage, or URL params.

**Why in scope:** This file is the sole owner of the soak workspace UI. All stale Phase 0 copy lives here.

**Acceptance criterion:** With `soakType = 'PHASE_3_STABILITY_72H'` selected, the workspace header shows `Phase 3 — Stability Soak`, the baseline form header shows the Phase 3 label, and the checkpoint controls show the Phase 3 labels. With `soakType = 'PHASE_0_RESTART_72H'` selected, the original Phase 0 label set is reproduced exactly.

---

### File 3 — `src/routes/-admin.test.tsx`

**Scope:** Update existing soak-workspace tests to account for the new soak type selector; add coverage for Phase 3 template rendering and CUSTOM mode. Do not remove any existing test.

**Exact changes required:**

1. **Existing tests that assert Phase 0 heading text** (`Phase 0 Soak Workspace`, `Operator Gathered Baseline`, `T+12h` etc.): update assertions to select the `PHASE_0_RESTART_72H` template first, then assert the Phase 0 text. These tests remain valid; they now require an explicit template selection step.

2. **Add test: Phase 3 template rendering.** Select `PHASE_3_STABILITY_72H` from the soak type selector. Assert that the workspace heading contains `Phase 3 — Stability Soak`. Assert that at least one checkpoint label from the Phase 3 config is present in the DOM.

3. **Add test: CUSTOM template controls.** Select `CUSTOM`. Assert that duration and checkpoint count inputs appear. Enter `durationHours = 48` and `checkpointCount = 3`. Assert that three checkpoint controls render with evenly-spaced labels (`T+16h`, `T+32h`, `T+48h`).

4. **Add test: template switch resets form state.** Start with Phase 3, enter baseline text, switch to Phase 0. Assert that the baseline input is cleared.

**Guard rails:**
- Do not remove load-failure, refresh-recovery, or checkpoint-history tests.
- Do not mock `SOAK_TEMPLATES` — use the real constant.

**Why in scope:** Tests must cover the new control flow or they provide false confidence in regression safety.

**Acceptance criterion:** All pre-existing tests pass. Four new tests pass. Zero new TypeScript errors in the test file.

---

## 3. Patch sequence

```
1. src/types/sniper.ts
   — Add SoakType, SoakTemplateConfig, SOAK_TEMPLATES constant.
   — No dependencies on other changed files.
   — Must be committed before admin.tsx changes so imports resolve.

2. src/routes/admin.tsx
   — Import SoakType, SOAK_TEMPLATES from sniper.ts.
   — Replace hardcoded soak section with template-driven workspace.
   — Depends on Step 1.

3. src/routes/-admin.test.tsx
   — Update and extend tests.
   — Depends on Steps 1 and 2; must be applied after both to avoid import errors during test run.
```

**Sequencing risks:**
- If Steps 1 and 2 are committed atomically in one commit, CI will not see a broken intermediate state. Preferred.
- Step 3 must follow Steps 1+2 or the test file will fail to compile.
- No database migrations, no cache invalidation, no backend contract changes — no additional sequencing risk.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. `tsc --noEmit` — zero new type errors.
2. Full test suite in `src/routes/-admin.test.tsx` — all pre-existing tests green; four new tests green.
3. Manual browser check: navigate to `/admin`, confirm soak type selector appears above the baseline form, confirm selecting `PHASE_0_RESTART_72H` reproduces the original Phase 0 checkpoint labels exactly.
4. Manual browser check: select `PHASE_3_STABILITY_72H`, confirm Phase 3 label appears in heading, confirm Phase 3 checkpoint labels appear.
5. Manual browser check: `fetchSoakReport` still fires on page load; backend health section still renders; auth redirect still fires for unauthenticated users.

**Existing protections that must still hold:**
- Auth redirect guard in `admin.tsx` — must not be weakened or reordered.
- `fetchSoakReport` load / refresh / error path — unchanged.
- `createSoakCheckpoint` and `upsertSoakEvidence` API contracts — call signatures unchanged.
- Checkpoint history rendering — still present after patch.

**Parity re-validations required:**
- After the patch, an operator must be able to capture a Phase 3 T0 baseline in the admin workspace and have the resulting record land in the backend soak report with a Phase 3-labeled header. Verify via the backend soak-report endpoint response that the label string stored matches the Phase 3 template label (not a Phase 0 string).

**Logging / diagnostics:**
- No new logging required. If a `console.warn` or equivalent already exists for soak load failure, it must remain.

---

## 5. Non-goals

**Out of scope for this patch:**

- Any change to the WordPress backend soak-report or checkpoint endpoints.
- Any change to `src/lib/api/sniperClient.ts` function signatures.
- Persisting the selected soak type to the backend, localStorage, or URL.
- Adding a new `/admin/soak-setup` or `/admin/soak-config` route.
- Changing `src/routes/admin.soak-report.tsx` beyond confirming the redirect still points to `/admin`.
- Altering `SoakReport`, `SoakCheckpointRow`, or `SoakEvidenceType` in `src/types/sniper.ts`.
- Pine script or MT5 EA changes of any kind.
- Changing `.github/migration/PHASE3_SOAK_WINDOW_TASKS.md` or any migration governance document.
- Adding a Phase 4 or future-phase soak template (templates are addable later; do not anticipate them now).
- Markdown/print export format changes.

**Attractive but unsafe follow-ons to avoid in this patch:**

- Extending the backend schema to store `soak_type` metadata (Path B from the research) — justified only after a concrete backend gap is proven; do not add speculatively.
- Moving soak type selection to a URL query param or route segment — requires router integration and is wider than the fix.
- Refactoring the full admin panel component — the soak section replacement is the entire scope; do not clean up surrounding code.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
The soak type selector resets or corrupts the baseline form state mid-entry, causing an operator to submit a blank or partial Phase 3 baseline. This would produce invalid Phase 3 gate evidence, requiring a repeat baseline capture and delaying Phase 3 closure.

**User-visible failure mode:**
Operator sees Phase 0 checkpoint labels on a Phase 3 soak record, or the workspace heading still says `Phase 0 Soak Workspace` after selecting Phase 3. Either causes incorrect labeling of migration gate evidence.

**Backend authority / stale-state risks:**
Low. This patch does not alter any API call arguments except the checkpoint label string. The backend stores what the frontend sends; a wrong label string is the only risk. Mitigated by the Phase 3 parity re-validation in §4.

**Human approval required before merge:** Yes. Soak template changes directly affect operator evidence collection for a live migration gate. A human reviewer must confirm that the Phase 3 checkpoint labels in `SOAK_TEMPLATES` match the requirements in `PHASE3_SOAK_WINDOW_TASKS.md` before merge.

---

## 7. Test requirements

**Tests to add (exact target area):**

| Test | Target | Location |
|---|---|---|
| Phase 3 template renders correct heading and checkpoint labels | `<SoakWorkspace>` with `soakType = PHASE_3_STABILITY_72H` | `src/routes/-admin.test.tsx` |
| CUSTOM template shows duration and checkpoint count inputs | `<SoakWorkspace>` with `soakType = CUSTOM` | `src/routes/-admin.test.tsx` |
| CUSTOM label generation — 3 checkpoints over 48h | Derived label array `['T+16h','T+32h','T+48h']` | `src/routes/-admin.test.tsx` |
| Template switch clears baseline form state | State reset on `soakType` change | `src/routes/-admin.test.tsx` |

**Tests to update (exact modification):**

| Existing test | Required update |
|---|---|
| Any test asserting `Phase 0 Soak Workspace` heading text | Prepend: select `PHASE_0_RESTART_72H` from the soak type selector before asserting |
| Any test asserting `T+12h` / `T+24h` / `T+48h` / `T+72h` label text | Prepend: select `PHASE_0_RESTART_72H` before asserting |
| Any test asserting `Operator Gathered Baseline` text | Prepend: select `PHASE_0_RESTART_72H` before asserting |

**Existing tests that must still pass without modification:**
- Load failure recovery test
- Refresh / re-fetch test
- Checkpoint history render test
- Auth redirect test

**Soak / live-environment verification:**
After deploy to staging or live admin panel, an operator must perform one full Phase 3 T0 baseline capture using the Phase 3 template and confirm the backend soak report reflects the correct Phase 3 label. This is the Phase 3 baseline capture required by `PHASE3_SOAK_WINDOW_TASKS.md` Task 1; it serves double duty as soak verification.

---

## 8. Implementation handoff

**Branch naming recommendation:**
`codex/admin-soak-template-selector`

**Suggested commit grouping:**

```
Commit 1: feat(types): add SoakType, SoakTemplateConfig, SOAK_TEMPLATES constant
  — src/types/sniper.ts only

Commit 2: feat(admin): replace hardcoded Phase 0 soak workspace with template-driven selector
  — src/routes/admin.tsx only

Commit 3: test(admin): update Phase 0 soak tests; add Phase 3 and CUSTOM template coverage
  — src/routes/-admin.test.tsx only
```

**Required reports or artifacts after implementation:**
- `reports/codex-review.json` populated by the pipeline watcher after PR creation (standard pipeline output — no extra action required by the implementation agent).
- Human reviewer must compare `SOAK_TEMPLATES['PHASE_3_STABILITY_72H'].checkpointLabels` in the committed code against `PHASE3_SOAK_WINDOW_TASKS.md` checkpoint names before approving the PR.

**State transition:**

```
READY_FOR_IMPLEMENTATION
editing_locked=false
```
