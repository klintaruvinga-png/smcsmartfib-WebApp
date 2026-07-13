# SMC SuperFIB — Plan Card Redesign: Hardened Implementation Contract

---

## 1. Issue validation

**Confirmed**

- The current `src/routes/plan.tsx` renders a single hero candidate selected through a fallback chain of successive `find()` calls over a deduplicated, sorted signal list. This architecture cannot support a top-3 ranked multi-card layout without structural change.
- The ranking contract is resolved: use the existing letter/verdict metric already present in `plan.tsx`. No new metric is introduced.
- The design contract is resolved: one compact unified container per candidate, dense institutional layout as described in the handoff package.
- Candidates without an associated ladder/plan object must be excluded from rendered cards. The plan page is an execution surface and must not fabricate plan values.

**Likely**

- `src/routes/-plan.test.tsx` will require new test cases for watchlist scoping, top-3 limit, verdict-led ranking, and plan-object inclusion guard. Existing tests may already cover single-candidate rendering and will need to be preserved or extended.

**Unconfirmed**

- Whether `useCanonicalWatchlist()` is already imported in `plan.tsx`. The research report confirms it is canonical in `signals.tsx` but does not state its import status in `plan.tsx`. This must be verified before implementation begins; do not assume it is already wired.
- Whether the existing ladder/plan data shape in `plan.tsx` exposes all fields required by the new card sections (E1/E2/E3 entry columns, TP1/TP2/TP3 RR values, drawdown impact). Implementation agent must audit the existing data access patterns before adding new field references.

**Rejected hypotheses**

- None to reject. The research report is well-constrained and the root cause is confirmed.

---

## 2. Implementation contract

### File 1 — `src/routes/plan.tsx`

**Exact location to modify:** The candidate resolution block — specifically the section that calls successive `find()` operations to select a single winner from the sorted, deduplicated signal list.

**Exact change required:**

1. Replace the single-winner fallback chain with a stable full-array ranking function that applies the following tie-break order to the filtered candidate pool:
   - Primary: existing verdict/letter rank (same metric already used)
   - Secondary: `backendConfirmed === true` over `false`
   - Tertiary: `status === "READY"` over lower states
   - Quaternary: candidate with a ladder/plan object over candidate without one
   - Final: preserve existing relative order if still tied
2. Filter the ranked array to include only candidates in the current canonical watchlist (via `useCanonicalWatchlist()` — import it if not already present; mirror the pattern from `signals.tsx`, do not reinvent it).
3. Further filter to include only candidates that have a non-null, non-undefined ladder/plan object. Do not fabricate or default-construct plan values.
4. Take the top 3 from the resulting filtered, ranked array. If fewer than 3 pass the filter, render fewer than 3 cards.
5. Replace the existing single hero card render with a mapped render of up to 3 compact plan card components (see File 2 below), passing each candidate's existing data shape unchanged.

**Guard rails — must not change:**

- Verdict generation logic
- Ladder calculation logic
- API contracts and API field names
- Execution CTA wiring and backend execution endpoint behavior
- Backend-confirmed vs frontend-computed warning display
- Incomplete-plan warning behavior when a candidate has a blueprint but the plan is incomplete
- The deduplication and initial sort that currently precede the `find()` chain — these remain as the pre-processing step before the new ranking function

**Why this file is in scope:** It is the only file that owns the candidate selection and rendering pipeline for the plan page.

**Acceptance criterion:** Given a canonical watchlist of N candidates (N ≥ 3) where at least 3 have ladder/plan objects, the page renders exactly 3 compact cards ranked by verdict metric. Given fewer than 3 eligible candidates with plan objects, the page renders that exact count with no placeholder cards.

---

### File 2 — New component: `src/routes/plan.tsx` (inline) or `src/components/PlanCard.tsx`

**Decision point for implementation agent:** If the card markup is simple enough to inline within the mapped render in `plan.tsx`, keep it inline. If it exceeds a reasonable inline threshold (roughly 80–100 lines), extract it as `src/components/PlanCard.tsx`. Do not create a new file speculatively — make this call based on actual line count.

**Exact change required:** Implement the compact card layout as specified in the handoff package design contract:

