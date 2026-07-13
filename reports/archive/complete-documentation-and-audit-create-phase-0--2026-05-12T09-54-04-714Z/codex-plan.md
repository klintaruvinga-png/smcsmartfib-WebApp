# SMC SuperFIB Phase 0 Documentation & Audit - Implementation Plan

**Date**: 2026-05-12  
**Based on**: reports/copilot-research.md  
**Target Issue**: Complete documentation and audit: create Phase 0 soak summary, capture admin-health baseline, cross-check against tracker

---

## 1. Issue Validation

### Root Cause Assessment
**Confirmed**: Operational soak infrastructure is fully functional (database tables, baseline capture system, admin health API all working) but the documentation consolidation pipeline has not been automated. Soak data is being collected on schedule (T+0 baseline exists, T+24h checkpoint completed) but no formal markdown artifacts have been written to git.

### Evidence Strength
- **Confirmed**: Baseline row exists in `wp_smc_sf_soak_checkpoints` at 2026-05-11 10:15:17
- **Confirmed**: T+24h checkpoint completed with "no anomalies" recorded
- **Confirmed**: 29 parity audit files exist in `.github/migration/audits/`
- **Confirmed**: PHASE0_SOAK_TRACKER.md exists and provides monitoring template
- **Confirmed**: `.github/migration-status.md` explicitly notes "Phase 0 completion log and final parity audit are not yet written"
- **Unconfirmed**: Status of T+36h and T+48h checkpoints (not yet captured in provided evidence)
- **Unconfirmed**: Whether any anomalies have occurred during T+24h to current window

### Root Cause Corrected
No correction needed. The research report accurately identified the blocker: working soak system producing data, but no formal handoff documentation.

---

## 2. Implementation Contract

### File: `.github/migration/phase-updates/phase-0-soak-summary-2026-05-11.md`
- **Status**: NEW (does not exist)
- **Purpose**: Consolidate baseline + all soak checkpoints into a single narrative summary
- **Content to add**:
  - Title and metadata (issue, soak window dates, operator)
  - Executive summary (3–5 lines on soak status: pass/no-anomalies or issues found)
  - Baseline snapshot section (T+0 data from database export)
  - Checkpoint progression table (T+0 through T+72h with all recorded values)
  - Cross-reference against PHASE0_SOAK_TRACKER.md expectations (match/mismatch notes)
  - Anomalies or deviations noted (if any found during 72h window)
  - Soak sign-off section (operator name, completion date, pass/fail recommendation)
- **Guard rails**:
  - Do not modify or delete baseline row from database
  - Do not alter soak checkpoint data
  - Summary is read-only narrative; data source is backend only
  - If any gaps in checkpoint data, note as "Incomplete data for this checkpoint" rather than inventing values
- **Why in scope**: Phase 0 blocker explicitly calls for "Phase 0 completion log and final parity audit are not yet written"
- **Acceptance**: File exists, contains all 6 checkpoints (T+0, T+6h, T+12h, T+24h, T+36h, T+48h, T+60h, T+72h), matches database evidence, and is readable as formal artifact

### File: `.github/migration/audits/phase-0-final-soak-summary-2026-05-12.md`
- **Status**: NEW (does not exist)
- **Purpose**: Formal Phase 0 closeout audit consolidating soak evidence + 29 existing parity audits
- **Content to add**:
  - Issue: Same as soak-summary
  - Soak completion status (PASS / FAIL with reasoning)
  - Summary of 72h window (no critical blockers vs. issues found requiring mitigation)
  - Consolidated parity coverage (reference all 29 existing audit files; note any gaps)
  - Admin health baseline capture (health response snapshot at T+0 and T+72h)
  - Key success criteria assessment:
    - Price feed stable 72h+ ✓/✗
    - Signal engine consistent ✓/✗
    - No false LIVE states ✓/✗
    - No stale-loop deadlocks ✓/✗
    - No rate-limit false positives for EA symbols ✓/✗
    - No stale snapshot reuse on watchlist changes ✓/✗
  - Recommendation: Phase 0 PASS or FAIL for Phase 1 gate approval
  - Sign-off: Operator, date, migration stakeholder (Track B owner)
- **Guard rails**:
  - Do not invent findings; mark as "Incomplete data" if evidence gaps exist
  - Do not recommend Phase 1 START unless all success criteria are ✓
  - Keep admin health capture as read-only backend snapshot; do not include frontend health state
  - Reference but do not rewrite the 29 existing parity audits
- **Why in scope**: Phase 0 blocker requires "final parity audit" to be written before Phase 1 gate can open
- **Acceptance**: File exists, references all 29 parity audits, contains formal soak pass/fail, includes admin health baseline capture, and has migration stakeholder sign-off

