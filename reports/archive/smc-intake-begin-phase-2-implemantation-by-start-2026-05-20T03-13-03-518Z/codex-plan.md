# SMC SuperFIB — Phase 2 Implementation Plan

---

## 1. Issue validation

**Confirmed**

- Phase 1 bridge validation is complete. `POST /ea/market-stream` is operational, auth is passing, and the 48h continuity gate has been recorded. This is not in dispute.
- Phase 2 status in `.github/migration-status.md` is `NOT-STARTED`. No unified readiness package exists that binds MT5 EA payload shape, backend ingestion interface, and dashboard instrumentation contract into a single reviewable artifact.
- `PHASE2_IMPLEMENTATION.md` lists Phase 2 deliverables at a high level but does not capture the telemetry payload schema, acceptance criteria, or cross-track parity requirements in sufficient detail to hand off to an implementation agent.

**Likely**

- The backend has not yet exposed a dedicated Phase 2 ingestion path beyond the existing `POST /ea/market-stream`. The `GET /wp-json/sniper/v1/market-data-authority` endpoint referenced in `PHASE2_IMPLEMENTATION.md` may not be implemented yet or may exist as a stub.
- Dashboard panels for live positions, P/L, and account metrics likely rely on the existing `sniperClient.ts` API client but have no confirmed read-only authority contract documented against Phase 2 expectations.

**Unconfirmed**

- Whether any frontend section still carries auth/write-authority assumptions that would conflict with a read-only telemetry posture.
- Whether `mt5/MarketDataEngine.mqh` introduces payload fields beyond those currently consumed by `POST /ea/market-stream`.
- Whether Track A, B, and C owners have agreed on a canonical telemetry field set for Phase 2.

**Corrected root cause framing:** This is not a code defect. It is a planning-artifact gap. The transition from Phase 1 bridge validation to Phase 2 read-only telemetry requires a unified contract document before any implementation agent touches source code. The implementation task for this plan is the production of that contract, not source-code modification.

---

## 2. Implementation contract

### File 1: `reports/codex-plan.md`

- **Section to produce:** This document itself.
- **Exact change:** Create as a new artifact from this plan.
- **Guard rails:** Must not propose code changes. Must not expand scope to Phase 3 or beyond.
- **Why in scope:** It is the required output artifact of the planning phase.
- **Acceptance criterion:** Document exists, is complete per template, and is ready for Track A/B/C owner review.

---

### File 2: `PHASE2_IMPLEMENTATION.md`

- **Section to modify:** Acceptance criteria section (or create one if absent).
- **Exact change:** Add a Phase 2 Acceptance Criteria block containing:
  - Exact JSON payload schema expected from MT5 EA on `POST /ea/market-stream` for Phase 2 trade telemetry events.
  - Exact fields the backend must persist per ingestion event (position ID, symbol, direction, entry price, SL, TP, volume, timestamp, EA version).
  - Exact dashboard panels that must render from read-only authority only (no write-path dependency).
  - Definition of "read-only authority": dashboard consumes `GET /wp-json/sniper/v1/market-data-authority` and must not mutate trade state.
- **Guard rails:** Do not remove existing Phase 2 deliverable descriptions. Do not add Phase 3 deliverables. Do not change the file's Phase 1 retrospective content.
- **Why in scope:** The file is the canonical Phase 2 scope document and currently lacks acceptance criteria.
- **Acceptance criterion:** A reviewer reading only `PHASE2_IMPLEMENTATION.md` can determine whether a Phase 2 implementation is complete without consulting any other document.

---

### File 3: `.github/migration-status.md`

- **Section to modify:** Phase 2 row and Track C (Dashboard) entry.
- **Exact change:**
  - Update Phase 2 status from `NOT-STARTED` to `PLANNING-IN-PROGRESS`.
  - Add a `Readiness package target` field pointing to `PHASE2_IMPLEMENTATION.md`.
  - Add a `Prerequisite verified` field noting Phase 1 48h continuity gate passed on `2026-05-18`.
  - Update Track C deferred note: replace open-ended deferral with a concrete prerequisite — "deferred until Phase 2 telemetry contract is signed off by Track A and Track B owners."
