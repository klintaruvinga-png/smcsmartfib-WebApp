# Issue summary

SMC Intake MT5 compilation was blocked by illegal inline initialization of class-scope `static const int` members in `mt5/RegimeEngine.mqh` and `mt5/SignalEngine.mqh`.

# Root cause implemented

Replaced the unsupported MQL5 class-scope inline `static const int` declarations with anonymous class-scope `enum` constants, preserving the original integer values exactly and leaving all runtime logic and `static const double` definitions unchanged.

# Exact files changed

- `mt5/RegimeEngine.mqh`
- `mt5/SignalEngine.mqh`
- `reports/codex-implementation.md`

# Tests run

- `rg -n "static const int\\s+\\w+\\s*=\\s*" mt5 -g "*.mqh"` before patch confirmed only `mt5/RegimeEngine.mqh` and `mt5/SignalEngine.mqh` matched the unsupported pattern.
- `rg -n "static const int\\s+\\w+\\s*=\\s*" mt5 -g "*.mqh"` after patch returned no matches.
- `node mt5/check-mql-includes.mjs` — passed.
- MetaEditor CLI compile attempt for `mt5/SMC_MarketDataEA.mq5` via `MetaEditor64.exe /compile` — inconclusive; the process exited `0` but produced no repo-local compiler log and no `.ex5` artifact.

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-26_smc-intake-fix-ea-compile-errors.md`
- `.github/migration/audits/phase-6-mt5-parity-2026-05-26.md`

# Remaining risks

- A clean zero-error / zero-warning MetaEditor rebuild of `mt5/SMC_MarketDataEA.mq5` is still required because the local CLI path did not emit authoritative compile evidence in this workspace.
- `MIN_BARS=25` remains documented as an MT5-side minimum-history guard; the current workspace search did not expose a direct named Pine counterpart for that constant.
- Phase 5/6 live parity validation is still pending operator review even though the MT5 threshold values were preserved exactly.

# Any contract ambiguities resolved during implementation

No code-scope ambiguity remained after source inspection. The only matching unsupported pattern under `mt5/*.mqh` was in `RegimeEngine.mqh` and `SignalEngine.mqh`, so scope was kept to those files. I also resolved the validation ambiguity conservatively: the MetaEditor CLI run was recorded as inconclusive rather than treated as a compile pass because it emitted no compiler log or artifact.