### File: `.github/migration-status.md` (Lines 40–82)
- **Status**: UPDATE (blocker section at line 82)
- **Change required**:
  - Current line 82: `- Phase 0 completion log and final parity audit are not yet written to ...`
  - Replace with: `- ✓ Phase 0 completion log and final parity audit written to .github/migration/phase-updates/ and .github/migration/audits/. Phase 0 soak complete with status: [PASS|FAIL based on audit]`
  - Update Phase 0 status from `IN-PROGRESS` (line 8) to `COMPLETE` if audit shows PASS
  - Update Phase 0 % Complete (line 16) from `35%` to `100%` if audit shows PASS
- **Guard rails**:
  - Do not change Phase 1 blocker ("Phase 0 complete") until Phase 0 audit actually shows PASS
  - Do not modify any Phase 1+ sections unless Phase 0 gate is fully cleared
  - Keep the 10-phase table structure intact
- **Why in scope**: Blocker tracker must be updated to unblock Phase 1 teams and provide visibility
- **Acceptance**: Blocker line is replaced, Phase 0 status shows COMPLETE with date, Migration status board accurately reflects Phase 0 soak outcome

### File: `.github/migration/PHASE0_SOAK_TRACKER.md` (Lines 469+)
- **Status**: REFERENCE ONLY (no changes)
- **Purpose**: This file defines the completion log template; it is not modified
- **Why**: The tracker is a working guide. The summary files (above) are the formal artifacts that close Phase 0

---

## 3. Patch Sequence

1. **T+72h (2026-05-14 08:57 SAST)**: Soak completes, final checkpoint captured
2. **Export soak data from backend**:
   - Query `wp_smc_sf_soak_checkpoints` for baseline + all 6 checkpoints
   - Query `wp_smc_sf_soak_evidence` for any recorded anomalies
   - Export admin health snapshot from `/admin/health` endpoint
3. **Create `.github/migration/phase-updates/phase-0-soak-summary-2026-05-11.md`**:
   - Consolidate exported data into narrative + table format
   - Cross-check each checkpoint against PHASE0_SOAK_TRACKER.md expectations
   - Note any deviations or gaps
4. **Create `.github/migration/audits/phase-0-final-soak-summary-2026-05-12.md`**:
   - Assess 72h soak against success criteria (✓/✗ for each)
   - Reference all 29 existing parity audits
   - Include admin health baseline snapshots
   - Write formal recommendation: Phase 0 PASS or FAIL
5. **Update `.github/migration-status.md`**:
   - Replace blocker line at line 82
   - Update Phase 0 status and % Complete
   - Add date of completion

**Dependencies**: All steps depend on T+72h soak completion. No step can begin until soak data is exported from the backend.

**Sequencing risks**:
- If T+72h data is incomplete or corrupted, the summary cannot be finalized and Phase 0 audit must note this as a blocker for Phase 1
- If parity audits (29 files) show unresolved gaps, the final audit must flag these as Known Issues with mitigation plans

---

## 4. Regression Guards

### Protections That Must Hold
1. **Baseline row immutability**: The T+0 baseline checkpoint must remain unchanged for the entire 72h soak. No update, delete, or reset operations on `wp_smc_sf_soak_checkpoints` baseline row.
2. **Admin health read-only**: The `/admin/health` endpoint must continue to proxy the same payload as `/health`. No frontend-driven health modifications.
3. **Soak evidence append-only**: The `wp_smc_sf_soak_evidence` table must only receive INSERT operations during the soak. No UPDATE or DELETE of recorded evidence.
4. **Parity audits unchanged**: The 29 existing parity files in `.github/migration/audits/` must not be modified or deleted during this patch.

### Verification Steps
1. After `.github/migration/phase-updates/phase-0-soak-summary-2026-05-11.md` is written, verify that:
   - All checkpoint timestamps match database records
   - No checkpoint values are fabricated
   - Each checkpoint is cross-checked against PHASE0_SOAK_TRACKER.md expected values
2. After `.github/migration/audits/phase-0-final-soak-summary-2026-05-12.md` is written, verify that:
   - All 29 parity audits are still present and unmodified
   - Admin health baseline captures are accurate (fetched from actual backend, not invented)
   - Success criteria assessment is grounded in soak evidence, not speculation
3. After `.github/migration-status.md` is updated:
   - Blocker line reflects the actual soak outcome (PASS/FAIL)
   - Phase 0 status and % Complete are consistent
   - Phase 1 blocker ("Phase 0 complete") remains in place until audit shows PASS

### Parity Re-Validations
- **Pine ↔ Backend parity**: Not re-validated in this patch (covered by 29 existing audits)
- **Admin health payload**: Snapshot captured at T+0 and T+72h; must show consistent schema and backend authority
- **Soak infrastructure**: Not re-validated (system is already operational)

---

## 5. Non-Goals

