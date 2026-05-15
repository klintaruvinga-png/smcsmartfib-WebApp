# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

### Confirmed

**Phase 0 gate is legitimately closed.**
The research report cites `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md` with gate decision PASSED, 11/11 success criteria met, 100% parity on all audited surfaces, and 259,464 engine runs / 0 errors. No counter-evidence exists. Phase 0 closeout is real and complete.

**Phase 1 is at 20% — backend APIs complete, EA live validation has not started.**
Migration-status.md corroborates: `POST /ea/heartbeat`, `POST /ea/account-sync`, `POST /ea/symbol-sync`, `GET /ea/license-check` are delivered. `SMC_MarketDataEA.mq5` live terminal validation is pending. This is the actual Phase 1 blocker.

**Documentation gap is real and blocks team coordination.**
No Phase 1 roadmap, tracker, or checklist document exists beyond the summary table in `migration-status.md`. Absence of explicit ownership, acceptance thresholds, and sequencing increases coordination failure risk as Track A and Track B move into live terminal testing.

**Repository root contains stale artifacts that increase noise.**
Log files (`.codex-vite-dev.err.log`, `.codex-vite-dev.log`, `.codex-vite-mock.err.log`, `.codex-vite-mock.log`), `build-watchlist.log`, and `phase3_mt5_simulation_test.php` are confirmed present in root. These are not code regressions but are discoverability liabilities.

### Likely

**`stratupdate.md` is a stale working note, not canonical documentation.**
The research flags it as "unclear purpose." Given the file naming pattern and the absence of any reference to it in canonical governance files, it is likely an ephemeral artifact. Cannot confirm deletion without reading it first; archival is the safe default.

**`reports/snapshots/` dated subdirectories are soak logs, not active references.**
Five-plus dated snapshot directories consistent with Phase 0 soak cadence. Likely safe to consolidate into a single archive subfolder. Cannot confirm without verifying that `scripts/pipeline-watcher.js` does not glob into this path.

### Unconfirmed

**Whether any CI pipeline or script parses `.github/migration/phase-updates/` directly.**
Research acknowledges this risk but does not resolve it. Archive actions against that folder must be guarded by a reference audit before execution.

**Whether Track C (Dashboard) is blocked on Phase 1 completion or simply deferred by preference.**
Research notes it as "explicitly deferred to Phase 2" but flags it as an open unknown. Phase 1 docs should state this boundary explicitly so it does not become a coordination ambiguity.

**Whether the 2026-06-01 Phase 1 target is binding or aspirational.**
Unresolvable from documentation alone. Plan treats it as a working deadline and flags it in handoff.

**Root cause classification:** This is a documentation governance and repository organization issue. There is no code defect. No backend authority, stale-data protection, Pine formula, or signal engine is implicated. Phase 1 technical work is on its own track; the documentation gap is a parallel risk, not a blocker to EA validation starting.

---

## 2. Implementation contract

### File 1: `.github/migration/PHASE1_BRIDGE_ROADMAP.md` — NEW

- **Section to create:** Entire file (does not exist)
- **Exact change required:** Create a Phase 1 technical roadmap document with the following sections:
  1. Phase 1 objective and scope boundary (MT5 EA live bridge only; dashboard deferred to Phase 2)
  2. Track assignments: Track A (MT5 EA owner), Track B (Backend owner), Track C (Dashboard — explicitly deferred, no Phase 1 work)
  3. Deliverable matrix: each deliverable, owner track, completion state (done / pending), and acceptance threshold
  4. Acceptance criteria with quantified thresholds: heartbeat stable 48h+ with zero gaps; session drops = 0 (not <0.1%); automatic reconnect validated against terminal restart, VPS restart, internet interruption, duplicate heartbeat rejection, invalid license rejection
  5. Live terminal environment requirements: broker, account type, MT5 build, infrastructure access prerequisites
  6. Phase gate definition: what constitutes Phase 1 PASSED and what triggers Phase 2 start
  7. Timeline: 2026-06-01 target with milestone checkpoints
- **Guard rails:** Must not modify any MT5 `.mqh` files, backend API contracts, or Pine source. Must not invent acceptance thresholds not derivable from existing `migration-status.md` or Phase 0 precedent. Must not scope in dashboard work.
- **Why in scope:** No Phase 1 roadmap document exists. Track A and Track B cannot coordinate live validation without explicit acceptance thresholds and environment requirements.
- **Acceptance criterion:** File exists at the stated path. Acceptance thresholds for all five Phase 1 test scenarios are stated with binary pass/fail criteria. Track assignments name the responsible track (not individuals, since personnel are not in scope to document here).