- **Header strip:** verdict badge, symbol, direction badge, status badge, live/freshness badge, signal ID, relative time, source/family pills — all sourced from existing data fields already present on the candidate object
- **Mid-strip:** current price, backend/source chip, backend-confirmation chip — sourced from existing fields; do not add new API fields
- **Entries section:** E1/E2/E3 rows with Entry, Lot Sizing, SL, TP columns — sourced from existing ladder/plan data
- **Targets section:** TP1/TP2/TP3 with RR values — sourced from existing ladder/plan data
- **Stop & Risk section:** SL, risk, drawdown impact using backend-authoritative values only
- **Ladder Status section:** state chip and E1/E2/E3 status chips — render only if the existing data shape supports it; do not fabricate
- **Footer:** existing send-to-execution behavior preserved exactly; copy kept compact

**Guard rails — must not change:**

- No new backend fields may be introduced to satisfy card display requirements
- If an existing field is absent on a given candidate, the cell renders empty or a dash — no fabricated fallback values
- Execution button must wire to the same handler and endpoint as the current single-card implementation

**Why this file is in scope:** The new card layout is the primary visual deliverable of this issue.

**Acceptance criterion:** Each rendered card displays all sections without errors when fed a candidate with a complete plan object. Sections that rely on fields absent from the data shape render gracefully (empty/dash) without throwing.

---

### File 3 — `src/routes/-plan.test.tsx`

**Exact location to modify:** Existing test suite for `plan.tsx`.

**Exact change required:** Add the following test cases (see Section 7 for full test requirements). Do not remove or weaken existing tests.

**Guard rails — must not change:**

- Existing single-candidate rendering tests must remain passing or be explicitly migrated to the new multi-card contract with documented rationale
- Existing incomplete-plan warning tests must remain passing unchanged

**Why this file is in scope:** The ranking, filtering, and inclusion logic introduced in File 1 carries regression risk and must be covered by automated tests.

**Acceptance criterion:** All new test cases pass. All existing tests pass or are documented as intentionally migrated.

---

## 3. Patch sequence

1. **Audit data shape** (no code change) — Before writing a line, the implementation agent must confirm: (a) whether `useCanonicalWatchlist()` is already imported in `plan.tsx`; (b) whether the existing ladder/plan data shape exposes all fields referenced in the new card sections. Document any gaps found. This is a prerequisite for all subsequent steps.

2. **Implement the ranked array function** in `plan.tsx` — Replace the single-winner fallback chain with the stable full-array ranking, watchlist filter, plan-object filter, and top-3 slice. At this point the existing single card render still runs; pass only `candidates[0]` to it temporarily if needed to keep the page functional during development.

3. **Implement the compact card layout** — Build the new card component (inline or extracted per the decision rule above). Wire it to receive a single candidate's existing data shape. Do not change data access patterns.

4. **Replace the render call** — Swap the single hero card render for the mapped multi-card render over the top-3 array.

5. **Preserve and extend tests** — Update `src/routes/-plan.test.tsx` with all required new cases (Section 7). Confirm existing tests pass.

**Dependencies:**

- Step 3 depends on Step 1 completing the data-shape audit; no new field references may be added until the audit confirms the field exists
- Step 4 depends on Step 3 completing the card component
- Step 5 may begin in parallel with Steps 3–4 for the new test stubs, but assertions must be written against the completed implementation

**Sequencing risks:**

- No database migrations, cache invalidations, or API contract changes are involved
- No state management changes are involved; this is a pure render-layer change
- The only sequencing risk is introducing the new card render before the ranking function is stable, which could temporarily expose unsorted or unfiltered candidates — mitigated by the temporary `candidates[0]` passthrough in Step 2

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

- Render the plan page with a canonical watchlist of 5 candidates where 4 have plan objects — confirm exactly 3 cards render
- Render the plan page with a canonical watchlist of 2 candidates where both have plan objects — confirm exactly 2 cards render with no placeholder third card
- Render the plan page with a candidate that has a blueprint but an incomplete plan — confirm the existing incomplete-plan warning still displays within that card
- Render the plan page with a `backendConfirmed=true` candidate ranked lower by verdict than a `backendConfirmed=false` candidate — confirm verdict rank takes precedence
- Confirm the execution button on each card fires the same endpoint and handler as before
- Confirm no backend-confirmed vs frontend-computed warnings are suppressed or repositioned

**Existing protections that must still hold:**

- Backend-confirmed warning display
- Incomplete-plan warning display
- Execution CTA wiring and endpoint
- Verdict/letter metric is read-only from the implementation's perspective — not modified

**Parity re-validations:**

- No Pine or MT5 parity impact; this is a pure dashboard render-layer change
- Backend API contracts are not touched; no backend parity validation required

**Logging/diagnostics after patch:**

