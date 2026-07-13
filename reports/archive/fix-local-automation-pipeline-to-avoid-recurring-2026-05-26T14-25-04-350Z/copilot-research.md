# SMC SuperFIB - Pipeline Stale Artifacts Blocking Issue Research

**Date:** 2026-05-26  
**Issue:** fix local automation pipeline to avoid recurring error where stale artefacts are blocking the pipeline from continuing tasks, lock this as a known error and create permanent fixes so this does not happen again in future

---

## 1. Issue classification

- **Severity:** HIGH
- **Category:** workflow / pipeline-governance
- **Layer(s) affected:** pipeline-watcher, automation infrastructure
- **Phase impact:** Cross-phase — affects every new `/research-and-plan` cycle

---

## 2. Confirmed evidence

### Direct Evidence

**File:** `reports/copilot-research.md` (2026-05-26)  
**Lines 68–72:** Documents stale artifact blocking from prior cycle:
> "The prior pipeline cycle left stale artifacts: `reports/codex-plan.md` contained a crypto weekend session classification contract (already implemented in PR #228), and `reports/copilot-research.md` contained soakType research with appended crypto session data (from the 2026-05-23 cycle). Neither file was refreshed when the "Fix EA compile errors" task was queued."

**File:** `reports/codex-plan.md` (2026-05-26)  
**Lines 17–18:** Codex stop reason — contract conflict due to stale prior-cycle plan:
> "The prior pipeline cycle left stale artifacts: `reports/codex-plan.md` contained a crypto weekend session classification contract (already implemented in PR #228)... Codex correctly stopped on the contract conflict."

**File:** `reports/automation-update-log.md` (Template section)  
**Lines ~240–280:** Documents the exact pattern: stale artifacts not refreshed between cycles is a **repetitive failure**, not a one-off.

### Mechanism Evidence

**File:** `scripts/pipeline-watcher.js`  
- **Line ~347:** `archiveCycleArtifacts(issueSlug)` function exists and moves completed artifacts to `reports/archive/<slug>-<ts>/`
- **Lines ~353–358:** Lists artifact files to archive:
  - `RESEARCH_FILE` (`reports/copilot-research.md`)
  - `PLAN_FILE` (`reports/codex-plan.md`)  
  - `IMPLEMENTATION_FILE`, `IMPLEMENTATION_METADATA_FILE`, etc.
- **Observation:** Archive function fires **only when a cycle COMPLETES** (after `IMPLEMENTATION_COMPLETE` or `IMPLEMENTATION_FAILED`), NOT when a new cycle **starts**.

**File:** `.github/copilot-instructions.md`  
**Lines 22–23:** Artifact requirements state:
> "Never advance to implementation unless BOTH of these files exist: `reports/copilot-research.md`, `reports/codex-plan.md`"
- Does NOT specify that old artifacts must be cleaned up when entering a **new** RESEARCHING state.

### Workflow Evidence

**File:** `.smc-workflow-state.json` (current session)
- State file is NOT committed to the repository.
- Fresh clones start with no state file → pipeline begins in implicit IDLE.
- Stale `reports/codex-plan.md` and `reports/copilot-research.md` remain in the working directory from a prior developer session or prior cycle.
- New `/research-and-plan` command writes a NEW `reports/copilot-research.md` but does NOT remove the OLD `reports/codex-plan.md` from a prior cycle.
- Codex reads both files, sees conflicting contracts, and stops.

### Pipeline Known Issues

**File:** `reports/pipeline-known-issues.md`  
**Entry:** "[2026-05-23] RESEARCHING state silently stalls pipeline watcher"
- Root cause was missing handler for RESEARCHING state — fixed.
- But the fix does NOT clean up stale artifacts, only transitions to PLANNING if research file exists.

**File:** `reports/pipeline-known-errors.md`  
**Entry:** "KE-001 — `checkMergedPR` crash"
- Watcher crash from missing error binding — fixed 2026-05-25.
- PID file held stale pid; process never restarted until manual intervention.

---

## 3. Root cause hypothesis

### Most Likely

**Primary root cause:** The pipeline watcher's RESEARCHING state entry handler (added in 2026-05-23 fix) does NOT clean up artifacts from the prior cycle before Copilot writes new research.

