# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

**Confirmed**
- The main status grid in `src/routes/admin.tsx` renders baseline/checkpoint state using generic `HealthCard` components with only text values ("captured"/"pending") and colour tones — no icons, no badges. The research report provides direct source observation.
- Age information is displayed inside card detail text, not in section headers or badge form. Confirmed by inspection of the 6-column `HealthCard` grid.
- Lucide React icon imports (CheckCircle2, AlertTriangle, Flag, Lock, ShieldCheck, ClipboardList) are already present in the file and are unused in the main grid — confirmed available for use without adding a dependency.
- `CheckpointCard` already implements the pattern to replicate (coloured borders, badges, lock icons). This is the reference, not a target for change.

**Likely**
- Print/export CSS may not preserve evidence section hierarchy. The research report identifies `soak-report-print-*` classes and media queries as the mechanism but does not confirm that the rendered evidence sections survive print with correct structure. Treat as likely until visually verified.
- Error handling on the `/admin/soak-report` route emits a generic `panelError` banner with retry — likely insufficient for operator diagnosis of *which* sub-system failed during soak report load. Not confirmed with exact message text.

**Unconfirmed**
- Whether the AuthError redirect behaviour is affected by any proposed change. Research report flags it as a guard rail, not a broken path. No change is proposed to it.
- Specific operator-facing error message strings required. Exact copy must be supplied by the implementation agent after reading the current error branch in `admin.tsx`.

---

## 2. Implementation contract

### File 1 — `src/routes/admin.tsx`

**Section to modify:** Main 6-column `HealthCard` status grid (baseline and checkpoint rows)

**Exact change required:**
- Add a Lucide icon beside the status label for each card that represents a baseline entry (use `ShieldCheck` or `Flag`) and each card that represents a checkpoint entry (use `ClipboardList` or `CheckCircle2`).
- Add a small inline badge (e.g. a `<span>` styled with the same colour token already used for green/yellow tones) that reads "BASELINE" or "CHECKPOINT" to replace or augment the bare text value.
- Promote age from the card detail text into the card header line or sub-header — a single formatted string such as `"Captured 4h ago"` rendered in muted text directly beneath the card title, not buried in a secondary detail block.

**Guard rails:**
- Do not modify `CheckpointCard` component itself.
- Do not alter the 6-column grid layout, column count, or grid CSS class names.
- Do not change any API call, selector, hook, or data-fetching path.
- Do not change the colour token values — only apply existing tokens to the new badge/icon elements.
- Do not touch the `AuthError` redirect branch.

**Why in scope:** This is the epicentre file. All four reported symptoms (icon absence, buried age, print gaps, weak error messages) are rendered here.

**Acceptance criterion:** On the `/admin` route, a user can distinguish a baseline card from a checkpoint card at a glance without reading the detail text; age is visible in the card header without expanding or scrolling.

---

**Section to modify:** Print/export CSS block (`soak-report-print-*` classes, `@media print` rules)

**Exact change required:**
- Audit existing `@media print` rules. For any evidence section container (baseline capture block, checkpoint block, soak summary block) that currently lacks an explicit `display: block !important` or equivalent rule, add one so it is not collapsed by browser print rendering.
- Ensure section headings within evidence blocks carry `page-break-inside: avoid` so headings do not orphan from their content across pages.
- Do not add new class names. Apply rules to the `soak-report-print-*` classes already in use.

**Guard rails:**
- Do not remove or override any existing `display: none` rules for interactive elements (buttons, nav, tooltips) — those hide-on-print rules are intentional.
- Do not change any inline styles applied by JS logic.

**Why in scope:** Print formatting is declared in `admin.tsx` (co-located CSS or a stylesheet imported there). This is a CSS-only change; no logic changes.

**Acceptance criterion:** Browser print preview of `/admin/soak-report` shows all evidence sections (baseline, checkpoint, soak summary) with visible headings and content; no section collapses to zero height.

---

**Section to modify:** Soak report error handling branch (`panelError` path for the `/admin/soak-report` route)

**Exact change required:**
- Replace or augment the generic error banner message with a structured operator-facing string that includes: (a) which data source failed (soak report, baseline, or checkpoint), (b) the HTTP status or error code if available, and (c) a next-action directive such as "Contact backend on-call if this persists."
- The retry button must remain; do not remove it.
- If the error object contains a status code, surface it in the message. If not, emit a fallback message. Do not assume error shape — guard with a null-check or optional chain.

**Guard rails:**
- Do not change `AuthError` handling or the redirect path.
- Do not add a new error boundary component — modify the existing `panelError` render path only.
- Do not change error logging or telemetry calls if present.

**Why in scope:** Operator visibility during soak phase is a Phase 0 stability concern. The research report confirms the current message is insufficiently specific.

**Acceptance criterion:** When the soak report API call fails, the error banner shows a message that identifies the failure source and a next-action directive. The retry button remains functional.

---

## 3. Patch sequence

1. **Read `src/routes/admin.tsx` in full** before writing any change. Confirm exact location of the status grid, print CSS block, and error handling branch. Do not patch from memory.
2. **Apply icon and badge changes to the status grid** (lowest risk, no logic change). Verify icons resolve from the existing import without adding a new import.
3. **Promote age into card headers** — depends on step 2 being applied first so the card header markup is in its final form before the age field is repositioned.
4. **Apply print CSS additions** — independent of steps 2–3; can be applied in the same commit or sequentially. No logic dependency.
5. **Apply error message hardening** — independent of steps 2–4. Apply last so the logic branch is touched only once.

