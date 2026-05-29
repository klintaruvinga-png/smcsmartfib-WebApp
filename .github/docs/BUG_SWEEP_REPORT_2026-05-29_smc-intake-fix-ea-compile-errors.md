# Bug Sweep Report: SMC Intake - Fix EA compile errors

Date: 2026-05-29
Issue type: MT5 compile integrity / wiring
Severity: High

## Scope

Compile-path investigation for:

- `mt5/SMC_MarketDataEA.mq5`
- `mt5/MarketDataEngine.mqh`
- `mt5/RegimeEngine.mqh`

## Confirmed findings

1. The repository include chain is intact.
   - `mt5/SMC_MarketDataEA.mq5` includes `MarketDataEngine.mqh`.
   - `mt5/MarketDataEngine.mqh` includes `RegimeEngine.mqh`.
   - `mt5/RegimeEngine.mqh` defines both `RegimeSnapshotOut` and `ComputeRegimeState(string symbol, RegimeSnapshotOut& out)`.

2. `npm run check:mql` passes on the checked-in repository state.

3. The active MT5 compiler path recorded in `%APPDATA%\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\logs\metaeditor.log` is:
   - `C:\Users\LEONNA\AppData\Roaming\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\Experts\SMC SmartFib EA\SMC_MarketDataEA.mq5`

4. That active terminal copy logged a failed compile on 2026-05-29 07:03:53:
   - `13 errors, 0 warnings`

5. Hash comparison proved the active terminal copy had a stale `RegimeEngine.mqh` while the other two files were already aligned with the repository.
   - `SMC_MarketDataEA.mq5`: repo and terminal hashes match
   - `MarketDataEngine.mqh`: repo and terminal hashes match
   - `RegimeEngine.mqh`: repo hash `7C4EA240...` vs terminal hash `B8E645DB...`

6. `git diff --no-index` proved the stale terminal `RegimeEngine.mqh` was missing:
   - the `RegimeSnapshotOut` struct
   - the `ComputeRegimeState(...)` method used by `MarketDataEngine.mqh`

## Root cause

The failure path was an external compile-context mismatch, not a broken checked-in include graph. The active MT5 terminal was compiling a stale `RegimeEngine.mqh` copy that no longer satisfied the current `MarketDataEngine.mqh` call site.

## Remediation applied

- Backed up the stale terminal file:
  - `%APPDATA%\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\Experts\SMC SmartFib EA\RegimeEngine.mqh.bak-2026-05-29`
- Replaced the active terminal `RegimeEngine.mqh` with the repository `mt5/RegimeEngine.mqh`
- Left repository MT5 source files unchanged because no repository-side inconsistency was reproduced

## Regression protections preserved

- No Pine, backend, fib, regime, or signal logic was changed in the repository
- No duplicate declarations, shims, or fallback regime paths were introduced
- Existing `check:mql` protection remains intact

## Validation

- `npm run check:mql` -> PASS
- Active compiler path identified from terminal `metaeditor.log`
- Repo vs terminal hash audit completed for the three scoped MT5 files
- Terminal stale-file diff captured for `RegimeEngine.mqh`

MetaEditor CLI rebuild status:

- Attempted from the workspace against both the repo path and the active terminal path
- Result remained inconclusive: the process exited without producing a fresh compiler log or a new observable `metaeditor.log` entry from automation

## Remaining risk

Human MT5 rebuild confirmation is still required. The compile-context mismatch is corrected at the active terminal file level, but a human operator needs to run a terminal-local rebuild and confirm the unresolved regime-symbol errors are gone on the active `%APPDATA%` source path.