**Why this is most likely:**
- `archiveCycleArtifacts()` is called only at cycle END, not at cycle START.
- Copilot's intake stage overwrites `reports/copilot-research.md` but does NOT remove the stale `reports/codex-plan.md` from a prior cycle.
- The `.smc-workflow-state.json` state file is not committed, so fresh clones inherit stale artifact files from the developer's workspace.

**Confirmed:** Stale `codex-plan.md` with outdated contract (crypto weekend session, already implemented in PR #228) caused Codex to refuse the "Fix EA compile errors" task on 2026-05-26.

### Secondary Triggers

1. **When stale artifacts persist across developer sessions:** Fresh checkout of the repo has no `.smc-workflow-state.json` (not committed), but `reports/codex-plan.md` and `reports/copilot-research.md` may exist from a prior incomplete cycle or archived file that was not cleaned.

2. **When a cycle is abandoned mid-state:** If a developer manually resets the pipeline (`npm run pipeline:reset`) or the watcher crashes before archiving, stale artifacts may remain.

3. **No garbage collection at IDLE → RESEARCHING transition:** The pipeline state machine has no cleanup logic triggered by entering a new cycle.

---

## 4. Blast radius

### Files That Generate or Hold Stale Artifacts
- `reports/copilot-research.md` — overwritten on each Copilot intake, but the OLD version may contain outdated contract metadata
- `reports/codex-plan.md` — written once per cycle by Claude, never cleaned up on new cycle entry; persists across cycles if not explicitly removed
- `reports/codex-plan.meta.json` — plan metadata file; can become orphaned if plan is not refreshed
- `reports/codex-implementation.md` — implementation file; can be stale if cycle incomplete

### Systems Affected by Stale Artifacts
- **Codex:** Reads `reports/codex-plan.md` as part of implementation context; sees outdated contract, stops with conflict error.
- **Claude plan hardening:** Reads `reports/copilot-research.md` and expects it to match the current issue; stale research defeats the plan.
- **Pipeline watcher:** Does not detect that artifacts are stale; advances pipeline even though the context is wrong.
- **Every new `/research-and-plan` cycle:** Any subsequent research cycle on a different issue will inherit the stale plan from the previous issue, causing Codex to refuse work.

### Parity Surfaces at Risk
- **None directly** — stale artifacts do not affect Pine <-> Backend <-> MT5 parity; they block pipeline automation.
- **Indirect risk:** If a cycle is abandoned due to stale artifact conflict, the underlying issue (code bug, feature request) is never implemented, delaying downstream parity work.

### Cross-Phase Risk
- **Phase 0 stabilization:** Ongoing research and patch cycles are blocked by stale artifacts; cycle time increases.
- **Phase 1–7:** Any new issue intake that encounters stale artifacts from a prior phase will be blocked.
- **Future container/CI runs:** CI pipelines that check out the repo fresh will inherit stale `reports/*.md` files committed to git or left in the working directory.

---

## 5. Regression surface

### Behavior to Preserve

1. **Completed cycle artifacts must be archived:** When a cycle reaches `IMPLEMENTATION_COMPLETE` or `IMPLEMENTATION_FAILED`, the pipeline must move artifacts to `reports/archive/<slug>-<ts>/` so they do not interfere with future cycles.

2. **Current active cycle artifacts must NOT be deleted prematurely:** While a cycle is in progress (RESEARCHING → PLANNING → READY_FOR_IMPLEMENTATION → IMPLEMENTATION_COMPLETE), the pipeline must not delete `reports/copilot-research.md`, `reports/codex-plan.md`, etc.

3. **Pipeline state must be preserved across watcher restarts:** If the watcher crashes and restarts mid-cycle, it must re-read the same `.smc-workflow-state.json` and resume without losing context.

4. **Manual reset (`npm run pipeline:reset`) must be safe:** Running `npm run pipeline:reset` should archive the current cycle and return to IDLE without data loss.

### Existing Guards

- **`archiveCycleArtifacts()` function (line ~347):** Safely copies artifacts to archive before removing.
- **`.smc-workflow-state.json` issue tracking (line ~state field):** Records which issue each cycle is working on; can be used to detect stale artifacts for a different issue.
- **Plan metadata hash (copilot-research hash in `codex-plan.meta.json`):** Tracks which research file the plan was generated from; can detect stale plan.
- **`hasUsablePlanArtifactForState()` function (line ~1450):** Checks whether the plan matches the current issue before using it.

### Tests or Audits

- **`reports/automation-update-log.md`:** Documents every confirmed repetitive failure; entry for stale artifacts is not yet formally recorded.
- **`reports/pipeline-known-issues.md`:** Documents the 2026-05-23 RESEARCHING handler fix but does not document stale artifact cleanup gaps.
- **No automated regression tests:** The pipeline has no test suite that simulates stale artifact scenarios.

---

## 6. Resolution path options

### Path A: Cleanup on RESEARCHING entry (narrowest fix)

**Approach:** When `.smc-workflow-state.json` transitions to RESEARCHING or when Copilot writes `reports/copilot-research.md`, the watcher should remove stale artifacts from prior cycles.

**Mechanism:**
1. When Copilot inlet writes a NEW issue into `.smc-workflow-state.json` with state=RESEARCHING, check for stale plan:
   - If `reports/codex-plan.md` exists AND its metadata shows a different issue → DELETE it.
   - If `reports/codex-plan.md` exists AND its research hash doesn't match `reports/copilot-research.md` → DELETE it.
2. Similarly, check `reports/codex-implementation.md` against the current issue and delete if stale.

**Where:** In `scripts/pipeline-watcher.js`, add cleanup logic to the RESEARCHING state handler (already present, needs enhancement).

**Scope of change:** Watcher only; no changes to Copilot intake or Codex.

**Risk:** Very low — only deletes artifacts explicitly identified as stale (different issue or mismatched hash).

**Regression protection:** `hasUsablePlanArtifactForState()` already validates plan ownership; cleanup just removes artifacts that would fail that check anyway.

**Recommended:** YES. This is the smallest, safest fix.

### Path B: Structured cycle archiving (broader safety)

**Approach:** Enhance the pipeline infrastructure to always archive prior cycle before starting a new one, regardless of state.

**Mechanism:**
1. When entering RESEARCHING from any non-IDLE state, call `archiveCycleArtifacts()` to move current artifacts to `reports/archive/`.
2. When calling `npm run pipeline:reset`, explicitly call archive-then-cleanup.
3. Add a cleanup-only mode to `reset-pipeline.js`: `npm run pipeline:reset-and-archive`.

**Where:** `scripts/pipeline-watcher.js` (evaluatePipeline), `scripts/reset-pipeline.js`.

**Scope of change:** Watcher and reset script; introduces new npm command.

**Risk:** Moderate — must ensure archive doesn't accidentally delete active cycle artifacts mid-transition.

**Regression protection:** Relies on `archiveCycleArtifacts()` being safe (it is — it copies before deleting).

### Path C: Pre-commit artifact validation (strongest long-term)

**Approach:** Add git hooks and CI checks to prevent stale artifacts from being committed or left in the working directory at all.

**Mechanism:**
1. Pre-commit hook: if `.smc-workflow-state.json` state is not IDLE and artifacts are about to be staged, warn and refuse commit.
2. Pre-push hook: ensure `reports/*.md` (except archived) are not stale before allowing push.
3. CI workflow: on merge to main, validate that no stale pipeline artifacts are present in the merged commit.

**Where:** `.git/hooks/` (pre-commit, pre-push), `.github/workflows/` (if CI present).

**Scope of change:** Git configuration, CI pipelines; no changes to watcher or scripts.

**Risk:** High — git hooks are fragile and can break developer experience; requires org-wide adoption.

**Not recommended for immediate implementation:** Too heavy for the current issue scope.

### Recommended Resolution

**Path A (Cleanup on RESEARCHING entry)** is the best choice:
- Narrowest surface change
- Lowest risk of breaking active cycles
- Directly addresses the root cause (stale plan from prior cycle not removed)
- Integrates with existing `hasUsablePlanArtifactForState()` guard
- Can be implemented and tested quickly in one watcher file

**Secondary mitigation (Path B elements):** Once Path A is in place, add a similar cleanup step to the reset-pipeline.js to handle manual resets gracefully.

---

## 7. Risk flags

- **High-risk system involved:** YES. Pipeline automation is the gating mechanism for all multi-agent issue cycles; stale artifacts block 100% of new research intakes once triggered.
- **Requires parity re-validation:** NO. Stale artifacts are a pipeline/workflow issue, not a signal engine issue.
- **Migration-blocking:** NO. The issue does not block migration phases directly, but it does block Phase 0 stabilization and any active issue cycles.
- **Human review required before merge:** YES. The cleanup logic must be reviewed to ensure it does not accidentally delete active cycle artifacts; plan ownership validation is critical.

---

## 8. Handoff package

### Epicentre Files to Inspect First
- `scripts/pipeline-watcher.js` — RESEARCHING state handler (around line 1200–1250; added 2026-05-23)
- `scripts/pipeline-watcher.js` — `hasUsablePlanArtifactForState()` function (around line 1450)
- `scripts/pipeline-watcher.js` — `archiveCycleArtifacts()` function (line ~347)
- `.github/copilot-instructions.md` — Artifact requirements and state machine (lines 22–50)

### Inputs Codex Must Verify Before Planning

1. **Confirm the artifact cleanup scope:**
   - Should cleanup happen at RESEARCHING entry, or at IDLE → RESEARCHING transition, or both?
   - Should the watcher delete stale artifacts, or rename them to `.archive/`, or both?

2. **Validate ownership checks:**
   - Is the metadata hash comparison in `hasUsablePlanArtifactForState()` sufficient to detect stale artifacts?
   - Are there other fields in `codex-plan.meta.json` that should be checked before trusting a plan?

3. **Test scenario coverage:**
   - Simulate stale plan from prior issue → new issue intake → cleanup should occur before plan hardening.
   - Simulate watcher crash mid-cycle → restart should NOT delete active-cycle artifacts.
   - Simulate fresh clone with stale `reports/` files → first new intake should clean them up.

4. **Integration with reset-pipeline.js:**
   - Should `npm run pipeline:reset` also call archive + cleanup, or is the current sentinel-file mechanism sufficient?

### Open Unknowns That Could Invalidate the Hypothesis

1. **Are the stale artifacts actually coming from prior cycles, or from a different source?**  
   Confirmed: copilot-research.md explicitly documents prior-cycle stale plan from crypto weekend classification (PR #228).

2. **Do other development processes outside the pipeline write to `reports/codex-plan.md`?**  
   Unconfirmed: check if any developer scripts or CI workflows manually edit or generate plan files.

3. **Is the OneDrive sync lock preventing file deletion?**  
   Partially confirmed: pipeline-watcher.js explicitly uses `writeFileSync` instead of `unlinkSync` for some lock files to avoid EPERM on OneDrive; may affect artifact cleanup.

4. **Are the cleanup guards in `hasUsablePlanArtifactForState()` actually being used before Codex reads the plan?**  
   Confirmed: plan must exist before entering READY_FOR_IMPLEMENTATION, but no evidence that the watcher rejects a stale plan proactively.

---

## 9. Suspected Permanent Guards to Install

Based on the confirmed pattern in `reports/automation-update-log.md`:

1. **Entry in `reports/automation-update-log.md`** (new section):
   - Date: 2026-05-26
   - Failure: "Stale pipeline artifacts block new research cycles"
   - Frequency: Recurring across every new `/research-and-plan` intake that encounters a prior incomplete cycle
   - Root cause: No cleanup of prior-cycle artifacts on new cycle entry
   - Guard installed: [to be filled by Codex]

2. **Regression test in pipeline:** (If test infrastructure is added)
   - Simulate stale plan from issue A, then queue new issue B.
   - Assert that cleanup occurs before plan hardening for issue B.
   - Assert that plan metadata is validated before Codex consumes it.

3. **Documentation update to `.github/copilot-instructions.md`:**
   - Add explicit requirement: "Stale artifacts from prior cycles must be cleaned up on RESEARCHING entry."
   - Add check: "Before advancing to implementation, validate that the plan metadata matches the current issue."

---

## 10. Recommended Next Steps for Codex

1. **Implement cleanup in RESEARCHING state handler** — remove stale plan/implementation artifacts if they don't match the current issue.
2. **Add logging** — when cleanup occurs, log it so developers can see what was removed and why.
3. **Write regression test scenario** — simulate stale artifact + new intake, verify cleanup works.
4. **Update `reports/automation-update-log.md`** — document this fix as a permanent guard to prevent recurrence.
5. **Consider secondary cleanup in reset-pipeline.js** — ensure manual reset also cleans up orphaned artifacts safely.