---

### File 2: `.github/migration/PHASE1_TRACKER.md` — NEW

- **Section to create:** Entire file (does not exist)
- **Exact change required:** Create a live status board with:
  1. Phase 1 current status line (percentage complete, last-updated date, current blocker)
  2. Deliverables table: deliverable name, track owner, status (DONE / IN-PROGRESS / BLOCKED / PENDING), completion date or estimated date
  3. Blocker log: each blocker, date opened, date resolved or ETA, owner
  4. Phase gate progress: checklist of Phase 1 success criteria with current state
  5. Integration handoff row: when Phase 1 gate passes, what transfers to Phase 2 scope
- **Guard rails:** Must not duplicate the full narrative from `migration-status.md`. Must reference `PHASE1_BRIDGE_ROADMAP.md` for detail rather than re-stating acceptance criteria inline.
- **Why in scope:** The `migration-status.md` single-source-of-truth model conflates summary and detail. A separate tracker allows status updates without rewriting narrative docs.
- **Acceptance criterion:** All six Phase 1 EA test scenarios (terminal restart, VPS restart, internet interruption, duplicate protection, invalid license rejection, 48h heartbeat) appear as trackable checklist items with an explicit pending state.

---

### File 3: `.github/migration/PHASE1_CHECKLIST.md` — NEW

- **Section to create:** Entire file (does not exist)
- **Exact change required:** Create a task-level checklist with:
  1. Pre-validation prerequisites section: EA code complete, backend APIs in staging, broker test account available, MT5 terminal access confirmed
  2. Track A checklist: MT5 EA tasks — deploy `SMC_MarketDataEA.mq5` to live terminal, confirm heartbeat POST firing, run each of the five validation scenarios, record results
  3. Track B checklist: Backend verification tasks — confirm API edge-case handling (invalid license, duplicate heartbeat, out-of-sequence symbol-sync), review server-side logs for each EA test event
  4. Track C checklist: Single item — "Dashboard work: DEFERRED to Phase 2. No Phase 1 action items."
  5. Gate sign-off section: explicit fields for Track A sign-off, Track B sign-off, and Phase 1 PASSED declaration with date
- **Guard rails:** Must not contain code snippets or API contract details (those belong in `PHASE1_BRIDGE_ROADMAP.md`). Must not invent new test scenarios beyond those already stated in `migration-status.md`.
- **Why in scope:** No checklist exists. Without it, the live terminal validation has no structured acceptance protocol.
- **Acceptance criterion:** File is usable as a standalone checklist by someone unfamiliar with the prior soak documentation. All five Phase 1 test scenarios from `migration-status.md` appear as discrete checkbox items.

---

### File 4: `.github/migration/archive/phase-0-updates-prior-to-2026-05-15/` — NEW DIRECTORY + FILE MOVES

- **Section to modify:** Create archive directory; move eight superseded Phase 0 checkpoint files into it
- **Exact change required:** Move the following files from `.github/migration/phase-updates/` to the archive directory:
  - `phase0-soak-Final-2026-05-14.md`
  - `phase-0-completion-2026-05-14.md`
  - `phase-0-focused-validation-attempt-2026-05-14.md`
  - `phase-0-post-fix-validation-checklist-2026-05-14.md`
  - `phase-0-next-actions-2026-05-14.md`
  - `phase-0-next-72h-checklist-2026-05-11.md`
  - `phase-0-soak-summary-2026-05-11.md`
  - Place an `ARCHIVE_INDEX.md` in the archive folder listing the moved files, their supersession reason (replaced by `phase0-soak-closeout-final-2026-05-15.md`), and the archive date
- **Guard rails:** Do NOT move `phase0-soak-closeout-final-2026-05-15.md` — it is the canonical final artifact and must remain in `phase-updates/`. Do NOT move any parity audit files. Do NOT delete any file; move only. The archive folder must remain within `.github/migration/` to preserve pipeline ingestion path prefixes.
- **Prerequisite before execution:** Grep all scripts, CI YAML, and agent definition files for direct references to each of the eight file names. If any reference is found, add a redirect stub (one-line file at the old path pointing to the archive location) before moving. This audit must complete before any file is moved.
- **Why in scope:** Eight superseded checkpoints create confusion about which Phase 0 record is authoritative. `phase0-soak-closeout-final-2026-05-15.md` supersedes all of them.
- **Acceptance criterion:** Running a search for the eight file names in `phase-updates/` returns zero results. The archive directory exists with all eight files and the index. The canonical closeout file remains in `phase-updates/`.

