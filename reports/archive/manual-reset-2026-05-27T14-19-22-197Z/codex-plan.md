# SMC SuperFIB - Implementation Contract: Fix EA Compile Errors (Verification Closure)

## 1. Issue validation

**Issue:** SMC Intake - Fix EA compile errors

**Confirmed:**
- All MQL5 compile errors previously affecting the EA have been resolved in prior PRs (#47 and #206).
- `mt5/CandleBuilder.mqh`: `ArrayInitialize` on struct — fixed with `ZeroMemory`. Present since PR #47.
- `mt5/FreshnessEngine.mqh`: `IsTerminalConnected()` boolean error — fixed. Present since PR #47.
- `mt5/SymbolNormalizer.mqh`: `StringGetChar` removed in MQL5 build 2000+ — fixed with `StringGetCharacter`. Present since PR #47.
- `mt5/SMC_MarketDataEA.mq5`: missing `HeartbeatIntervalTicks` input declaration — fixed. Present since PR #206.
- `npm run check:mql` passes: "MQL include verification passed".
- Phase 5-9 engines (`FibEngine.mqh`, `RegimeEngine.mqh`, `SignalEngine.mqh`, `ExecutionEngine.mqh`) are not `#include`d in the main EA and introduce no compile exposure.

**Root cause of pipeline failure (not a code defect):**
The prior pipeline cycle left stale artifacts: `reports/codex-plan.md` contained a crypto weekend session classification contract (already implemented in PR #228), and `reports/copilot-research.md` contained soakType research with appended crypto session data (from the 2026-05-23 cycle). Neither file was refreshed when the "Fix EA compile errors" task was queued. The pipeline state file (`.smc-workflow-state.json`) is not committed to the repository, so container clones always start stateless. Codex correctly stopped on the contract conflict.

---

## 2. Implementation contract

**This cycle is a verification and closure pass. No application code changes are required or permitted.**

**File 1: `reports/copilot-research.md`**
- **Change:** Rewrite to accurately document the EA compile error history and current clean state for the "Fix EA compile errors" issue.
- **Why:** Stale research from a prior cycle was causing a contract conflict stop.

**File 2: `reports/codex-plan.md`**
- **Change:** This file (the current document). Replaces the stale crypto session classification plan.
- **Why:** The plan must match the active issue. The prior plan was for a different completed task.

**File 3: `reports/codex-implementation.md`**
- **Change:** Write a closure implementation report documenting that all EA compile errors are resolved and no code changes are needed this cycle.
- **Why:** Pipeline requires a valid implementation report to advance.

**File 4: `reports/codex-plan.meta.json`**
- **Change:** Update `issue` field to "SMC Intake - Fix EA compile errors" and update `research_hash` to match the current `copilot-research.md`.
- **Why:** Meta was pointing to the soakType issue from 2026-05-23.

**File 5: `reports/codex-implementation.meta.json`**
- **Change:** Update `issue` field to "SMC Intake - Fix EA compile errors" and update `plan_hash` to match the current `codex-plan.md`.
- **Why:** Meta was pointing to the post-weekend watchlist issue from 2026-05-25.

---

## 3. Patch sequence

1. Verify `npm run check:mql` passes — already confirmed.
2. Verify no new `#include` lines in `SMC_MarketDataEA.mq5` referencing Phase 5-9 engines — already confirmed.
3. Write corrected `reports/copilot-research.md` — done.
4. Write this `reports/codex-plan.md` — done.
5. Write `reports/codex-implementation.md` closure report.
6. Update `reports/codex-plan.meta.json` with correct issue and research_hash.
7. Update `reports/codex-implementation.meta.json` with correct issue and plan_hash.
8. Commit and push.

**Dependencies:** Steps 5-7 depend on steps 3-4 being final (hashes must be computed from final file content).

---

## 4. Regression guards

- No MT5 EA files modified — no regression possible in EA behavior.
- No PHP files modified — no backend regression.
- No frontend files modified — no dashboard regression.
- `npm run check:mql` must continue to pass after artifact updates.

---

## 5. Non-goals

- Do not touch `mt5/SMC_MarketDataEA.mq5` or any MT5 include file.
- Do not touch PHP, frontend, or Pine files.
- Do not wire Phase 5-9 engines into the main EA (that is a separate future task).
- Do not alter the existing compile fixes from PRs #47 and #206.
- Do not address any non-compile issues (session classification, freshness, soakType) — those are separate completed tasks.

---

## 6. Risk assessment

**Risk:** None. This cycle only updates pipeline artifact files. No application code is touched.

**Human approval required before merge:** No. Documentation-only fix.

---

## 7. Test requirements

**Verify:**
- `npm run check:mql` passes (already confirmed).
- `reports/codex-plan.meta.json` `issue` field matches the active issue string.
- `reports/codex-implementation.meta.json` `issue` field matches the active issue string.

---

## 8. Implementation handoff

**Branch:** Current working branch.

**Commit:** Single commit — "fix(pipeline): refresh stale artifacts for EA compile-errors issue"

**Required artifacts after implementation:**
- `reports/copilot-research.md` — scoped to EA compile errors
- `reports/codex-plan.md` — this file
- `reports/codex-implementation.md` — closure report
- `reports/codex-plan.meta.json` — updated issue + research_hash
- `reports/codex-implementation.meta.json` — updated issue + plan_hash

**State transition:** `READY_FOR_IMPLEMENTATION` → `IMPLEMENTATION_COMPLETE` (closure pass, no code changes).
