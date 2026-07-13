# SMC SuperFIB - Claude Plan Hardening Request

## 1. Issue validation

**Confirmed**
- `PHASE3_IMPLEMENTATION.md` does not exist in the repository root. The research report cites direct absence; no alternative path or alias is hypothesised.
- `.github/migration-status.md` records Phase 3 status as `NOT-STARTED`. This is a hard gating state: no branch, no owner assignment, no active checklist.
- `PHASE3_TESTING_GUIDE.md` exists and defines the Phase 3 scope (MT5 EA → backend market-data handoff), confirming the planning gap is in implementation documentation, not test coverage.

**Likely**
- No active branch for Phase 3 work has been created. The research report asserts this but does not show `git branch -a` output. It is consistent with `NOT-STARTED` status but is inferred, not directly observed.

**Unconfirmed**
- Whether `mt5-phase3` is the correct branch name. `.github/migration/README.md` documents the convention as `mt5-phase-[X]-[feature]`, which would produce `mt5-phase-3-kickoff` or similar — not the bare `mt5-phase3` suggested in the research report. This discrepancy must be resolved before branch creation by reading `.github/migration/README.md` verbatim.
- Whether Track A and Track B owner identities are already recorded anywhere in the repository or must be provided externally. The research report names the tracks but not the individuals.

**Root cause (confirmed):** Phase 3 advancement is blocked because the implementation planning artifact (`PHASE3_IMPLEMENTATION.md`) and its corresponding active branch do not exist. The issue is entirely governance and documentation, not a code defect.

---

## 2. Implementation contract

### File 1 — `PHASE3_IMPLEMENTATION.md` (new file, repository root)

- **Section to create:** entire file; no existing content to preserve
- **Exact change required:**
  - H1 title: `Phase 3 Implementation Plan — MT5 EA to Backend Market-Data Handoff`
  - Owner table: Track A owner (name TBD from team, not to be invented by the implementation agent) and Track B owner (same constraint)
  - Phase scope section: copied verbatim from `PHASE3_TESTING_GUIDE.md` scope paragraph — do not paraphrase or expand
  - Implementation checklist: items derived only from deliverables explicitly listed in `PHASE3_TESTING_GUIDE.md` and `.github/migration-status.md`; no speculative items
  - Phase gate section: reference the acceptance criteria already recorded in `PHASE3_TESTING_GUIDE.md`; do not add new criteria
  - Status line: `Status: NOT-STARTED` at document creation; to be updated by the owning track, not by this patch
- **Guard rails:**
  - Must not copy or duplicate content from Phase 1 or Phase 2 implementation artifacts
  - Must not introduce new acceptance criteria that are not already evidenced in existing Phase 3 docs
  - Must not record owner names speculatively; leave owner fields as `[Track A Lead — assign before merge]` and `[Track B Lead — assign before merge]` if identities are not available
  - Must not alter `PHASE3_TESTING_GUIDE.md`
- **Why in scope:** this is the primary missing artifact the issue requests; its absence is the confirmed root cause
- **Acceptance criterion:** `PHASE3_IMPLEMENTATION.md` exists at the repository root, contains an owner table with at least placeholder assignments, contains a checklist with at least one item per Phase 3 deliverable identified in existing docs, and does not contradict any statement in `PHASE3_TESTING_GUIDE.md`

---

### File 2 — `.github/migration-status.md`

- **Section to modify:** Phase 3 status row
- **Exact change required:** update Phase 3 status from `NOT-STARTED` to `IN-PROGRESS` after `PHASE3_IMPLEMENTATION.md` is merged and the active branch is created; record the branch name in the Phase 3 row
- **Guard rails:**
  - Must not alter Phase 1 or Phase 2 rows
  - Must not change ownership attribution for any other phase
  - Must not alter the gating conditions for Phase 3 completion — only the current status field changes
  - The migration status board structure (columns, formatting conventions) must be preserved exactly
- **Why in scope:** `.github/migration-status.md` is the authoritative phase gate tracker; leaving it at `NOT-STARTED` after the branch and plan exist would create a false governance signal
- **Acceptance criterion:** Phase 3 row reflects `IN-PROGRESS` and records the correct branch name matching `.github/migration/README.md` naming convention

---

## 3. Patch sequence

1. **Read `.github/migration/README.md` verbatim** — resolve the branch naming convention before any branch is created; the research report's `mt5-phase3` does not match the documented `mt5-phase-[X]-[feature]` pattern and must not be used without confirmation
2. **Read `PHASE3_TESTING_GUIDE.md` verbatim** — extract all Phase 3 deliverables and acceptance criteria; these are the only permitted source for checklist items in `PHASE3_IMPLEMENTATION.md`
3. **Read `.github/migration-status.md`** — confirm current Phase 3 row format and status value before editing
4. **Create branch** — name derived from the confirmed convention in step 1; branch from `main` unless `.github/migration/README.md` explicitly specifies a different base for Track A Phase 3 work
5. **Create `PHASE3_IMPLEMENTATION.md`** — using content bounded by steps 2 and 3; owner fields as placeholders if identities are unknown
6. **Update `.github/migration-status.md`** — Phase 3 status to `IN-PROGRESS`, branch name recorded
7. **Commit and push**