**Sequencing risks:**
- Steps 2 and 3 touch the same JSX block. Apply them in a single contiguous edit to avoid conflicting diffs.
- Print CSS changes must not accidentally affect screen-mode layout. Verify all new rules are scoped to `@media print`.
- Error branch change must null-check the error object before accessing `.status` or `.message` — runtime shape is unconfirmed.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**
- Run `npm run build` (or project equivalent). Zero TypeScript errors. Zero new lint warnings on modified lines.
- Run `npm run test` (or project equivalent). All existing tests pass.
- Manually load `/admin` in a browser. Confirm the 6-column grid renders without layout shift.
- Manually load `/admin/soak-report` in a browser. Confirm the page loads and age appears in card headers.
- Open browser print preview for `/admin/soak-report`. Confirm evidence sections are visible and not collapsed.
- Trigger a forced error state (e.g. block the soak report API call in devtools). Confirm the error banner shows structured message and retry button.

**Existing protections that must still hold:**
- `AuthError` redirect behaviour is unmodified.
- `CheckpointCard` component renders without change.
- Interactive elements (buttons, nav) remain hidden in print preview.
- No API call, selector, data-contract field, or hook is modified.

**Parity re-validation:** Not required. This patch is Dashboard-JS display only. No Pine, MT5, or backend contract is touched.

**Logging/diagnostics after patch:** The structured error message in the `panelError` branch is itself the diagnostic artifact. No additional logging instrumentation is required.

---

## 5. Non-goals

**Out of scope:**
- Changes to `CheckpointCard` component.
- Changes to any API endpoint, data contract, or backend service.
- Changes to Pine trading formulas or MT5 integration.
- Adding a new error boundary component or new shared component.
- Refactoring the `HealthCard` component for general reuse.
- Changes to routing, authentication, or the `AuthError` redirect.
- Adding new Lucide icon imports — only use already-imported icons.
- Changing colour token values or the design system.
- Any Phase 1 or later work.

**Attractive but unsafe follow-ons to avoid in this patch:**
- Promoting age display logic into `HealthCard` itself — that would widen the blast radius to every consumer of that component.
- Replacing the entire status grid with `CheckpointCard` instances — scope creep, risk of layout regression.
- Adding telemetry or error-reporting calls to the error branch — unrelated instrumentation change, separate PR required.
- Restructuring the print stylesheet into a separate file — cosmetic refactor, not a fix, touches more than required.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
- A malformed JSX edit in the status grid causes a React render error, crashing the `/admin` route entirely. Operators lose access to the admin dashboard.

**User-visible failure mode:**
- Grid layout breaks or cards overlap due to unexpected width change from added badge/icon elements.
- Print preview produces blank evidence sections if `@media print` rule selector is mis-typed.
- Error banner displays `[object Object]` or undefined if the error shape null-check is omitted.

**Backend authority / stale-state risks:** None. This patch touches only display logic. No data-fetching path, cache invalidation, or backend contract is modified.

**Human approval required before merge:** No, per research report risk classification (high-risk system: No, human review required: No). Standard automated CI + one manual smoke-check of the three acceptance criteria above is sufficient.

---

## 7. Test requirements

**Tests to add or update:**

| Target | What to test |
|---|---|
| Status grid render | Snapshot or shallow render test confirming that baseline cards render with a `ShieldCheck`/`Flag` icon element and a "BASELINE" badge; checkpoint cards render with the corresponding icon and "CHECKPOINT" badge |
| Age display | Unit test or snapshot confirming age string appears in card header markup, not only in detail text |
| Error branch | Unit test simulating a failed soak report fetch; assert that the rendered error banner contains a string matching the failure-source pattern and that the retry button is present |
| Print CSS | No automated test is practical. Manual browser print preview check is the required verification (see regression guards). |

**Existing tests that must still pass:**
- All existing `admin.tsx` render tests.
- All existing `CheckpointCard` tests.
- Any end-to-end or integration test that navigates to `/admin` or `/admin/soak-report`.

**Soak/replay/parity verification:** Not required for this patch.

---

## 8. Implementation handoff

**Branch naming recommendation:**
```
fix/admin-ui-polish-baseline-checkpoint-display
```

**Suggested commit grouping:**
- Commit 1: `fix(admin): add icons and badges to baseline/checkpoint status grid`
- Commit 2: `fix(admin): promote age to card header in status grid`
- Commit 3: `fix(admin): harden print CSS to preserve evidence sections`
- Commit 4: `fix(admin): add structured operator-facing error messages on soak-report route`

Commits 1 and 2 may be combined if the JSX edits are contiguous. Commits 3 and 4 are independent and may land in any order relative to each other.

**Required artifacts after implementation:**
- Updated snapshot files if snapshot tests exist for `admin.tsx`.
- Screenshot of `/admin` status grid (screen view) attached to PR description.
- Screenshot of browser print preview for `/admin/soak-report` attached to PR description.
- Screenshot of error banner with forced failure state attached to PR description.

**State transition:**

```
READY_FOR_IMPLEMENTATION
editing_locked=false
```
