### 1. Issue classification
- Severity: MEDIUM
- Category: workflow
- Layer(s) affected: Dashboard-JS / workflow / PHP-backend
- Phase impact: Phase 3 / Cross-phase

### 2. Confirmed evidence
- `src/routes/admin.tsx` currently renders the admin panel as a fixed `Phase 0 Soak Workspace` and hardcodes a 72h checkpoint flow with `T+12h`, `T+24h`, `T+48h`, and `T+72h`.
- `src/routes/admin.tsx` baseline form and checkpoint UI are Phase 0-specific: the baseline section is labeled `Operator Gathered Baseline`, and the timeline text says `Use checkpoint snapshots for T+12h, T+24h, T+48h, and T+72h.`
- `src/routes/admin.soak-report.tsx` simply redirects `/admin/soak-report` into `/admin`, showing the admin route owns the soak workspace.
- `src/types/sniper.ts` defines a generic `SoakReport` and `SoakCheckpointRow`, but the current admin UI assumes a Phase 0 soak template rather than rendering soak metadata dynamically.
- `.github/migration/PHASE3_SOAK_WINDOW_TASKS.md` documents the active Phase 3 soak window (2026-05-22 → 2026-05-25) and explicitly requires a Phase 3 T0 baseline capture in the admin soak workspace.
- `.github/migration/PHASE0_SOAK_TRACKER.md` and `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md` confirm the existing soak workspace design is tied to a Phase 0 72h restart soak and Phase 0-specific reporting.

### 3. Root cause hypothesis
- Confirmed: the admin soak workspace UI is hardwired to Phase 0 soak language and fixed checkpoint sequence instead of supporting later soak types.
- Hypothesis: Phase 3 soak governance needs a generic soak template that allows operators to choose soak type, duration, and checkpoint count, but the current UI still presents Phase 0 conservatively.
- Hypothesis: the backend `SoakReport` contract may already be generic enough, but the present dashboard render layer is the main source of the stale Phase 0 semantics.
- Hypothesis: if left unchanged, operators capturing Phase 3 evidence will likely record baseline and checkpoints using the wrong template, reducing confidence in Phase 3 gate evidence.

### 4. Blast radius
- Primary files: `src/routes/admin.tsx`, `src/routes/admin.soak-report.tsx`, `src/types/sniper.ts`, `src/routes/-admin.test.tsx`.
- Secondary surfaces: `src/lib/api/sniperClient.ts` / soak API call implementations, admin route authentication path, markdown export and print report generation.
- Systems affected: Dashboard admin route, WordPress backend soak-report/checkpoint endpoints, migration governance docs, Phase 3 soak operator workflow.
- Parity surfaces at risk: the dashboard admin workspace vs backend soak report, Phase 0 soak report template vs Phase 3 soak baseline capture, print/export documentation.
- Stale-state risk: the fixed baseline/checkpoint timeline may mislabel Phase 3 timing and cause operators to treat a Phase 3 soak as if it were Phase 0.

### 5. Regression surface
- Existing baseline semantics must remain: baseline is captured once and later checkpoints are saved separately.
- The admin route must preserve `fetchSoakReport()` load/refresh behavior, auth redirect, and error handling.
- Do not weaken `createSoakCheckpoint` or `upsertSoakEvidence` contract assumptions until backend support is verified.
- Existing admin soak tests cover load failure, refresh recovery, and checkpoint history; those should remain valid after UI adaptation.
- Avoid changing the underlying `SoakReport` schema unnecessarily if the desired outcome can be achieved by parameterizing the admin UI.

### 6. Resolution path options
- Path A: adapt the admin UI to support dynamic soak templates while keeping the existing generic `SoakReport` contract. Add user controls for soak type, duration, and checkpoint count, then render template-specific checkpoint labels and instructions.
- Path B: extend the backend/SoakReport schema to include explicit soak metadata (`soak_type`, `soak_duration_hours`, `checkpoint_schedule`, `checkpoint_labels`) and make the admin UI schema-driven. This is broader and more invasive.
- Recommended: Path A. It minimizes backend contract changes, preserves the existing soak-report API shape, and addresses the issue by making the admin soak workspace adaptable to Phase 3 and future soak types.

### 7. Risk flags
- High-risk system involved: No — the issue is primarily admin workflow/UI, not execution logic.
- Requires parity re-validation: Yes — Phase 3 soak baseline capture must still align with backend soak report state and admin evidence records.
- Migration-blocking: Yes — Phase 3 stability soak governance depends on the admin soak workspace and baseline capture.
- Human review required before merge: Yes — soak template changes impact operator workflow and evidence collection for migration gates.

### 8. Handoff package
- Epicentre files to inspect first: `src/routes/admin.tsx`, `src/routes/admin.soak-report.tsx`, `src/types/sniper.ts`, `src/routes/-admin.test.tsx`, `.github/migration/PHASE3_SOAK_WINDOW_TASKS.md`.
- Inputs Codex must verify before planning: current Phase 3 soak requirements, whether backend API supports dynamic soak template metadata, and whether existing checkpoint arrays can be reused for non-Phase-0 soak schedules.
- Open unknowns: whether soak type selection requires new backend fields, whether Phase 3 should use a distinct report header instead of Phase 0 copy, and whether the existing `SoakEvidenceType` union is sufficient for Phase 3 evidence categories.