- **Guard rails:** Do not alter Phase 1 status rows. Do not mark Phase 2 as `IN-PROGRESS` or `COMPLETE`. Do not remove Track C deferral — only sharpen its precondition.
- **Why in scope:** It is the single authoritative status document; its Phase 2 row is stale.
- **Acceptance criterion:** `migration-status.md` reflects the current planning state and does not overstate Phase 2 progress.

---

### File 4: `.github/migration/PHASE1_TRACKER.md`

- **Section to modify:** Phase 1 closeout section (final entry).
- **Exact change:** Add a one-line closeout note: `Phase 1 bridge validation COMPLETE as of 2026-05-18. 48h continuity gate passed. Phase 2 planning handoff initiated.`
- **Guard rails:** Do not alter any existing Phase 1 tracker entries. Do not add Phase 2 planning content to this file — that belongs in `PHASE2_IMPLEMENTATION.md`.
- **Why in scope:** Phase 1 tracker must formally record the transition event so the migration audit trail is unbroken.
- **Acceptance criterion:** Any reviewer reading `PHASE1_TRACKER.md` can confirm Phase 1 is closed and Phase 2 planning has been triggered.

---

### Files NOT in scope for this patch

- `mt5/SMC_MarketDataEA.mq5`
- `mt5/MarketDataEngine.mqh`
- `src/lib/api/sniperClient.ts`
- Any backend PHP plugin files
- Any frontend dashboard route or panel component files

These files must be read during Phase 2 contract verification but must not be modified in this planning patch.

---

## 3. Patch sequence

1. **Close Phase 1 tracker** — add closeout note to `.github/migration/PHASE1_TRACKER.md`. No dependencies.
2. **Update migration status** — update `.github/migration-status.md` Phase 2 row and Track C entry. Depends on step 1 being complete so the prerequisite date is confirmed.
3. **Produce Phase 2 acceptance criteria** — add acceptance criteria block to `PHASE2_IMPLEMENTATION.md`. Depends on step 2 so the status document is consistent with the criteria being added.
4. **Verify artifact consistency** — manually confirm all three files are internally consistent (phase status, acceptance criteria, and tracker closeout all agree on the same timeline and preconditions). No code merge until this check passes.

**Sequencing risk:** Steps 1–3 are documentation-only. There is no migration, cache, or contract sequencing risk for this patch. The risk is editorial: if the acceptance criteria added in step 3 contradict the existing Phase 2 deliverable list, the document becomes ambiguous. The implementation agent must read the existing `PHASE2_IMPLEMENTATION.md` deliverable list in full before writing the acceptance criteria block.

---

## 4. Regression guards

**Checks to run after patching:**

- Confirm `POST /ea/market-stream` route behavior is unchanged. Run the existing Phase 1 auth and payload validation smoke test. No regression acceptable.
- Confirm `.github/migration-status.md` Phase 1 status rows are unmodified. Diff the file against the pre-patch state and verify only Phase 2 and Track C rows changed.
- Confirm `PHASE1_TRACKER.md` existing entries are unmodified. Only the final closeout line should appear as an addition.

**Existing protections that must still hold:**

- Backend authority contract: `POST /ea/market-stream` remains the only write-path for EA telemetry. Nothing in this planning patch touches that route.
- Auth semantics: existing API key validation for the market-stream route must remain in effect. This patch produces no backend code.
- Stale-data protection: dashboard must not be granted write authority in Phase 2 contract. The acceptance criteria block in `PHASE2_IMPLEMENTATION.md` must explicitly state read-only constraint.

**Parity re-validations required:**

- After `PHASE2_IMPLEMENTATION.md` is updated, a human reviewer from Track A (MT5/Backend) must confirm the telemetry field set matches what `mt5/SMC_MarketDataEA.mq5` currently emits on the market-stream path.
- A human reviewer from Track C (Dashboard) must confirm the read-only authority panel list matches the panels currently planned or partially built.

**Logging and diagnostics:**

- No new logging is introduced by this patch. The patch is documentation-only.
- After the patch, the implementation agent should confirm that the Phase 2 readiness package is linked from the project's top-level README or equivalent entry point so it is discoverable without navigating `.github/`.

---

## 5. Non-goals

**Out of scope for this patch:**

