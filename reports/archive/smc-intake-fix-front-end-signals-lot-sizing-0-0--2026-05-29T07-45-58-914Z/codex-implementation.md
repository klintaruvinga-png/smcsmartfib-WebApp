## Issue summary

The unresolved `RegimeSnapshotOut`, `regimeState`, and `ComputeRegimeState()` errors were traced to the active MT5 terminal compiling a stale `%APPDATA%\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\Experts\SMC SmartFib EA\RegimeEngine.mqh` copy that no longer matched the repository. The checked-in `mt5/SMC_MarketDataEA.mq5` and `mt5/MarketDataEngine.mqh` already matched the active terminal copies.

## Root cause implemented

Synchronized the active terminal-side `RegimeEngine.mqh` copy to the repository version after hash and diff verification proved it was the only divergent file in the failing include chain. No repository MT5 source files were modified because the checked-in include wiring was already correct and the contract did not authorize a repo logic patch on current evidence.

## Exact files changed

- `reports/codex-implementation.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_smc-intake-fix-ea-compile-errors.md`

Non-repository environment sync performed:

- `%APPDATA%\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\Experts\SMC SmartFib EA\RegimeEngine.mqh` -> replaced with the repository `mt5/RegimeEngine.mqh`
- `%APPDATA%\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\Experts\SMC SmartFib EA\RegimeEngine.mqh.bak-2026-05-29` -> backup of the stale terminal copy

## Tests run

- `npm run check:mql` -> PASS (`MQL include verification passed.`)
- SHA-256 comparison of repo vs active terminal copies for `SMC_MarketDataEA.mq5`, `MarketDataEngine.mqh`, and `RegimeEngine.mqh`
- `git diff --no-index` between repo `mt5/RegimeEngine.mqh` and the active terminal copy -> confirmed the stale terminal file lacked `RegimeSnapshotOut` and `ComputeRegimeState(...)`
- MetaEditor CLI compile attempts against both the repo path and the active terminal path -> inconclusive from workspace automation (`exit=0`, no fresh compiler log emitted into the requested log path, and no new terminal `metaeditor.log` entry was observed)

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_smc-intake-fix-ea-compile-errors.md`

## Remaining risks

Fresh MT5 compile success is not verified from this workspace because MetaEditor CLI did not emit a new observable compile log after the terminal-side sync. A human operator still needs to trigger a terminal-local rebuild of `SMC_MarketDataEA.mq5` and confirm the active `%APPDATA%` copy now compiles without the unresolved regime-symbol errors.

## Any contract ambiguities resolved during implementation

- The required branch `codex/smc-intake-fix-ea-compile-errors` already existed locally with a stale local-only commit. I preserved that tip under `backup/codex-smc-intake-fix-ea-compile-errors-existing` and repointed the required branch name to the current checkout so the task could proceed without losing history.
- The contract allowed no repo patch unless the current checkout reproduced a repository-side defect. I resolved that ambiguity by treating the verified `%APPDATA%` include drift as the smallest safe compile-context fix and keeping repository MT5 logic unchanged.