- No new logging is required
- If the implementation agent adds any `console.warn` for missing fields during development, those must be removed before merge

---

## 5. Non-goals

**Explicitly out of scope:**

- Changing verdict generation, scoring, or letter metric calculation
- Changing ladder or plan math
- Adding new API fields or modifying existing API contracts
- Adding new backend endpoints or modifying existing ones
- Changing the canonical watchlist semantics — mirror `signals.tsx`, do not reinvent
- Adding animations, transitions, or skeleton loaders beyond what the design contract specifies
- Responsive/mobile layout changes not described in the design contract
- Pagination or infinite scroll for more than 3 candidates
- User-configurable card ordering or column visibility
- Drag-and-drop or card reordering

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Refactoring the shared signal deduplication or sort logic used by both `plan.tsx` and `signals.tsx` — high blast radius, not required here
- Extracting a shared `useRankedCandidates` hook shared between plan and signals routes — a valid future refactor, but widening scope in this patch risks regressions in `signals.tsx`
- Adding a "no candidates" empty-state illustration or full empty-state redesign — out of scope unless it was already present
- Pulling in any new UI library components not already used in the codebase

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

The ranking function silently changes candidate selection semantics — for example, by modifying the deduplication step or the initial sort — causing a different candidate to appear at position 1 than would have appeared in the previous single-winner view. A user acts on the wrong candidate's execution plan.

**User-visible failure mode:**

The plan page renders a candidate ranked below the correct top signal, or renders a candidate not on the canonical watchlist, or renders a card with fabricated/defaulted plan values that do not reflect backend-authoritative data.

**Backend authority and stale-state risks:**

Low. This patch does not touch data fetching, caching, or API contracts. The risk is confined to the render layer. However, if the implementation agent reads a field from the candidate object that is only populated on the frontend (not backend-confirmed), and uses it as a primary sort key, backend authority could be silently undermined. The guard: use only the existing verdict/letter metric as the primary rank — this metric is already in use and its authority is known.

**Whether human approval should be required before merge:**

**Yes.** This is a visible redesign of the plan page, which is an execution surface. A human reviewer must confirm: (a) the top-3 ranking produces the expected candidates against a live or realistic fixture; (b) the execution CTA behavior is unchanged; (c) no backend-authoritative values have been replaced with frontend-computed defaults.

---

## 7. Test requirements

**Tests to add in `src/routes/-plan.test.tsx`:**

1. **Watchlist scoping** — Given candidates both inside and outside the canonical watchlist, assert only watchlist members appear in the rendered output.
2. **Top-3 limit** — Given 5 eligible watchlist candidates with plan objects, assert exactly 3 cards render.
3. **Fewer-than-3 case** — Given 2 eligible watchlist candidates with plan objects, assert exactly 2 cards render.
4. **Verdict-led ranking** — Given candidates with differing verdict ranks, assert the card at position 0 has the highest verdict rank.
5. **Full-array ranking, not first-match** — Assert that the ranking considers all candidates before selecting top 3, not just the first match found.
6. **Plan-object inclusion guard** — Given a candidate on the watchlist but without a ladder/plan object, assert it does not appear in the rendered cards.
7. **Incomplete-plan warning preservation** — Given a candidate with a blueprint but an incomplete plan, assert the warning still renders within its card.

**Existing tests that must still pass:**

- All existing tests in `src/routes/-plan.test.tsx` must pass or be explicitly migrated with documented rationale.
- Execution CTA behavior tests must pass unchanged.
- Backend-confirmed warning tests must pass unchanged.

**Soak / live-environment verification:**

- After merge, manually verify the plan page against a live canonical watchlist session to confirm the top-3 candidates match expected ranking and all card sections render with real data.
- No automated soak test is required; manual spot-check on staging or live is sufficient given the render-layer-only scope.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`codex/redesign-plan-cards-compact-top3`

**Suggested commit grouping:**

1. `feat(plan): replace single-winner fallback chain with ranked top-3 array` — covers the ranking, filtering, and slice logic in `plan.tsx`
2. `feat(plan): implement compact unified plan card layout` — covers the new card component/markup
3. `test(plan): add watchlist scoping, top-3, ranking, and inclusion guard cases` — covers all new test cases in `-plan.test.tsx`

**Required artifacts after implementation:**

- The implementation agent must confirm in the PR body: (a) which fields from the data-shape audit were present and which were absent; (b) the decision made on inline vs extracted card component with line-count justification; (c) a manual spot-check result confirming top-3 candidates render correctly against a realistic fixture or live session.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
