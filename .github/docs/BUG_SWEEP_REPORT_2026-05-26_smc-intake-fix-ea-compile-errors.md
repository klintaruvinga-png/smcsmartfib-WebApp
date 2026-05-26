# Bug Sweep Report

Date: 2026-05-26
Scope: MT5 EA compile integrity for `RegimeEngine.mqh` and `SignalEngine.mqh`, include-chain reachability from `SMC_MarketDataEA.mq5`, and threshold-value preservation.

## Integrity checks performed

- Verified the confirmed defect path is limited to class-scope inline `static const int` declarations in `mt5/RegimeEngine.mqh` and `mt5/SignalEngine.mqh`.
- Grepped all `mt5/*.mqh` files for `static const int ... =` to confirm there were no additional in-scope instances before patching.
- Replaced only the illegal integer declarations with anonymous class-scope `enum` constants and preserved the original values exactly: `EMA_PERIOD=20`, `ATR_PERIOD=14`, `MIN_BARS=25`, `PROXIMITY_PIPS=15`, `DISPLACEMENT_PIPS=8`.
- Verified the existing `static const double` members in both classes were not modified.
- Verified `mt5/SMC_MarketDataEA.mq5` includes `mt5/MarketDataEngine.mqh`, and `MarketDataEngine.mqh` includes both patched headers, so EA compilation exercises this failure path.
- Ran `node mt5/check-mql-includes.mjs` to confirm the MT5 include graph still resolves after the patch.
- Attempted MetaEditor CLI compilation of `mt5/SMC_MarketDataEA.mq5` using `MetaEditor64.exe` with `/compile` and `/log`.

## Findings

- Confirmed fixed at source: the only illegal inline `static const int` declarations under `mt5/*.mqh` were converted to MQL5-compatible anonymous enum constants.
- Confirmed preserved: threshold values did not change across the patch. The diff is syntax-only for the affected integer constants.
- Confirmed preserved: `TREND_THRESHOLD`, `CHOP_LOWER`, `CHOP_UPPER`, `HTF_ALIGNED_BOOST`, and `HTF_OPPOSED_PENALTY` remain unchanged.
- Confirmed preserved: no backend, dashboard, Pine, PHP, or API-contract files were changed.
- Confirmed preserved: `rg -n "static const int\\s+\\w+\\s*=\\s*" mt5 -g "*.mqh"` returns no remaining matches after the patch.

## Residual risks

- MetaEditor CLI compile evidence remains inconclusive from this workspace. `MetaEditor64.exe` exited with code `0` but produced no repo-local compiler log and no `.ex5` artifact, matching prior repository behavior.
- Zero-error / zero-warning MT5 compile cannot be claimed until a human rebuilds `mt5/SMC_MarketDataEA.mq5` in MetaEditor or the pipeline captures authoritative compiler output.
- Phase 5/6 live parity remains pending. This patch preserves the MT5 threshold values, but runtime parity against Pine still requires operator validation in the MT5 environment.
