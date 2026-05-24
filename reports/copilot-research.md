# SMC SuperFIB - Soak Type & Purpose Implementation Research

**Date:** 2026-05-23  
**Issue:** Verify and improve the implementation of soakType and soakPurpose to baseline forms and report generation to support multiple soak templates. Ensure correct data is collected per soak type and improve UI for ease of use and clarity

---

## 1. Issue classification

- **Severity:** MEDIUM
- **Category:** data-contract, wiring, migration-governance
- **Layer(s) affected:** Dashboard-JS (admin.tsx), REST-API (soak-evidence endpoint), PHP-backend (soak_evidence table)
- **Phase impact:** Phase 3, Cross-phase (affects all future soaks)

---

## 2. Confirmed evidence

### 2.1 Frontend Type Definitions
- **File:** src/types/sniper.ts
  - `SoakType = "PHASE_0_RESTART_72H" | "PHASE_3_STABILITY_72H" | "CUSTOM"`
  - `SOAK_TEMPLATES` constant defines template configs with labels, descriptions, durations, and checkpoint labels
  - Phase 0: 72h with 4 checkpoints (T+12h, T+24h, T+48h, T+72h)
  - Phase 3: 72h with 3 checkpoints (T+24h, T+48h, T+72h)
  - CUSTOM: operator-defined duration/count with derived evenly-spaced labels

### 2.2 Frontend Form Collection
- **File:** src/routes/admin.tsx
  - `BaselineForm` interface includes `soakType` and `soakPurpose` fields
  - `soakPurpose` field rendered as "Soak objective" input in baseline form
  - Template selector allows switching between PHASE_0_RESTART_72H, PHASE_3_STABILITY_72H, and CUSTOM
  - Form defaults properly hydrate from saved evidence via `hydrateBaselineForm()`

### 2.3 Evidence Persistence
- **File:** src/routes/admin.tsx
  - `buildBaselineEvidenceEntries()` creates evidence payloads with evidence_type = "baseline_metadata"
  - Evidence keys: "baseline.soak_type", "baseline.soak_purpose", plus 12 other baseline fields
  - All values persisted to WordPress via `upsertSoakEvidence()` API call
  - Backend endpoint: `/sniper/v1/admin/soak-evidence` (REST POST)

### 2.4 Backend Schema
- **File:** wordpress/smc-superfib-sniper/smc-superfib-sniper.php
  - `smc_sf_soak_evidence` table schema: id, evidence_key (UNIQUE), evidence_type, evidence_value, operator, created_at, updated_at
  - **No dedicated `soak_template` field exists** in soak_checkpoint or soak_report responses
  - All template metadata is stored as evidence key/value pairs only

### 2.5 Report Generation & Export
- **File:** src/routes/admin.tsx
  - `buildSoakReportMarkdown()` reads `soakPurpose` from evidence: `evidenceMap["baseline.soak_purpose"]`
  - Report title uses `template.label` parameter (e.g., "Phase 3 - Stability Soak")
  - Checkpoint labels derived from `deriveCheckpointLabels()` which respects template or custom input
  - **Report title is correctly parameterized**, but exported markdown filename uses soakType slug

### 2.6 Template Inference from Stored Report
- **File:** src/routes/admin.tsx
  - `inferSoakTypeFromReport()` reconstructs soakType from evidence
  - Searches three keys in order: "baseline.soak_type", "soak.type", "soak_type"
  - Returns null if value is not PHASE_0_RESTART_72H or PHASE_3_STABILITY_72H (allows CUSTOM to remain undetected)
  - Used to auto-select template when loading an existing soak report

### 2.7 Form State Management
- **File:** src/routes/admin.tsx
  - Form state includes soakType, durationHours, checkpointCount
  - `handleSoakTypeChange()` clears unsaved checkpoint notes and resets form defaults when template switches
  - `soakTypeInitializedFromReport` and `soakTypeManuallyChanged` refs prevent overwriting user selection
  - `createBaselineFormDefaults()` initializes all baseline fields including soakType