**Dependencies:**
- Step 4 (branch creation) depends on step 1 (naming resolution)
- Step 5 (file content) depends on step 2 (scope extraction)
- Step 6 (status update) depends on step 4 (branch name must be known)
- Step 6 must not precede step 5 — the status must not advance before the plan artifact exists in the same commit or a prior commit on the branch

**Sequencing risk:** if the implementation agent creates the branch with the wrong name, renaming it after the status board has recorded it requires a second status edit; prefer to confirm the name before any branch operation.

---

## 4. Regression guards

- **`PHASE3_TESTING_GUIDE.md` must be unmodified** — diff the file before and after the patch; any change is a regression
- **`.github/migration/README.md` must be unmodified** — this file defines the branch naming contract; it is a read source only
- **Phase 1 and Phase 2 rows in `.github/migration-status.md` must be unmodified** — the patch touches exactly one row
- **No existing Phase 3 content must be contradicted** — cross-check all statements in `PHASE3_IMPLEMENTATION.md` against `PHASE3_TESTING_GUIDE.md`; any contradiction is a regression in governance documentation
- **Branch naming must comply with the documented convention** — after branch creation, verify the branch name against the pattern in `.github/migration/README.md`
- **No code files may be touched** — this patch is documentation-only; any diff touching `.js`, `.ts`, `.py`, `.mq5`, or config files outside `.github/` is out of scope and must be reverted

**Logging/diagnostics after patch:** no runtime diagnostics are applicable; the post-patch artifact check is a human review of `PHASE3_IMPLEMENTATION.md` content against `PHASE3_TESTING_GUIDE.md` for completeness and consistency.

---

## 5. Non-goals

- **No code changes of any kind** — this patch does not touch MT5 EA code, backend services, frontend components, or Pine scripts
- **No new Phase 3 acceptance criteria** — the implementation agent must not invent checklist items not evidenced in existing documentation
- **No Phase 1 or Phase 2 artifact changes** — even if gaps are noticed, they are out of scope for this patch
- **No normalization of Phase 1–4 documentation** — Path B from the research report (audit all phases) is explicitly rejected; the issue is Phase 3 only
- **No owner identity resolution beyond placeholders** — the implementation agent must not assign real names without external confirmation
- **No migration-status.md structural changes** — column additions, schema changes, or formatting normalizations are out of scope
- **Do not create a draft PR** — CLAUDE.md requires a normal open PR; draft status would block the Codex review stage
- **Do not create `PHASE3_IMPLEMENTATION.md` at any path other than the repository root** — the research report confirms this is the correct location by analogy with existing phase artifacts

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
The implementation agent creates `PHASE3_IMPLEMENTATION.md` with speculative checklist items or invented acceptance criteria. If those items are treated as authoritative by Track A/Track B, they could set incorrect delivery expectations for Phase 3, causing misdirected engineering effort or a false completion gate.

**User-visible failure mode:**
Phase 3 branch opened under a non-compliant name causes confusion in the migration dashboard and breaks any automation or search that relies on the `mt5-phase-[X]-[feature]` pattern.

**Backend authority or stale-state risks:**
None. This patch is purely governance documentation. No runtime data, cache, or migration state is affected.

**Human approval required before merge:** Yes. The Phase 3 owner table must have real Track A and Track B lead names confirmed by a human before this PR merges. A checklist with placeholder owners is acceptable for the branch and PR, but the merge gate requires human sign-off on owner assignment. This is flagged in the research report and is upheld here.

---

## 7. Test requirements

**Tests to add or update:**
None. This patch creates documentation files only. No automated test suite covers governance markdown files.

**Existing tests or manual checks that must still pass:**
- Any CI lint rules applied to `.github/` markdown files (e.g., markdownlint) must pass on `PHASE3_IMPLEMENTATION.md` and on the edited `.github/migration-status.md`
- The existing Phase 3 test suite defined in `PHASE3_TESTING_GUIDE.md` must be unaffected; no test file is modified by this patch

**Manual verification required before merge:**
1. Human reviewer confirms the checklist in `PHASE3_IMPLEMENTATION.md` covers all Phase 3 deliverables listed in `PHASE3_TESTING_GUIDE.md`
2. Human reviewer assigns real Track A and Track B leads (replacing placeholders)
3. Human reviewer confirms branch name compliance with `.github/migration/README.md`
4. Human reviewer confirms `.github/migration-status.md` Phase 3 row accurately reflects the new state

**Soak, replay, or parity verification:** not applicable; no production runtime is affected.

---

## 8. Implementation handoff

**Branch naming recommendation:**
Resolve the exact pattern from `.github/migration/README.md` before creating the branch. If the convention is `mt5-phase-[X]-[feature]`, the correct name is `mt5-phase-3-kickoff`. Do not use the bare `mt5-phase3` from the research report unless the README explicitly permits that form.

**Suggested commit grouping:**
- Commit 1: `docs: add PHASE3_IMPLEMENTATION.md with initial checklist and owner placeholders`
- Commit 2: `chore(migration): advance Phase 3 status to IN-PROGRESS in migration-status.md`

Keep commits separate so the plan artifact and the status update are independently reviewable and revertable.

**Required reports or artifacts after implementation:**
- PR body must include: the two files changed, the open unknowns resolved (branch naming, owner assignment), confirmation that `PHASE3_TESTING_GUIDE.md` was not modified, and the human review checklist for owner sign-off
- No additional implementation report is required beyond the standard PR body per CLAUDE.md

**State transition:**
`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
