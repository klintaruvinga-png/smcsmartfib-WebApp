# SMC SuperFIB - EA Compile Errors: Research Report

**Date:** 2026-05-26
**Issue:** SMC Intake - Fix EA compile errors

---

## 1. Issue classification

- **Severity:** LOW (historical; all errors already resolved in prior PRs)
- **Category:** MT5 EA MQL5 compilation
- **Layer(s) affected:** mt5/ (EA and include files)
- **Phase impact:** Phase 1 / Phase 5-9 pre-implementation

---

## 2. Confirmed evidence

### 2.1 Historical compile errors (all resolved)

**PR #47 (merged 2026-05-03) — "fix: resolve all MQL5 compile errors"**

| File | Error | Fix applied |
|---|---|---|
| `mt5/CandleBuilder.mqh` | `ArrayInitialize(currentCandles, 0)` — ArrayInitialize only supports scalar element types, not structs like MqlRates | Replaced with `ZeroMemory(currentCandles)` |
| `mt5/FreshnessEngine.mqh` | `IsTerminalConnected()` returned `int` (TerminalInfoInteger), not `bool` — "expression not boolean" compile error | Changed to `return TerminalInfoInteger(...) != 0` |
| `mt5/SymbolNormalizer.mqh` | `StringGetChar()` removed in MQL5 build 2000+ — caused "function not defined" error | Replaced with `StringGetCharacter()`; added `(uchar)` cast to eliminate "possible loss of data" warning |

**PR #206 (merged 2026-05-19) — "fix(ea): add missing HeartbeatIntervalTicks input"**

| File | Error | Fix applied |
|---|---|---|
| `mt5/SMC_MarketDataEA.mq5` | `HeartbeatIntervalTicks` referenced in `OnInit()` (line 224) but never declared as `input int` — caused MQL5 compiler error on any recompile | Added `input int HeartbeatIntervalTicks = 6;` to the inputs block; preserves 60s heartbeat cadence (6 × 10s timer cycles) |

### 2.2 Current state of EA files

- `npm run check:mql` (node `mt5/check-mql-includes.mjs`) → **MQL include verification passed**
- All MQL5 include chains are intact: `SMC_MarketDataEA.mq5` → `TickProcessor.mqh`, `CandleBuilder.mqh`, `SessionManager.mqh`, `FreshnessEngine.mqh`, `SymbolNormalizer.mqh`, `MarketDataEngine.mqh`
- No dangling includes, no missing files

### 2.3 Phase 5-9 new engines (not yet included in main EA)

The following files were added in PR #240 (Phase 5-9 pre-implementation):

- `mt5/FibEngine.mqh` — 16-ratio fib computation
- `mt5/RegimeEngine.mqh` — EMA/ATR regime classification (TRENDING/RANGING/CHOP)
- `mt5/SignalEngine.mqh` — signal candidate evaluation, depends on FibEngine
- `mt5/ExecutionEngine.mqh` — execution queue fetcher and order dispatch

**None of these files are `#include`d in `SMC_MarketDataEA.mq5`** — they are pre-implemented stubs awaiting Phase 5-9 activation. Their absence from the main EA `#include` chain means they cannot introduce compile errors in the current EA binary.

Static const double members in `RegimeEngine` and `SignalEngine` use the correct MQL5 out-of-class definition pattern (e.g. `static const double RegimeEngine::TREND_THRESHOLD = 0.8;` placed after the class body). No compile issue.

### 2.4 MQL check tool coverage

`mt5/check-mql-includes.mjs` validates that every `#include` reference in all `.mq5` and `.mqh` files resolves to an existing file. It does not perform full MetaTrader compilation. No MetaTrader terminal is available in this environment, so terminal-level compile verification is not possible.

---

## 3. Root cause

All EA compile errors that existed as of the original issue report were:
- Resolved in PR #47 (ArrayInitialize struct, StringGetChar, IsTerminalConnected)
- Resolved in PR #206 (missing HeartbeatIntervalTicks input declaration)

The current codebase is clean. No new compile errors were introduced by the Phase 5-9 pre-implementation because those engines are not yet wired into the main EA.

**Likely cause of this issue being re-raised:** The pipeline artifact files (`reports/copilot-research.md`, `reports/codex-plan.md`) were not refreshed between cycles. The plan file still contained a crypto weekend session classification contract from a prior cycle, which explicitly excluded EA compile errors — causing a contract conflict stop. The `.smc-workflow-state.json` pipeline state file is not committed to the repository, so container clones always start stateless, leaving stale artifacts in place.

---

## 4. Blast radius

- No code changes required.
- Only pipeline artifact files need to be refreshed.

---

## 5. Regression surface

No code touched. Existing checks continue to pass:
- `npm run check:mql` — MQL include verification passed
- `npm run build` — frontend build unaffected
- All prior MT5 session/freshness fixes (PRs #47, #206, #224, #228) remain in main

---

## 6. Resolution path

**Path A (selected): Document resolution, close cycle**

All EA compile errors are already fixed. Write a corrected implementation contract (`codex-plan.md`) that scopes this cycle as a verification/closure pass with no code changes. Write a closure implementation report. Advance the pipeline.

No code changes to any MT5 files, PHP files, or frontend files.

---

## 7. Risk flags

- **High-risk system involved:** No — no code changes.
- **Requires parity re-validation:** No.
- **Migration-blocking:** No.
- **Human review required before merge:** No — documentation-only fix.

---

## 8. Handoff package

### 8.1 Evidence files to reference

- `mt5/SMC_MarketDataEA.mq5` — main EA, inputs block, `#include` chain
- `mt5/CandleBuilder.mqh`, `mt5/FreshnessEngine.mqh`, `mt5/SymbolNormalizer.mqh` — historical error sites, all patched
- GitHub PR #47, PR #206 — prior compile-error fix history

### 8.2 Inputs for plan

1. Verify `npm run check:mql` still passes — confirmed: "MQL include verification passed"
2. Confirm no new `#include` lines added to `SMC_MarketDataEA.mq5` referencing Phase 5-9 engines — confirmed: none
3. Confirm all historical error patterns are absent from current files — confirmed

### 8.3 Open unknowns

- Terminal-side full MetaTrader compile is not verifiable in this environment. A human should confirm compilation in MetaTrader after any future EA file changes.
- Phase 5-9 engine activation (wiring into the main EA) will require a new compile verification cycle at that time.
