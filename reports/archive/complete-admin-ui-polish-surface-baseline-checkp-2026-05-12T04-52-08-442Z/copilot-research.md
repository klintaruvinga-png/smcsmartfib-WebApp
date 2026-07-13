# Research Report

## 1. Issue classification
- Severity: MEDIUM
- Category: wiring
- Layer(s) affected: Dashboard-JS / PHP-backend / workflow
- Phase impact: Phase 0

## 2. Confirmed evidence
- `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md` includes exact backlog items for:
  - `Surface baseline and checkpoint age more prominently`
  - `Improve print/export formatting for the soak report`
  - `Harden admin.tsx error handling around /admin/soak-report`
- `src/routes/admin.tsx` loads `/admin/soak-report` via `fetchSoakReport()` inside a `useEffect`, and uses `soakAge = formatSoakAge(baselineCheckpoint?.created_at ?? null)` as the only explicit age indicator.
- `src/routes/admin.tsx` renders a `HealthCard` labeled `Soak age` but does not appear to separately render a distinct baseline age vs checkpoint age summary elsewhere in the top-level admin health UI.
- `src/routes/admin.tsx` contains print styling scoped to `.soak-report-print-section`, including `body * { visibility: hidden; }` and only visible report section rules under `@media print`.
- `src/routes/admin.tsx` has explicit error handling for soak report load failures: it sets `soakState.kind = "error"`, `panelError`, and renders an operator-facing `Soak report failed to load.` panel with a retry button.
- `src/lib/api/sniperClient.ts` defines `fetchSoakReport()` as `call<SoakReport>("/admin/soak-report", { cacheBust: true })`, so backend error payloads are surfaced through the generic API call wrapper.
- `.smc-workflow-state.json` confirms the repository is currently idle from prior Phase 0 admin UX stabilization work and is the correct area for this research issue.

## 3. Root cause hypothesis
- Confirmed: The admin UI currently exposes soak age through a single `Soak age` health card, which means baseline/checkpoint age is likely not surfaced with sufficient prominence or distinction.
- Confirmed: The print/export experience is implemented via `@media print` rules around `.soak-report-print-section`, so any missing structure or hidden details in the print section can lead to poor exported readability.
- Hypothesis: `admin.tsx` error handling is present but may still be too generic for operators; a backend failure or stale report state can be obscured if the logged message is not explicit or if the UI remains in a stale ready state after partial failures.
- Hypothesis: The backend `/admin/soak-report` contract is a critical data contract for the admin soak report, and if the response schema does not expose explicit age fields, the dashboard must infer age from `baseline_checkpoint.created_at` only.

## 4. Blast radius
- `src/routes/admin.tsx`
- `src/lib/api/sniperClient.ts`
- `src/types/sniper.ts`
- `src/routes/admin.soak-report.tsx` and any backend route implementation for `/admin/soak-report`
- `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`
- Systems: Admin dashboard, backend admin soak report endpoint, soak checkpoint persistence, and Phase 0 soak baseline tracking.
- Parity surfaces at risk: Dashboard presentation vs backend soak report data contract, especially around baseline vs checkpoint age semantics.
- Stale-state/caching risk: `fetchSoakReport()` explicitly uses `cacheBust: true`, indicating the admin page expects fresh data and will treat cached or stale responses as incorrect.

## 5. Regression surface
- Existing Phase 0 baseline protection work in the admin UI must not be weakened; PR #142 already added explicit baseline-exists warning/status on `/admin`.
- The current print CSS for `.soak-report-print-section` should remain intact while improving readability; changing the visibility rules risks breaking browser print output.
- The admin health page currently uses the same error display for initial load and refresh retries; any fix must preserve or improve explicit operator-facing status.
- There is test coverage around soak report failures in `src/routes/-admin.test.tsx`, which should be preserved and extended as needed.

## 6. Resolution path options
- Path A: narrow correction surface
  - Enhance admin UI to render explicit baseline age and checkpoint age as separate, prominent fields.
  - Improve print/export style rules so the soak report retains evidence sections and readable formatting when printed/exported.
  - Harden `admin.tsx` error state handling so both initial load and retry failures show a clear, operator-facing error block.
- Path B: broader structural risk area
  - Also tighten the `/admin/soak-report` response schema and `SoakReport` type so baseline/checkpoint age and status are explicit rather than inferred.
  - Add test coverage for print/export layout and explicit backend error payloads.
- Recommended: Path A, because the issue is primarily UI polish and admin hardening in an active Phase 0 soak workflow, and the repository evidence points to UX-level improvements rather than deep signal-engine changes.

## 7. Risk flags
- High-risk system involved: No — this is admin-facing Phase 0 UI/reporting work, not the core signal engine.
- Requires parity re-validation: Yes — Dashboard vs backend `/admin/soak-report` contract.
- Migration-blocking: Yes — Phase 0 soak stability and operator-facing soak reporting are part of the Phase 0 gate.
- Human review required before merge: Yes — operator-facing admin UI and soak report behavior must be reviewed as part of Phase 0 stabilization.

## 8. Handoff package
- Epicentre files to inspect first:
  - `src/routes/admin.tsx`
  - `src/lib/api/sniperClient.ts`
  - `src/types/sniper.ts`
  - `.github/migration/phase-0-next-72h-checklist-2026-05-11.md`
- Inputs Codex must verify before planning:
  - exact `/admin/soak-report` response schema and whether it exposes separate baseline/checkpoint age semantics
  - how `baseline_checkpoint.created_at` is rendered in the admin health page
  - whether print/export formatting currently hides important evidence or summary sections
  - whether `refreshSoakReport()` and initial load both produce explicit operator error feedback
- Open unknowns that could invalidate the hypothesis:
  - backend route implementation details for `/admin/soak-report`
  - whether a separate checkpoint age field already exists in hidden report details
  - whether print/export formatting is currently sufficient for the operator workflow in actual browser print previews
