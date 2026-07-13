# SMC SuperFIB - Hardened Implementation Contract

## 1. Issue validation

**Confirmed:**

- Stale `reports/codex-plan.md` from the prior cycle (crypto weekend session classification, implemented in PR #228) remained in the working directory when the "Fix EA compile errors" task was queued on 2026-05-26. Codex read the outdated contract and halted with a conflict error. This is directly attested in `reports/copilot-research.md` lines 68–72 and `reports/codex-plan.md` lines 17–18.

- `archiveCycleArtifacts()` in `scripts/pipeline-watcher.js` (~line 347) is called only at cycle END (`IMPLEMENTATION_COMPLETE` / `IMPLEMENTATION_FAILED`), never at cycle START. This is the structural cause.

- The RESEARCHING state handler added on 2026-05-23 detects and transitions when `reports/copilot-research.md` exists, but it does not delete or archive stale artifacts left over from a different prior issue.

**Likely:**

- The `.smc-workflow-state.json` file is not committed to the repository, so fresh clones or watcher restarts begin with no state context while stale `reports/codex-plan.md` files remain from a prior developer session. This is consistent with the OneDrive-hosted working directory pattern.

- `hasUsablePlanArtifactForState()` (~line 1450) validates plan ownership before entering `READY_FOR_IMPLEMENTATION`, but the check fires too late — Codex reads the stale plan before the watcher's ownership gate is reached.

**Unconfirmed:**

- Whether OneDrive sync locks (`EPERM` on `unlinkSync`) affect artifact cleanup. The watcher already uses `writeFileSync` workarounds for lock files; the same EPERM risk may apply to `unlink` calls on `reports/codex-plan.md`. This must be verified before implementing deletion.

- Whether any developer scripts or CI workflows outside the pipeline write directly to `reports/codex-plan.md`. If they do, cleanup logic must not treat those writes as stale.

**Root cause (corrected from research report):** The root cause is a single missing cleanup step: the RESEARCHING state handler does not validate or remove `reports/codex-plan.md` and `reports/codex-implementation.md` when the incoming issue differs from the issue those artifacts were generated for. The research report's diagnosis is correct; no correction to the root cause is required.

---

## 2. Implementation contract

### File 1: `scripts/pipeline-watcher.js`

**Function / section:** RESEARCHING state handler (approximately lines 1200–1250, added 2026-05-23).

**Exact change required:**

At the point where the RESEARCHING handler confirms that `reports/copilot-research.md` exists and the state is RESEARCHING, add a stale-artifact cleanup step **before** advancing to PLANNING:

1. Read the current issue slug from `.smc-workflow-state.json` (field: `issue` or equivalent).
2. Attempt to read `reports/codex-plan.meta.json`. If it exists and its stored issue slug does not match the current issue slug, mark `reports/codex-plan.md` and `reports/codex-plan.meta.json` as stale.
3. Attempt to read `reports/codex-implementation.md`. If it exists and its stored issue slug (from `reports/codex-implementation-metadata.json` or equivalent metadata file) does not match the current issue slug, mark it as stale.
4. For each stale artifact: move it into `reports/archive/stale-<slug>-<timestamp>/` using the same copy-then-delete pattern already used in `archiveCycleArtifacts()`. Do NOT use bare `fs.unlinkSync` directly — use the existing safe-archive helper or replicate its copy-then-unlink sequence to guard against EPERM on OneDrive.
5. After archiving, emit a structured log entry: `[pipeline-watcher] Stale artifact archived: <filename> (prior issue: <prior-slug>, current issue: <current-slug>)`.
6. Only after cleanup completes, proceed with the existing RESEARCHING → PLANNING transition logic.

**Guard rails — must not change:**

- The existing RESEARCHING → PLANNING transition logic must not be altered except to insert the cleanup step before it.
- `archiveCycleArtifacts()` at cycle END must not be removed or modified.
- `hasUsablePlanArtifactForState()` must remain in place; this cleanup does not replace it.
- Do not delete `reports/copilot-research.md` during this cleanup — Copilot has already written the new research for the current cycle by the time this handler fires.
- Do not delete artifacts that match the current issue slug — only stale (mismatched) artifacts.
- If `reports/codex-plan.meta.json` does not exist, treat the plan as stale and archive it.

**Why this file is in scope:** It is the only process that manages pipeline state transitions. The stale artifact problem is a missing state-entry guard in this file's RESEARCHING handler.

**Acceptance criterion:** Given a workspace containing `reports/codex-plan.md` written for issue A, when the pipeline enters RESEARCHING for issue B, `reports/codex-plan.md` is moved to `reports/archive/stale-<issueA>-<ts>/codex-plan.md` before PLANNING begins for issue B. Codex no longer encounters the prior-cycle contract.

---

### File 2: `scripts/reset-pipeline.js`

**Function / section:** The main reset execution block (wherever `pipeline:reset` terminates the watcher and clears state).

**Exact change required:**

After the watcher is stopped and before `.smc-workflow-state.json` is cleared or reset to IDLE:

1. Call `archiveCycleArtifacts()` (import or inline the same safe-archive logic from `pipeline-watcher.js`) with the current issue slug read from `.smc-workflow-state.json`.
2. If `.smc-workflow-state.json` does not exist or has no issue slug, still attempt to move any existing `reports/codex-plan.md`, `reports/codex-plan.meta.json`, `reports/codex-implementation.md`, and `reports/codex-implementation-metadata.json` into `reports/archive/manual-reset-<timestamp>/`.
3. Log each file moved.
4. Only then clear or reset `.smc-workflow-state.json`.

**Guard rails — must not change:**

- Do not change the sentinel-file or PID-file mechanism used by the reset script.
- Do not archive `reports/copilot-research.md` during a manual reset unless it is also part of the current cycle (check issue slug match). This avoids destroying research in progress.
- The npm command name `pipeline:reset` must remain unchanged.

**Why this file is in scope:** Manual resets are the second vector by which stale artifacts persist. Without archive-on-reset, a developer who resets mid-cycle leaves stale plan files that block the next cycle.

**Acceptance criterion:** Running `npm run pipeline:reset` from any pipeline state moves all current-cycle plan and implementation artifacts to `reports/archive/manual-reset-<ts>/` before returning to IDLE.

---

### File 3: `reports/automation-update-log.md`

**Function / section:** Recurring-failure log (append new entry at the top of the log, following existing entry format).

**Exact change required:**

Append a new structured entry:

```
## [2026-05-26] Stale pipeline artifacts block new research cycles

- **Failure:** Prior-cycle `reports/codex-plan.md` (issue: crypto weekend session classification, PR #228) remained in the working directory when the "Fix EA compile errors" task was queued. Codex read the stale contract and halted with a conflict error.
- **Frequency:** Recurring — triggers on every new research-and-plan intake that encounters an artifact from a prior incomplete or completed-but-not-archived cycle.
- **Root cause:** RESEARCHING state handler does not clean up prior-cycle artifacts. `archiveCycleArtifacts()` fires only at cycle END, not at cycle START.
- **Guard installed:** Stale-artifact cleanup added to RESEARCHING entry handler in `scripts/pipeline-watcher.js`. Archive-on-reset added to `scripts/reset-pipeline.js`. See PR #<to be filled>.
- **Recurrence indicator:** If `reports/codex-plan.md` issue slug does not match `.smc-workflow-state.json` current issue at RESEARCHING entry → watcher must archive and proceed.
```

**Guard rails — must not change:** Existing log entries must not be modified. Entry format must match prior entries.

**Why this file is in scope:** The research report (Section 9) explicitly requires this log to be updated as a permanent guard. Documenting the fix here closes the known-error loop.

**Acceptance criterion:** The log entry exists and contains the issue date, failure description, root cause, and guard installed reference before the PR is merged.

---

### File 4: `.github/copilot-instructions.md`

**Function / section:** Artifact requirements section (lines 22–50).

**Exact change required:**

After the existing requirement:
> "Never advance to implementation unless BOTH of these files exist: `reports/copilot-research.md`, `reports/codex-plan.md`"

Add the following clause:

> "Before advancing to PLANNING, the pipeline watcher must verify that `reports/codex-plan.md` (if present) belongs to the current issue. If the plan metadata issue slug does not match the current issue slug in `.smc-workflow-state.json`, the stale plan must be archived and must not be used. The RESEARCHING state handler is responsible for this check."

**Guard rails — must not change:** No other lines in `copilot-instructions.md` may be modified. The existing advancement gate (BOTH files must exist) must remain.

**Why this file is in scope:** The research report (Section 9, item 3) explicitly calls for this documentation update. Without it, future contributors will reproduce the same omission.

**Acceptance criterion:** The clause is present in the file and does not contradict any existing requirement.

---

## 3. Patch sequence

1. **Read `scripts/pipeline-watcher.js`** in full — locate the RESEARCHING state handler (~lines 1200–1250), `hasUsablePlanArtifactForState()` (~line 1450), and `archiveCycleArtifacts()` (~line 347). Confirm exact line numbers and the issue-slug field name in `.smc-workflow-state.json` before writing any code.

2. **Read `reports/codex-plan.meta.json` schema** — confirm the field name used to store the issue slug or research hash. This determines the stale-detection comparison in step 3.

3. **Patch `scripts/pipeline-watcher.js` (RESEARCHING handler)** — insert stale-artifact cleanup before the PLANNING transition. This is the primary fix.

4. **Patch `scripts/reset-pipeline.js`** — add archive-on-reset. Depends on step 3 only in that both use the same safe-archive pattern; can proceed in parallel with step 3 if the safe-archive helper is extracted first.

5. **Append entry to `reports/automation-update-log.md`** — after both script patches are complete and the PR number is known (or use a placeholder).

6. **Patch `.github/copilot-instructions.md`** — add the artifact ownership clause. No code dependency; can proceed after step 3.

**Dependencies:**

- Steps 3 and 4 both depend on confirming the safe-archive pattern (copy-then-unlink) and the EPERM/OneDrive guard. Confirm this in the existing `archiveCycleArtifacts()` before writing either patch.
- Step 5 depends on PR number — use a placeholder `PR #<TBD>` if the log must be committed before the PR is open.
- Step 4 is independent of step 3 except for shared helper logic.

**State/sequencing risk:**

- The cleanup in step 3 must fire **after** Copilot has written `reports/copilot-research.md` for the new issue and **before** the watcher tells Codex to read the plan. If the cleanup fires before Copilot writes the new research file, the issue slug in `.smc-workflow-state.json` may not yet reflect the new issue, and the stale check will miss.
- Confirm the exact moment `.smc-workflow-state.json` is updated with the new issue slug in the current RESEARCHING entry flow before inserting the cleanup call.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. Start the pipeline watcher with a workspace that contains `reports/codex-plan.md` and `reports/codex-plan.meta.json` from a prior issue (different slug than the new intake). Queue a new issue. Confirm that before PLANNING begins, `reports/codex-plan.md` is moved to `reports/archive/stale-*/` and no longer exists in `reports/`.

2. Start the pipeline watcher mid-cycle (RESEARCHING → active cycle in progress). Confirm that the cleanup step does NOT archive the current-cycle plan if its issue slug matches the current issue.

3. Run `npm run pipeline:reset` with `reports/codex-plan.md` present. Confirm it is moved to `reports/archive/manual-reset-*/` before the state file is cleared.

4. Simulate watcher crash and restart mid-cycle. Confirm that on restart, the RESEARCHING handler recognises that the current-cycle artifacts match the current issue and does NOT archive them.

5. Confirm that `archiveCycleArtifacts()` at cycle END still fires and still moves artifacts correctly — the new cleanup step must not interfere with end-of-cycle archiving.

**Existing protections that must still hold:**

- `hasUsablePlanArtifactForState()` must still gate advancement to `READY_FOR_IMPLEMENTATION` as before.
- The RESEARCHING → PLANNING transition must still require `reports/copilot-research.md` to exist.
- PID file and sentinel-file management in the watcher must be unaffected.

**Parity re-validations required:** None. This patch touches only pipeline automation infrastructure; Pine, MT5, and backend parity surfaces are not affected.

**Logging that must exist after the patch:**

- Every stale-artifact archive operation must emit a log line: `[pipeline-watcher] Stale artifact archived: <path> (prior issue: <slug>, current: <slug>)`.
- Every cleanup-on-reset must emit: `[reset-pipeline] Archived <path> during manual reset`.
- If no stale artifacts are found at RESEARCHING entry, no log line is required (silent success is correct here).

---

## 5. Non-goals

- Do not modify Copilot's intake stage or how `reports/copilot-research.md` is written.
- Do not modify the `archiveCycleArtifacts()` function itself — only call it in new locations.
- Do not add a new npm command (`pipeline:reset-and-archive`) — the existing `pipeline:reset` command is sufficient once step 4 is patched.
- Do not add git pre-commit or pre-push hooks — Path C from the research report is explicitly out of scope for this patch.
- Do not add a test suite or CI workflow for pipeline simulation — regression guards above are manual verification steps; automated test infrastructure is a separate initiative.
- Do not rename, move, or restructure any `reports/` directory layout beyond the `archive/` subdirectory already in use.
- Do not touch `.smc-workflow-state.json` schema — read it as-is, do not add or remove fields.
- Do not modify `hasUsablePlanArtifactForState()` — it stays as the late-stage ownership gate; this patch adds an earlier-stage cleanup only.
- Do not clean up `reports/copilot-research.md` as part of this patch — it is an output of the current cycle's intake and must be preserved.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

The cleanup comparison logic uses the wrong field name or the wrong comparison order, causing the stale check to match active-cycle artifacts as stale. The watcher archives the current-cycle `reports/codex-plan.md` mid-cycle, forcing Codex to stop because the plan file it needs is gone. This would block the pipeline more severely than the original stale artifact problem.

**User-visible failure mode:**

Pipeline stalls at PLANNING indefinitely — Copilot writes research but the plan file is never present for Codex to consume, and the watcher loops without advancing.

**Backend authority / stale-state risks:**

None. The patch does not touch any backend API, signal engine, or MT5/Pine data path. The only state modified is the `reports/` directory and `.smc-workflow-state.json`.

**OneDrive EPERM risk:**

File deletion via `fs.unlinkSync` may throw EPERM on OneDrive-synced paths on Windows 10. The patch must use the copy-then-unlink pattern already established in `archiveCycleArtifacts()`. If `unlinkSync` throws EPERM, the implementation must catch the error, log a warning, and leave the archive copy in place rather than crashing the watcher.

**Human approval required before merge:** YES. The stale-detection comparison logic (issue slug matching) is the critical guard. An incorrect comparison would cause active-cycle artifacts to be deleted. The patch must be reviewed by a human before merge to confirm that the issue slug field name and comparison are correct for all pipeline entry paths.

---

## 7. Test requirements

**Tests to add or update:**

1. **Manual scenario — stale plan from prior issue:**
   - Setup: Write `reports/codex-plan.md` and `reports/codex-plan.meta.json` with issue slug `fix-ea-compile-errors-prior`. Set `.smc-workflow-state.json` issue to `fix-ea-compile-errors-new` at state RESEARCHING. Write `reports/copilot-research.md` for the new issue.
   - Trigger: Start watcher or call the RESEARCHING handler directly.
   - Assert: `reports/codex-plan.md` is absent from `reports/`. `reports/archive/stale-fix-ea-compile-errors-prior-*/codex-plan.md` exists.

2. **Manual scenario — active-cycle plan must not be archived:**
   - Setup: Write `reports/codex-plan.md` and `reports/codex-plan.meta.json` with issue slug matching the current `.smc-workflow-state.json` issue. Set state to RESEARCHING.
   - Trigger: Call the RESEARCHING handler.
   - Assert: `reports/codex-plan.md` still exists in `reports/` after the handler runs.

3. **Manual scenario — reset archives current artifacts:**
   - Setup: Write `reports/codex-plan.md` for any issue slug. Run `npm run pipeline:reset`.
   - Assert: `reports/codex-plan.md` is absent from `reports/`. `reports/archive/manual-reset-*/codex-plan.md` exists.

4. **Manual scenario — watcher restart mid-cycle does not corrupt active artifacts:**
   - Setup: Start a cycle to PLANNING state. Kill the watcher process. Restart it.
   - Assert: `reports/codex-plan.md` (for the active issue) is still present and unmodified.

**Existing tests / checks that must still pass:**

- Full pipeline cycle from RESEARCHING through IMPLEMENTATION_COMPLETE must complete with artifacts archived at cycle end via the existing `archiveCycleArtifacts()` call. Run one complete cycle end-to-end after patching.
- `npm run pipeline:reset` must return the watcher to IDLE state and terminate cleanly.

**Soak / live-environment verification:**

- Run the patched pipeline against one real new issue intake (not a simulation) after the PR is merged. Confirm no stale-artifact conflict and no lost active-cycle artifacts before closing verification.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`fix/pipeline-stale-artifact-cleanup`

**Suggested commit grouping:**

- Commit 1: `fix(pipeline-watcher): archive stale prior-cycle artifacts on RESEARCHING entry` — changes to `scripts/pipeline-watcher.js` only.
- Commit 2: `fix(reset-pipeline): archive current-cycle artifacts on manual reset` — changes to `scripts/reset-pipeline.js` only.
- Commit 3: `docs(pipeline): record stale-artifact guard in automation-update-log and copilot-instructions` — changes to `reports/automation-update-log.md` and `.github/copilot-instructions.md` only.

**Required reports or artifacts to generate after implementation:**

- `reports/automation-update-log.md` updated with the 2026-05-26 stale-artifact guard entry (Commit 3 above).
- After the patch is merged, run one live pipeline cycle and confirm no stale-artifact error appears in the watcher log. No separate report file is required for this verification.

**State transition required after plan handoff:**

`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