- Any modification to `mt5/SMC_MarketDataEA.mq5` or `mt5/MarketDataEngine.mqh`.
- Any modification to `src/lib/api/sniperClient.ts` or any frontend component.
- Any modification to backend PHP plugin files.
- Defining or registering the `GET /wp-json/sniper/v1/market-data-authority` endpoint — that is Phase 2 source-code work, not this planning patch.
- Auditing whether existing dashboard panels have undocumented write-authority assumptions — that audit belongs in Phase 2 implementation, not in the readiness package produced here.
- Phase 3 planning or scope definition.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not attempt to reconcile `MarketDataEngine.mqh` payload fields with the backend schema in this patch. The fields are not confirmed and premature alignment risks constraining Phase 2 implementation incorrectly.
- Do not add a Phase 2 branch to `migration-status.md` with sub-track breakdowns until Track A/B/C owners have reviewed the acceptance criteria. A premature breakdown will be wrong and will require correction mid-implementation.
- Do not update `PHASE2_IMPLEMENTATION.md` with implementation timelines or assignees. This plan does not have that information and fabricating it would create false governance state.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If the acceptance criteria block in `PHASE2_IMPLEMENTATION.md` documents the wrong telemetry field set — for example, fields that `mt5/SMC_MarketDataEA.mq5` does not emit or that the backend does not persist — the Phase 2 implementation agent will build against a phantom contract. The result would be a dashboard that renders fields the backend never populates, producing silent nulls or stale-data displays that are not caught until live EA telemetry is flowing.

**User-visible failure mode:**

Dashboard panels for live positions, P/L, or account metrics display empty or zero values during Phase 2 testing, with no error surfaced. Root cause would be invisible to the user because the data path appears healthy but the contracted fields do not match the actual payload.

**Backend authority or stale-state risks:**

This planning patch introduces no code changes and therefore carries no direct backend authority or stale-state risk. The risk is entirely forward-looking: if the contract produced here is wrong, Phase 2 source-code implementation will build a broken telemetry pipeline. This is why Track A and Track B human review of the acceptance criteria is required before Phase 2 source-code work begins.

**Human approval required before merge:**

Yes. This patch produces governance artifacts that will drive subsequent source-code implementation. Track A (MT5/Backend) and Track C (Dashboard) owners must review and sign off on `PHASE2_IMPLEMENTATION.md` acceptance criteria before this branch is merged to main.

---

## 7. Test requirements

**Tests to add or update:**

- No automated tests are added in this patch. The patch is documentation-only.
- After the acceptance criteria are written and reviewed, the Phase 2 source-code implementation plan (a future plan) must include tests for each acceptance criterion. Those tests are not in scope here.

**Existing tests or manual checks that must still pass:**

- Phase 1 auth and payload validation smoke test for `POST /ea/market-stream` must pass without modification.
- Any existing CI check that validates `.github/migration-status.md` format or required fields must pass after the Phase 2 row and Track C entry are updated.

**Soak, replay, parity, or live-environment verification:**

- No live-environment verification is required for a documentation-only patch.
- Before Phase 2 source-code implementation begins, the implementation agent must replay at least one live Phase 1 market-stream POST payload through the current backend and confirm the persisted fields match the telemetry field set specified in the Phase 2 acceptance criteria. This is a pre-implementation gate, not a post-patch gate for the current plan.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`phase2/planning-readiness-package`

**Suggested commit grouping:**

1. `docs: close Phase 1 tracker with handoff note` — commit containing only the `PHASE1_TRACKER.md` addition.
2. `docs: update migration-status for Phase 2 planning-in-progress` — commit containing only the `.github/migration-status.md` changes.
3. `docs: add Phase 2 acceptance criteria to PHASE2_IMPLEMENTATION.md` — commit containing the acceptance criteria block addition.

**Required reports or artifacts to generate after implementation:**

- A human-readable diff of the three changed files posted to the PR for Track A and Track C reviewer inspection.
- Confirmation that the Phase 2 acceptance criteria block has been read and acknowledged by at least one Track A owner (MT5/Backend) and one Track C owner (Dashboard) before merge approval.
- No `codex-implementation-report.md` is required for this patch because no source code was changed. A brief `codex-plan-handoff-note.md` in `reports/` confirming the artifact set is complete is sufficient.

**State transition:**

`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
