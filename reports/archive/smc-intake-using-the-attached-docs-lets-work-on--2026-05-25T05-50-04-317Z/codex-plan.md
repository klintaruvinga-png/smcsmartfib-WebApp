# SMC SuperFIB - Phase 3 Closeout Implementation Contract

## 1. Issue validation

**Confirmed**
- The Phase 3 72h soak baseline has a valid closeout checkpoint recorded at `25/05/2026, 06:17:21`. The checkpoint explicitly notes that 24h and 48h snapshot gates were not executed, and the 72h window acts as the terminal closeout event. This is confirmed by the soak report artifact dated 2026-05-25.
- The EA/backend bridge resumed snapshot updates after Sunday market open. 24 MT5 snapshot rows were updated post `2026-05-24 22:00:00`. 22 symbols returned `live`; 2 symbols (`US30`, `NAS100`) remained `offline`. Crypto symbols `BTCUSD`, `ETHUSD`, `SOLUSD` are all `live`. Root cause of offline symbols is broker/session availability, not an EA or backend bridge failure.
- The `MarketDataEngine.mqh` compile log records a clean build: 0 errors, 0 warnings, 7358 ms elapsed, cpu=`AVX2 + FMA3`. This is confirmed technical evidence and carries no ambiguity.
- Engine health metrics from the soak report are confirmed as the final Phase 3 snapshot.

**Likely**
- The `US30` and `NAS100` offline state reflects broker weekend/session scheduling rather than a regression. No evidence of a systemic failure was presented; offline count is limited to two equity indices.

**Unconfirmed**
- Whether the 24h and 48h snapshot gates were deliberately skipped or missed due to a tooling gap. The research report does not resolve this. This should be noted in the closeout record as a procedural observation, not a defect.

---

## 2. Implementation contract

### File: `reports/codex-plan.md`
- **Section to modify:** This file — created as the output artifact of this plan.
- **Change required:** None; this document is the output.
- **Guard rails:** No source code touched.
- **Why in scope:** Required output of the planning stage.
- **Acceptance criterion:** File exists, matches template, and is committed.

---

### File: `reports/phase3-closeout.md` *(new artifact)*
- **Exact path:** `reports/phase3-closeout.md`
- **Section to create:** New documentation artifact — Phase 3 Soak Closeout Record.
- **Exact change required:** Create this file with all six subsections below populated verbatim from confirmed evidence:

**§1 — 72h Soak Baseline Closeout**
Record the formal closeout checkpoint:
```
Checkpoint: 25/05/2026, 06:17:21
Gate: 24h and 48h snapshots not executed.
Disposition: 72h window acts as terminal closeout gate.
Status: CLOSED
```

**§2 — Engine Health Stats (Final Snapshot)**
Persist these exact values as the confirmed Phase 3 engine health baseline:
```
Feed status:           stale
Backend sync:          live
Engine run state:      live
Last batch:            25/05/2026, 06:17:14
Last engine run:       25/05/2026, 06:17:21
Watchlist count:       13
Snapshots 24h:         24
Candles 24h:           20,883
Engine runs 24h:       total=97,262 | success=951 | error=0
                       last=25/05/2026, 06:17:29
Audit events 24h:      total=299,028 | error=107,649 | warning=107,459
```

**§3 — SQL Snapshot Query Results (Crypto Weekend / Live / Offline / EA Resume)**
Record the following confirmed query evidence:
```
Query window:           Post 2026-05-24 22:00:00 (Sunday market open)
MT5 rows updated:       24
Symbols live:           22
Symbols offline:        2 (US30, NAS100)
Crypto live:            BTCUSD=live, ETHUSD=live, SOLUSD=live
EA resume verdict:      CONFIRMED — snapshot bridge resumed after Sunday open
Offline root cause:     Broker/session availability, not EA or backend failure
```

**§4 — EA Compile Log: MarketDataEngine.mqh**
Record the compile evidence verbatim:
```
File:           MarketDataEngine.mqh
Result:         SUCCESS
code generated: 0
Errors:         0
Warnings:       0
Elapsed:        7358 ms
CPU:            AVX2 + FMA3
```

**§5 — Phase 3 Audit Artifact Registry**
List all existing artifacts referenced in the closeout package:
```
- phase-3-stability-72h-2026-05-24.md     [ATTACHED]
- phase-3-stability-72h-2026-05-25.md     [ATTACHED]
- SQL logs Snapshot Queries.txt            [ATTACHED]
- MarketDataEngine.mqh compile log         [RECORDED INLINE §4]
```

**§6 — Outstanding Coverage Gaps (Carried from Phase 2 — Do Not Block Gate)**
```
GAP-01: Dedicated regime replay parity suite — NOT YET EXECUTED
GAP-02: Dedicated signal replay parity suite (multi-case, multi-pair) — NOT YET EXECUTED
GAP-03: Track lead assignments (TASK 10) — all three tracks remain TBD
Disposition: These gaps do not block the Phase 3 gate. They are recorded as
             known open items and must be addressed in Phase 4 planning.
```

- **Guard rails:** No source code. No schema changes. No API or selector modifications. No existing report files overwritten.
- **Why in scope:** All six content areas are confirmed by the research report. No speculative content is included.
- **Acceptance criterion:** File exists at `reports/phase3-closeout.md`, all six sections present, all values match confirmed evidence exactly, no values interpolated or inferred beyond what the research report states.