### Out of Scope
- Do not implement Phase 1 work (MT5 bridge infrastructure)
- Do not add new soak tables or schema changes
- Do not refactor the admin soak UI
- Do not patch soak infrastructure bugs during this documentation cycle (if bugs are found, log them in the audit as Known Issues and defer to Phase 0 maintenance work)
- Do not change the 29 existing parity audits

### Attractive but Unsafe Follow-On Changes (Avoid)
- "Let's add automated soak summary generation to the pipeline" — Out of scope; defer to Phase 0 operational improvements
- "Let's consolidate all 29 parity audits into one mega-audit" — Risk of introducing merge conflicts; keep as separate files
- "Let's update the Pine script baseline parity" — Out of scope; Phase 0 is MT5 authority stabilization only

---

## 6. Risk Assessment

### Worst-Case Failure Modes
1. **Soak data incomplete or corrupted**: If T+36h or T+48h or T+72h checkpoint is missing or has garbage values, the summary cannot be finalized. Mitigation: Note in audit as "Incomplete soak evidence for checkpoint T+X" and defer Phase 1 START until a fresh 72h soak completes.
2. **Admin health snapshot is inconsistent between T+0 and T+72h**: If health schema changed (e.g., new fields added), the baseline capture will not match the final snapshot. Mitigation: Document the schema drift in the audit as a Known Issue.
3. **Parity audit gaps discovered during consolidation**: If the 29 existing audits do not cover all critical Phase 0 systems, the final audit must flag this. Mitigation: Recommend Phase 0 remains INCOMPLETE until gaps are covered.

### User-Visible Failure Modes
- Phase 1 teams cannot determine whether Phase 0 is ready without formal artifacts. This patch ensures clarity.
- No user-visible runtime failures; this is documentation only.

### Backend Authority & Stale-State Risks
- **None**: Documentation patch does not change code paths, signal logic, or data authority
- Admin health baseline capture is read-only; no frontend modifications

### Human Review Required Before Merge
**Yes** — The final audit must be reviewed and signed off by the migration stakeholder (Track B owner, currently TBD) before Phase 0 can be marked complete and Phase 1 can begin.

---

## 7. Test Requirements

### Tests to Add or Ensure
- **Manual verification**: After soak summary is written, an operator should manually spot-check 3–5 checkpoint rows against the actual database to confirm data accuracy
- **Parity audit cross-reference**: Verify all 29 audit files are still present and unmodified (script: `ls -l .github/migration/audits/ | wc -l` should show 29)
- **Health payload schema**: Compare T+0 and T+72h admin health snapshots to ensure schema consistency

### Existing Tests That Must Still Pass
- `test-mt5-snapshot-contract.php` — Verifies `/admin/health` route and parity (must still pass)
- `test-get-soak-report.php` — Mocks soak_checkpoints and soak_evidence queries (must still pass)
- Any Phase 0 integration tests in the repo (must still pass)

### Soak & Parity Verification
- The 72h soak must complete with no critical anomalies recorded in `wp_smc_sf_soak_evidence`
- Admin health payload from T+0 must match the operational baseline established on 2026-05-11
- All 29 parity audits must still be valid (no code changes that would invalidate them)

---

## 8. Implementation Handoff

### Branch Naming Recommendation
`feature/phase-0-soak-documentation-2026-05-12`

### Suggested Commit Grouping
1. **Commit 1**: `docs(phase-0): add soak summary for 72h window`
   - File: `.github/migration/phase-updates/phase-0-soak-summary-2026-05-11.md`
   - Message: "docs(phase-0): consolidate 72h soak data into formal summary artifact"

2. **Commit 2**: `docs(phase-0): add final soak audit and Phase 0 closeout`
   - File: `.github/migration/audits/phase-0-final-soak-summary-2026-05-12.md`
   - Message: "docs(phase-0): write final soak audit, consolidate parity evidence, and sign off Phase 0 completion"

3. **Commit 3**: `docs(migration-status): mark Phase 0 complete`
   - File: `.github/migration-status.md`
   - Message: "docs(migration-status): mark Phase 0 complete, unblock Phase 1"

### Required Reports/Artifacts After Implementation
- `reports/codex-plan.meta.json` — Metadata about this plan execution (created by Codex)
- Branch pushed to GitHub with PR number
- PR must include link to final audit for stakeholder review

### State Transition Required
After all three commits are merged:
- `.smc-workflow-state.json` state: `IMPLEMENTATION_COMPLETE`
- `.smc-workflow-state.json` editing_locked: `false`
- Pipeline watcher will poll GitHub for PR merge on `feature/phase-0-soak-documentation-*`
- On merge: artifacts will be archived to `reports/archive/` and state reset to `IDLE`

**Note**: This PR must be reviewed and approved by the migration stakeholder (Track B owner) before merge. The merge itself will trigger the state transition to `IDLE` automatically via the pipeline watcher.

