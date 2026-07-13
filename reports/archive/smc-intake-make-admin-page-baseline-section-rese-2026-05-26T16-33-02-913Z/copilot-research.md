# SMC SuperFIB - Admin Soak Baseline Research

## 1. Issue classification
- Severity: HIGH
- Category: workflow
- Layer(s) affected: Dashboard-JS
- Phase impact: Phase 4

## 2. Confirmed evidence
- src/routes/admin.tsx defines SoakType only as PHASE_0_RESTART_72H | PHASE_3_STABILITY_72H | CUSTOM, so the admin soak picker cannot natively represent a Phase 4 soak type.
- src/types/sniper.ts declares SOAK_TEMPLATES with only Phase 0 and Phase 3 templates and no Phase 4 30-day template.
- src/routes/admin.tsx uses inferSoakTypeFromReport() and hydrateBaselineForm() code paths that only preserve PHASE_0_RESTART_72H and PHASE_3_STABILITY_72H persisted values, effectively dropping unsupported soak type evidence.
- In src/routes/admin.tsx, aselineCaptureLocked is derived from aselineCheckpoint !== null, and when true the UI disables the capture baseline button, making the baseline section single-shot and not resettable for a new soak cycle.
- PHASE4_TESTING_GUIDE.md documents Phase 4 live parity validation with 30-day corpus requirements for EURUSD/USDJPY/XAUUSD, confirming the new soak type should be a Phase 4 30-day soak.

## 3. Root cause hypothesis
- Most likely root cause: The admin soak workspace was implemented with only Phase 0 and Phase 3 soak workflows, so Phase 4-specific soak metadata and reset semantics were never added.
- Why that fits: The codebase contains explicit enum-style soak template support for only PHASE_0_RESTART_72H and PHASE_3_STABILITY_72H, while the Phase 4 docs already require a distinct 30-day live soak.
- What likely triggered the issue: Phase 4 readiness planning surfaced the need for a new soak type and a new baseline lifecycle, but the existing admin route still treats baseline capture as a locked Phase 0/3 workflow.
- Confirmed: SoakType/SOAK_TEMPLATES hardcoding and hydrateBaselineForm/inferSoakTypeFromReport support only Phase 0/3.
- Hypothesis: The baseline section is effectively single-shot because it has no explicit reset flow or template-aware restart handling for a new soak.

## 4. Blast radius
- Primary files: src/routes/admin.tsx, src/types/sniper.ts, src/routes/-admin.test.tsx
- Systems affected:
  - dashboard admin soak workspace UI
  - operator workflow for soak baseline capture and Phase 4 gate readiness
  - soak evidence persistence through etchSoakReport, checkpoint history, and baseline metadata restoration
- Parity surface at risk:
  - Phase 4 live soak gating and fib parity corpus collection
  - operator signoff flow between dashboard evidence capture and migration status docs
- Risk areas:
  - if the new soak type is not represented, admins may capture the wrong soak metadata or be unable to restart soak evidence for Phase 4
  - if baseline reset is not implemented carefully, the soak report may lose or misclassify earlier checkpoint data

## 5. Regression surface
- Existing behavior to preserve:
  - Phase 0 and Phase 3 soak template rendering and descriptions
  - baseline evidence hydration for persisted Phase 0/3 soak types
  - locked baseline capture once a baseline checkpoint exists, unless a new reset flow is explicitly desired
- Existing guards:
  - UI currently disables baseline capture once aselineCheckpoint exists
  - hydrateBaselineForm preserves existing aseline.* evidence keys for metadata continuity
- Tests/audits covering this area:
  - src/routes/-admin.test.tsx already exercises admin health load, soak report errors, baseline/checkpoint rendering, and baseline-lock behavior
  - migration docs and status files already recognize Phase 4 as a new readiness gate that requires live corpus and operator action

## 6. Resolution path options
- Path A: Extend the existing soak workspace with a new PHASE_4_30_DAY soak template in SOAK_TEMPLATES, add it to the SoakType union, and update the baseline form hydration/inference logic so Phase 4 evidence is preserved instead of dropped.
- Path B: Refactor the soak metadata workflow to separate template registration from report hydration and add an explicit baseline reset/restart flow for new soaks, with clear admin UI states for active soak vs. new soak initiation.
- Recommended: Path A. The defect is primarily static soak template hardcoding and unsupported Phase 4 evidence handling, so a focused extension of the existing flow should prepare the admin page for Phase 4 without broad UI redesign.

## 7. Risk flags
- High-risk system involved: Yes. This is an admin/operator gating bug that affects Phase 4 live soak readiness and soak baseline evidence capture.
- Requires parity re-validation: Yes. Phase 4 fib parity and the live 30-day soak gate are directly implicated.
- Migration-blocking: Yes. If the admin page cannot capture or restart a Phase 4 soak baseline, Phase 4 operator readiness and gate closure may stall.
- Human review required before merge: Yes. Soak baseline reset behavior and Phase 4 soak metadata are operationally sensitive and should be verified by an operator or migration lead.

## 8. Handoff package
- Epicentre files to inspect first:
  1. src/routes/admin.tsx
  2. src/types/sniper.ts
  3. src/routes/-admin.test.tsx
- Inputs Codex must verify before planning:
  1. exact new SoakType label/value for Phase 4 (e.g. PHASE_4_30_DAY)
  2. whether the admin baseline form should preserve Phase 4 soak evidence like aseline.soak_type
  3. whether the existing aselineCaptureLocked model should be replaced with an explicit reset/restart control
  4. checkpoint schedule and labels for a 30-day Phase 4 soak
- Open unknowns:
  1. whether backend soak evidence storage already accepts a Phase 4 soak type value
  2. whether a Phase 4 baseline reset should reuse the existing checkpoint history or start a fresh soak timeline
  3. whether any backend or export docs still hardcode Phase 0 soak labels that would need parallel updates