---

## 3. Patch sequence

1. **Create `reports/phase3-closeout.md`** — all six sections in order: baseline → engine health → SQL results → compile log → artifact registry → coverage gaps.
2. **Commit `reports/phase3-closeout.md`** as a single atomic commit to a new branch.
3. **Update `reports/copilot-research.md`** if a "resolved" or "closed" status marker is required by the pipeline watcher's artifact gate — confirm against pipeline watcher logic before writing. If no such field exists, skip this step.
4. **Push branch and open PR** per CLAUDE.md autonomous PR rules.

**Dependencies:**
- Step 2 depends on step 1 completing cleanly with all six sections validated.
- Step 3 must not proceed until step 2 is committed; pipeline state must not be updated before the artifact exists.
- Step 4 is terminal and depends on all prior steps.

**Sequencing risk:**
- None identified. This is a documentation-only patch with no schema, migration, or cache invalidation concerns.
- The `reports/` directory is not a hot path; no concurrent write conflicts expected.

---

## 4. Regression guards

**After patching, the implementation agent must verify:**
1. `reports/phase3-closeout.md` exists and is readable.
2. All numeric values in §2 match the soak report exactly (spot-check: engine runs total=97,262, success=951, error=0).
3. All three coverage gap items (GAP-01, GAP-02, GAP-03) are present in §6 with `NOT YET EXECUTED` / `TBD` markers — do not mark them resolved.
4. No existing files in `reports/` were modified or deleted.
5. No source code files (`src/`, `scripts/`, `*.mqh`, `*.pine`) were touched.

**Existing protections that must still hold:**
- Backend is the authority for all signal and regime data. This patch does not touch any data pipeline.
- Stale-data protections in the frontend and pipeline watcher remain untouched.
- MT5/EA authority over snapshot rows is not altered.

**Parity re-validations:**
- None required. This is a documentation artifact only.

**Logging/diagnostics:**
- If the pipeline watcher reads `reports/` for state transitions, confirm it does not misinterpret the new file as a pipeline artifact. Grep `scripts/pipeline-watcher.js` for any glob on `reports/phase3*` before committing.

---

## 5. Non-goals

- **Do not** modify `MarketDataEngine.mqh` or any `.mqh` / `.mq5` EA source file.
- **Do not** modify any Pine Script files.
- **Do not** modify any backend API, database schema, or migration files.
- **Do not** modify `scripts/pipeline-watcher.js` as part of this patch.
- **Do not** mark GAP-01, GAP-02, or GAP-03 as resolved — they are open items.
- **Do not** backfill missing 24h or 48h snapshot data. The absence of those gates is documented as-is.
- **Do not** reopen or extend the soak window. The 72h closeout is final.
- **Do not** create a `reports/phase4-*` planning artifact in this patch — that is out of scope.
- **Do not** assign track leads for TASK 10 — record the TBD state only.
- **Attractive but unsafe:** Merging the closeout record into an existing soak report file. Keep `phase3-closeout.md` as a standalone artifact to preserve the original soak reports as immutable evidence.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
- A value is transcribed incorrectly from the soak report (e.g., engine run success count). This would create a permanent discrepancy between the closeout record and the source soak artifact, undermining the audit trail.

**User-visible failure mode:**
- Minimal. This is a documentation patch with no frontend, backend, or EA runtime impact. A malformed file would only affect the closeout audit record.

**Backend authority / stale-state risks:**
- None. No backend, pipeline, or stale-state logic is modified.

**Human approval required before merge:**
- **Yes — recommended.** The Phase 3 closeout is a formal audit milestone. A human reviewer should confirm that the numeric values and SQL evidence summary in the closeout document match the source artifacts before the branch is merged. The implementation agent should not self-merge.

---

## 7. Test requirements

**Tests to add or update:**
- No automated tests are required for a documentation artifact. No test files should be created or modified in this patch.

**Existing checks that must still pass:**
- If a CI lint or markdown validator runs on `reports/`, the new file must pass it. Verify file ends with a newline and uses valid markdown syntax.
- Pipeline watcher must not enter an error state after the file is written. Confirm by inspecting `scripts/pipeline-watcher.js` for any `reports/` glob that could pick up this file unintentionally.

**Manual verification:**
- Reviewer should open `reports/phase3-closeout.md` and cross-reference §2 engine health stats against `phase-3-stability-72h-2026-05-25.md` line by line.
- Reviewer should cross-reference §3 SQL results against `SQL logs Snapshot Queries.txt`.
- Reviewer should confirm §4 compile log values match the user-provided EA compile summary exactly.
- Reviewer should confirm §6 carries all three gap items as open with no resolution claimed.

**Soak / replay / live-environment verification:**
- None required. No runtime components are changed.

---

## 8. Implementation handoff

**Branch naming recommendation:**
```
docs/phase3-closeout-2026-05-25
```

**Suggested commit grouping:**
- Single commit: `docs(phase3): record Phase 3 72h soak closeout — engine health, SQL results, EA compile, coverage gaps`
- Do not split across multiple commits; the entire closeout record is one atomic artifact.

**Required artifacts after implementation:**
- `reports/phase3-closeout.md` — the closeout record itself
- `reports/codex-plan.md` — this plan document (already generated)

**State transition required after plan handoff:**
```
State: READY_FOR_IMPLEMENTATION
editing_locked: false
```