---

### File 5: `.github/migration-status.md` — MODIFY

- **Section to modify:** Phase 1 summary section (research reports lines 95–150)
- **Exact change required:** Add reference links to the three new Phase 1 documents immediately below the Phase 1 status table:
  ```
  → Detailed roadmap: [PHASE1_BRIDGE_ROADMAP.md](./migration/PHASE1_BRIDGE_ROADMAP.md)
  → Live tracker: [PHASE1_TRACKER.md](./migration/PHASE1_TRACKER.md)
  → Task checklist: [PHASE1_CHECKLIST.md](./migration/PHASE1_CHECKLIST.md)
  ```
- **Guard rails:** Do not rewrite existing Phase 1 summary content. Do not change the table format or header structure. This is a pointer insertion only. The Phase 2 and beyond sections must not be touched.
- **Why in scope:** `migration-status.md` is the single source of truth ingested by the migration manager agent. It must reference the new docs so automated ingestion can discover them.
- **Acceptance criterion:** The three links are present and resolve to the correct relative paths. The rest of the file is byte-for-byte identical to its pre-patch state.

---

### File 6: `.gitignore` — MODIFY

- **Section to modify:** Add or expand the dev-log exclusion block
- **Exact change required:** Add the following patterns if not already present:
  ```
  .codex-vite-dev.err.log
  .codex-vite-dev.log
  .codex-vite-mock.err.log
  .codex-vite-mock.log
  build-watchlist.log
  *.err.log
  ```
- **Guard rails:** Do not remove any existing ignore rules. Do not add broad wildcards that could suppress intentionally tracked log files in subdirectories.
- **Why in scope:** Root-level log files are present in the working tree. Gitignore prevents future spillage; the existing committed log files must be removed from tracking separately (see patch sequence step 7).
- **Acceptance criterion:** `git check-ignore -v .codex-vite-dev.err.log` returns a match. No existing tracked files are newly hidden by the added rules.

---

### File 7: Root-level log files — REMOVE FROM TRACKING

- **Files:** `.codex-vite-dev.err.log`, `.codex-vite-dev.log`, `.codex-vite-mock.err.log`, `.codex-vite-mock.log`, `build-watchlist.log`
- **Exact change required:** `git rm --cached` each file to remove from tracking without deleting from disk. They will then be covered by the updated `.gitignore`.
- **Guard rails:** Do not delete files from disk. `--cached` only. Verify `.gitignore` update is committed first so the untracked files are immediately covered.
- **Why in scope:** Log files committed to the repository increase repo size and create noise in diffs. They carry no canonical documentation value.
- **Acceptance criterion:** `git status` shows none of the five log file names as tracked files. `git ls-files | grep "\.log"` returns only intentionally tracked log files (if any exist in subdirectories).

---

### File 8: `stratupdate.md` — REVIEW AND ARCHIVE OR DELETE

- **Section to modify:** Decision gate before action
- **Exact change required:**
  1. Read the file. If it contains no unique information not already in canonical docs, move to `.github/migration/archive/` with a note in the archive index.
  2. If it contains unique active information, create a JIRA-style note in `PHASE1_TRACKER.md` to incorporate that information and then archive the file.
  3. Do not delete without reading.
- **Guard rails:** Do not delete without confirming the file contains no unique governance information. Do not leave it in root.
- **Why in scope:** Research identifies it as "unclear purpose" — it must be resolved, not left ambiguous.
- **Acceptance criterion:** File is not present in repository root. Its disposition (archived with note, or content absorbed) is recorded in the archive index.

---

### File 9: `phase3_mt5_simulation_test.php` — MOVE