### 2.8 UI Clarity & Defaults
- **File:** src/routes/admin.tsx
  - Page defaults to Phase 3: `setSoakType("PHASE_3_STABILITY_72H")`
  - When user switches templates, unsaved checkpoint form state clears, but saved soak history persists (confirmed via PR #155 bug sweep)
  - Form validation passes (TypeScript and vitest both pass on admin.tsx)

---

## 3. Root cause hypothesis

### 3.1 Primary Design (Confirmed)
- **Issue:** soakType is persisted as evidence (key/value) instead of a first-class schema field
- **Why:** Backend soak_report schema has no dedicated template column, so the early implementation chose evidence table as the storage layer
- **Evidence:** smc-superfib-sniper.php shows no soak_template column; all baseline metadata goes through evidence API

### 3.2 Export Format Gap (Confirmed)
- **Issue:** Report markdown exports still use hardcoded or template.label title, but no soakType indication in export filename/title parity
- **Why:** The export function was parameterized to accept template.label but the full end-to-end export flow (filename, report heading, checkpoint labels) was not audited for consistency
- **Evidence:** BUG_SWEEP_REPORT_2026-05-22_admin-soak-template-selector.md: "buildSoakReportMarkdown() still emits a static Phase 0 Soak Report title. Export format changes were outside this contract."

### 3.3 soakPurpose Field Presence (Confirmed)
- **Issue:** soakPurpose field exists in form and is collected, but no explicit validation or UI hint explains its purpose
- **Why:** Field was added to capture operator intent, but no clear field label or guidance text explains when/why to fill it
- **Evidence:** Form field label is "Soak objective" (generic), placeholder mentions stability soak, but no clear instruction on what makes a good objective

### 3.4 Checkpoint Label Consistency (Confirmed)
- **Issue:** CUSTOM mode derives checkpoint labels from duration/count, but Phase 3 labels are hardcoded in template
- **Why:** Phase 3 checkpoint naming was not finalized in phase documentation; approved fallback labels are used instead
- **Evidence:** phase-3-dashboard-parity-2026-05-22.md: "PHASE3_SOAK_WINDOW_TASKS.md does not define explicit checkpoint names, so the approved fallback labels were used."

---

## 4. Blast radius

### 4.1 Files Affected
- src/routes/admin.tsx — baseline form, form state, evidence building, report generation, template inference
- src/types/sniper.ts — type definitions for SoakType, SoakTemplateConfig, SOAK_TEMPLATES
- src/lib/api/sniperClient.ts — upsertSoakEvidence, fetchSoakReport calls
- wordpress/smc-superfib-sniper/smc-superfib-sniper.php — soak_evidence table, REST routes
- src/routes/-admin.test.tsx — test suite (15 tests, all passing)

### 4.2 Parity Surfaces at Risk
- **Frontend ↔ Backend:** soakType is UI-local; backend has no dedicated field to return template selection. Workaround is evidence storage.
- **Export consistency:** Exported markdown filename uses soakType, but report heading uses template.label (consistent but not symmetrical).
- **Template persistence:** If Phase 3 baseline is captured and later Phase 0 template is selected, soakType evidence will show Phase 0, not Phase 3 (because evidence is key-unique and gets overwritten).

### 4.3 Data Flow Risk Areas
1. **Evidence persistence:** soakType → "baseline.soak_type" evidence → stored in smc_sf_soak_evidence table (key is UNIQUE, so overwrites on save)
2. **Form hydration:** soakState.report.manual_evidence → hydrateBaselineForm() → soakType populated from evidence
3. **Report generation:** evidenceMap["baseline.soak_purpose"] → soakPurpose in markdown output
4. **Checkpoint labels:** SOAK_TEMPLATES[soakType].checkpointLabels OR derived labels for CUSTOM

### 4.4 Stale-Data & Authority Boundary Risks
- **Authority question:** Does soakType represent the template used at T+0 (baseline), or the operator's current template selection? Evidence: the form hydrates from "baseline.soak_type" (original intent), but handleSoakTypeChange() immediately overwrites it when user switches template UI, so the evidence field gets updated to the new selection (true current state).
- **Consequence:** If an operator switches from Phase 3 to Phase 0 after baseline capture, the stored evidence will change to Phase 0, making the original Phase 3 baseline metadata ambiguous in reports.

---

## 5. Regression surface

### 5.1 Currently Protected Behaviors
- Baseline capture flow: checkpoint creation, evidence save, and report refresh are all covered by test suite (15 passing tests in -admin.test.tsx)
- Form state management: template switching clears unsaved checkpoint notes without removing saved history (verified in bug sweep PR #155)
- Evidence type validation: baseline_metadata type is consistently used in buildBaselineEvidenceEntries() and backend whitelist matches
- Report markdown structure: soakPurpose is read from evidence and included in export if present

### 5.2 Existing Guards
- `baselineCaptureLocked` flag prevents creating a second baseline (evidence checkpoint_type=baseline is unique)
- `soakTypeInitializedFromReport` ref prevents overwriting inferred template unless user explicitly changes it
- Form validation: TypeScript type checking ensures soakType is one of the three enum values
- Test coverage: vitest runs on admin.tsx routes with 15 passing tests

---

## 6. Resolution path options

### Path A: Minimal Correction (Narrowest Surface)
**Goal:** Improve UI clarity and ensure soakType/soakPurpose are correctly collected without schema changes.

**Actions:**
1. Add explicit "Soak type" read-only field in baseline form showing the current template name
2. Improve "Soak objective" field label and placeholder with clearer guidance
3. Add preflight validation to prevent empty soakPurpose if soakType requires it
4. Verify evidence "baseline.soak_type" is always populated before baseline save

**Surface:**
- src/routes/admin.tsx lines ~1000-1100 (form field updates)
- src/routes/admin.tsx lines ~379-410 (baseline submit validation)
- No backend schema changes

**Risks:**
- Does not address the root issue that soakType is UI-local and backend has no persistent template field
- Does not fix export metadata inconsistency (filename vs title parity)

### Path B: Structural Correction (Broader Surface)
**Goal:** Add backend support for soakType as a first-class field to enable future report filtering, analytics, and reliable template reconstruction.

**Actions:**
1. Add `soak_template` column to `smc_sf_soak_checkpoints` table
2. Update `create_soak_checkpoint()` REST handler to accept and store soakType
3. Update `SoakReport` response type to include `soak_template` field
4. Update `createSoakCheckpoint()` frontend call to pass soakType in payload
5. Migrate existing checkpoints to populate soak_template from evidence fallback
6. Update export function to use soak_template from report

**Surface:**
- wordpress/smc-superfib-sniper/smc-superfib-sniper.php — table schema, REST handler
- src/lib/api/sniperClient.ts — createSoakCheckpoint payload and response types
- src/types/sniper.ts — SoakReport, SoakCheckpointRow types
- src/routes/admin.tsx — checkpoint save logic, report generation
- Database migration required (non-backward-compatible schema change)

**Risks:**
- High: schema change requires migration, affects backend contract
- Medium: existing reports will not have soak_template populated until migrated
- Requires coordination with MT5 EA migration timeline

### Recommended: Path A with Path B Roadmap
**Justification:**
- Path A solves the immediate UI/clarity gap and ensures data integrity at current schema level
- Phase 3 is still in motion; full schema correction (Path B) should be planned for Phase 4+ when MT5 report integration is clearer
- Evidence-based storage is acceptable for Phase 3 if accompanied by clear UI indicators and validation
- Test coverage and form logic are already solid; risk is contained to UI/UX and pre-validation

---

## 7. Risk flags

- **High-risk system involved:** Yes. Soak reports are evidence artifacts used for phase gate decisions and root cause analysis.
- **Requires parity re-validation:** Yes. Phase 3 template rendering must be manually verified in browser (pending from audit 2026-05-22).
- **Migration-blocking:** No. Current implementation doesn't block Phase 3 progress, but Phase 4 MT5 integration may require soakType as schema field.
- **Human review required before merge:** Yes. UI/UX improvements should be reviewed by operations team for clarity and field guidance.

---

## 8. Handoff package

### 8.1 Epicentre Files to Inspect First
1. src/routes/admin.tsx — form field rendering and evidence building
2. src/types/sniper.ts — SoakType and SOAK_TEMPLATES definitions
3. wordpress/smc-superfib-sniper/smc-superfib-sniper.php — soak_evidence table schema and REST routes
4. .github/docs/BUG_SWEEP_REPORT_2026-05-22_admin-soak-template-selector.md — prior audit findings

### 8.2 Inputs Codex Must Verify Before Planning
1. **Form field clarity:** Do operators understand what "Soak objective" means? Is "Soak type" visible in the form?
2. **Evidence persistence:** Does "baseline.soak_type" evidence get saved consistently when baseline form is submitted?
3. **Report reconstruction:** When loading an existing soak via inferSoakTypeFromReport(), does the correct template get selected?
4. **Export naming:** Does the markdown export filename correctly reflect the soakType?
5. **Phase 3 manual test:** Browser verification that Phase 3 template renders the correct label, checkpoint count, and default duration.

### 8.3 Open Unknowns That Could Invalidate Hypothesis
1. **Frontend-backend roundtrip:** Has anyone verified that a saved Phase 3 baseline can be re-loaded and the form re-hydrates to "PHASE_3_STABILITY_72H" correctly?
2. **Multi-operator behavior:** If operator A captures Phase 3 baseline and operator B later selects Phase 0 template, does the evidence get overwritten? (Hypothesis: yes, because evidence_key is UNIQUE).
3. **Export field usage:** Does anyone rely on the soakType in the exported markdown filename for filing/archival purposes?
4. **Phase 3 checkpoint naming finality:** Is the Phase 3 checkpoint label set (T+24h, T+48h, T+72h) considered final, or is it still pending confirmation?
- wordpress/smc-superfib-sniper/class-market-data-service.php maps backend freshness CLOSED and DISCONNECTED to state='offline' in store_tick_snapshot().
- wordpress/smc-superfib-sniper/class-market-data-service.php stores freshness and session state as WordPress transients, and get_price_snapshot() reads those values for dashboard consumption.
- .github/migration-status.md documents expected weekend behavior: FX stale during weekend is expected, while crypto fresh is expected. This indicates the current problem is a crypto-specific weekend classification defect.

### 3. Root cause hypothesis
- Most likely root cause: crypto symbols are being classified as weekend-closed by the shared MT5 session manager, causing IsMarketOpenForSymbol() to return false, FreshnessEngine to emit FRESHNESS_CLOSED, and the backend to persist offline state. (Confirmed)
- Why: the MT5 code path applies general weekend closure rules to all non-equity symbols, but the backend treats CLOSED as offline. There is no crypto-specific open-market override in the session logic. (Confirmed)
- Likely trigger: broker weekend hours on Saturday/Sunday, when crypto should either remain tradable or not be represented as market-closed. (Confirmed)

### 4. Blast radius
- Files likely affected:
  - mt5/SessionManager.mqh
  - mt5/MarketDataEngine.mqh
  - mt5/FreshnessEngine.mqh
  - wordpress/smc-superfib-sniper/class-market-data-service.php
  - wordpress/smc-superfib-sniper/smc-superfib-sniper.php
- Systems at risk:
  - MT5 EA freshness/session engine
  - WordPress MT5 market-stream ingest
  - Snapshot/state persistence in backend
  - Dashboard offline/live UI and signal gating
- Parity surfaces:
  - EA -> Backend freshness/state contract
  - Backend snapshot state mapping and dashboard interpretation
  - Weekend/closed state semantics for crypto vs FX
- Risks:
  - false offline state hiding live candles
  - incorrect weekend closure semantics for crypto
  - downstream gating of signals based on stale/offline state

### 5. Regression surface
- What could break if patched incorrectly:
  - FX and equity index weekend closure behavior must remain unchanged.
  - True market-closed instruments must still map to offline when appropriate.
  - Dashboard consumers must continue to distinguish stale vs closed vs offline.
- Existing guards to preserve:
  - explicit CLOSED state from FreshnessEngine
  - backend mapping of CLOSED/DISCONNECTED to offline
  - phase3_mt5_simulation_test.php assertions for CLOSED -> offline
- Existing coverage:
  - .github/migration-status.md weekend behavior notes
  - Phase 1/3 weekend observation tasks and audit artifacts
  - backend session/freshness regression tests

### 6. Resolution path options
- Path A: narrow fix in MT5 session logic to treat known crypto symbols as 24/7 open, so SessionManager.IsMarketOpenForSymbol() returns true for crypto in weekend hours. Preserve existing weekend closure for FX and equity index instruments. (Recommended)
- Path B: broader asset-class schedule abstraction across SessionManager, FreshnessEngine, and backend state mapping to distinguish FX, crypto, equity index, and holiday schedules.
- Recommended: Path A, because the defect appears crypto-specific and the narrow surface minimizes regression risk while preserving other instrument closure rules.

### 7. Risk flags
- High-risk system involved: Yes - freshness/state gating affects live/offline UI and downstream signal engines.
- Requires parity re-validation: Yes - MT5, backend, and dashboard freshness/session semantics.
- Migration-blocking: Yes - crypto weekend status is tracked in Phase 3 readiness and weekend validation.
- Human review required before merge: Yes - asset-class weekend semantics and state mapping require careful examination.

### 8. Handoff package
- Epicentre files to inspect first:
  - mt5/SessionManager.mqh
  - mt5/MarketDataEngine.mqh
  - mt5/FreshnessEngine.mqh
  - wordpress/smc-superfib-sniper/class-market-data-service.php
- Inputs Codex must verify before planning:
  - whether crypto symbols should remain 24/7 open in this broker/MT5 deployment
  - whether any existing symbol-type rules already treat crypto as special-case open
  - whether the dashboard currently derives state from persisted snapshot rows or transient freshness only
- Open unknowns:
  - whether the broker/MT5 platform actually closes crypto during weekend windows and if so how that should be surfaced
  - whether the EA payload contains session/freshness values consistent with the intended crypto workflow
  - whether frontend state mapping intentionally masks CLOSED as offline for any asset class