- **Exact change required:** Move from repository root to `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- **Guard rails:** Verify the file is not referenced by any CI pipeline path before moving. If referenced, update the CI reference in the same commit.
- **Why in scope:** Test artifacts in repository root violate the established test directory convention (`wordpress/smc-superfib-sniper/tests/php/`).
- **Acceptance criterion:** File is absent from root. File exists at the new path. Any CI references resolve correctly.

---

## 3. Patch sequence

1. **Read `stratupdate.md`** (decision gate — determines File 8 disposition before any commit)
2. **Audit scripts and CI YAML for references to the eight Phase 0 file names** being archived (required before File 4 archive move; do not proceed to step 3 without completing this)
3. **Create three Phase 1 documents** (Files 1, 2, 3 — independent, can be authored in parallel)
4. **Update `.github/migration-status.md`** to add reference links (File 5 — depends on File 1/2/3 paths being finalized)
5. **Create archive directory and move eight Phase 0 checkpoints** (File 4 — depends on step 2 audit result; add stubs if references found)
6. **Move `stratupdate.md`** to archive and update archive index (File 8 — depends on step 1 read decision)
7. **Move `phase3_mt5_simulation_test.php`** to test directory (File 9 — independent of all doc steps)
8. **Update `.gitignore`** with log file patterns (File 6 — must commit before step 9)
9. **`git rm --cached` the five root log files** (File 7 — depends on step 8 being committed first)

### Dependency notes

- Steps 3 and 7 are independent and can run in parallel.
- Steps 4 and 5 are blocked until steps 2 and 3 complete respectively.
- Step 9 is hard-blocked on step 8 being in a committed state; do not run `git rm --cached` against files that are not yet covered by `.gitignore`.
- No code changes exist in this patch. No database migrations, no state migrations, no contract version bumps are required.
- The three new Phase 1 docs (step 3) carry no runtime dependency — they are read-only governance artifacts.

---

## 4. Regression guards

### Checks the implementation agent must run after patching

1. **Pipeline watcher test:** Run `scripts/pipeline-watcher.test.mjs` and confirm all tests pass. This verifies report ingestion and phase gate logic are unaffected by the archive move.
2. **Archive reference check:** After moving the eight Phase 0 files, grep the entire repository for each of the eight file names. Any hit that is not in the archive index itself must be resolved before merge.
3. **Migration-status.md link validation:** Verify all three new relative links in `migration-status.md` resolve to existing files.
4. **Gitignore coverage:** Run `git check-ignore -v` against each of the five log file names to confirm coverage.
5. **Git ls-files audit:** `git ls-files | grep "\.log"` — confirm no unintended log files remain tracked.
6. **Phase 0 canonical artifact present:** Confirm `phase0-soak-closeout-final-2026-05-15.md` is still in `phase-updates/` and was not moved.
7. **Test directory placement:** Confirm `phase3_mt5_simulation_test.php` exists at `wordpress/smc-superfib-sniper/tests/php/` and is absent from root.

### Existing protections that must still hold

- `.smc-workflow-state.json` workflow lock behavior must be undisturbed — no changes to that file.
- Phase gate logic in `migration-status.md` (Phase 2+ blocked until Phase 1 complete) must remain structurally intact; the reference link insertion must not alter the gate table.
- All Phase 0 parity audit files (`phase-0-watchlist-persistence-parity-2026-05-15.md`, `phase-0-full-parity-2026-05-14.md`, `phase-0-pine-backend-parity-2026-05-14.md`) must remain in place and unmodified.
- `PHASE0_SOAK_TRACKER.md` must remain accessible for Phase 1 reference (do not archive without an explicit decision — research report marks it as "review whether active"; leave it in place until that review produces a concrete decision).

### Parity re-validations

None required. This patch contains no code changes. Phase 0 parity (100%) is complete and untouched. Phase 1 parity validation is a Phase 1 gate, not a dependency of this documentation patch.

### Logging and diagnostics after patch

- The three new Phase 1 docs should each carry a `Last-Updated` header that the migration manager agent can parse.
- The archive index (`ARCHIVE_INDEX.md`) must log the move date (2026-05-15) and the supersession reference for each file.

---

## 5. Non-goals

**Explicitly out of scope for this patch:**

- Any modification to MT5 `.mqh` files, `SMC_MarketDataEA.mq5`, or any backend PHP or WordPress plugin code
- Any modification to Pine source (`SMC_SuperFib_v13.1.3.pine`)
- Any modification to `src/` frontend code, hooks, selectors, or API field names
- Moving or restructuring `reports/snapshots/` dated subdirectories — research confirms this requires a script audit that is not yet complete; deferred to a separate story
- Reorganizing `.artifacts/logs/` directory structure — same reason; deferred
- Modifying CI pipeline YAML beyond what is required to fix a reference broken by the `phase3_mt5_simulation_test.php` move
- Deleting any file rather than archiving it
- Writing Phase 2 through Phase 10 roadmaps — out of scope; Phase 1 docs are the explicit deliverable
- Quantifying or rewriting Phase 1 acceptance thresholds beyond what is already stated in `migration-status.md`; invent nothing
- Changing the format or structure of `.github/agents/migration-project-manager.agent.md`

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Consolidating `migration-status.md` and the new tracker into a single file — tempting but breaks the agent ingestion path; separate files are intentional
- Deleting `PHASE0_SOAK_TRACKER.md` without a formal review decision — it may contain active references not visible in the research report
- Adding `.gitignore` rules broad enough to cover subdirectories (e.g., `**/*.log`) — too wide; could suppress intentionally tracked diagnostic logs in `tests/` or `scripts/`
- Renaming any file that already appears in `migration-status.md` phase gate tables

---

## 6. Risk assessment

### Worst-case failure mode if patched incorrectly

If the archive move is executed before the reference audit completes, the migration manager agent or `scripts/pipeline-watcher.js` could fail to locate expected files by path, silently dropping phase gate evaluations or producing false-complete signals. This would not corrupt live data but would corrupt the project's automated governance layer.

### User-visible failure mode

No user-visible frontend or signal behavior is affected. The risk is entirely internal to the project management and CI automation layer. A broken pipeline watcher would manifest as stale phase status in automated reports, not as a dashboard or trading error.

### Backend authority and stale-state risks

None. This patch touches no code that produces, transforms, or caches market data, signals, or session states. Backend authority is fully preserved.

### Human approval required before merge

**Yes — required for two reasons:**

1. The archive folder move (File 4) must be approved after the reference audit result is reviewed. If any script reference is found, the stub strategy must be confirmed before merge.
2. The three Phase 1 documents (Files 1, 2, 3) should be reviewed by Track A and Track B leads for accuracy of acceptance thresholds before the docs are merged as authoritative. If a threshold is stated incorrectly in the roadmap, it becomes the formal standard.

---

## 7. Test requirements

### Tests to add

- **`scripts/pipeline-watcher.test.mjs` — add one test case:** Assert that the pipeline watcher correctly resolves the archive folder as non-active (i.e., files in `.github/migration/archive/` do not trigger phase gate evaluation as if they were active phase-update reports). This guards against the archive folder being misread as a new phase-update batch.

### Existing tests that must still pass

- All existing `scripts/pipeline-watcher.test.mjs` tests (report ingestion, phase gate logic)
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` — must continue to pass (file is not moved; verify it is not accidentally caught in any `.gitignore` rule change)
- `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` — same
- `src/hooks/useSniperData.test.tsx` — same
- `src/hooks/useSniperData.watchlist.test.tsx` — same

### Manual checks required

1. After creating the three Phase 1 docs, open each in a markdown renderer and confirm section headers, checklist syntax, and relative links render correctly.
2. After archive move, manually navigate to `.github/migration/phase-updates/` and confirm only active, non-superseded Phase 0 files remain alongside the canonical closeout artifact.
3. After `.gitignore` update and `git rm --cached`, run `git status` and confirm no unintended files appear as untracked or newly staged.

### Soak, replay, or live-environment verification

None required. This patch is documentation-only. No live-environment verification is applicable.

---

## 8. Implementation handoff

### Branch naming recommendation

```
docs/phase0-verification-phase1-roadmap-2026-05-15
```

### Suggested commit grouping

| Commit | Contents |
|--------|----------|
| 1 | Create `PHASE1_BRIDGE_ROADMAP.md`, `PHASE1_TRACKER.md`, `PHASE1_CHECKLIST.md` |
| 2 | Update `migration-status.md` with reference links to new Phase 1 docs |
| 3 | Create archive directory; move eight superseded Phase 0 checkpoints; add `ARCHIVE_INDEX.md` |
| 4 | Resolve `stratupdate.md` (archive with note, or absorb content then archive) |
| 5 | Move `phase3_mt5_simulation_test.php` to `tests/php/`; update CI reference if applicable |
| 6 | Update `.gitignore` with log file patterns; `git rm --cached` five root log files |

Keep commits 1 and 2 together if desired (they are tightly coupled). Commits 3–6 are independent and order-stable after commit 2.

### Required artifacts after implementation

- PR body must list all files moved to archive and confirm the reference audit result (zero references found, or references found and stubs added)
- PR body must confirm `scripts/pipeline-watcher.test.mjs` passed with the new archive test case
- PR body must include a link to the three new Phase 1 docs for Track A and Track B review
- Migration manager agent should auto-ingest the new Phase 1 docs on merge; confirm ingestion in the first post-merge agent run

### State transition

```
READY_FOR_IMPLEMENTATION
editing_locked=false
```
