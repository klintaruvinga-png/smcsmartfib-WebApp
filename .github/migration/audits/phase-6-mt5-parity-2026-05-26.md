# Phase 6 MT5 Parity Audit

Date: 2026-05-26
Engine: MT5 regime and signal constant authority
Scope: Compile-fix parity for `RegimeEngine.mqh` and `SignalEngine.mqh` after replacing illegal inline integer declarations with anonymous enum constants

## Authority parity

- MT5 remains the only layer touched by this patch.
- No backend, dashboard, PHP, API, or Pine file changed, so backend authority and dashboard truth boundaries remain intact.
- The patch changes declaration syntax only. It does not change any runtime formula, threshold, method signature, or dispatch path.

## Threshold parity

- `RegimeEngine.mqh` preserves `EMA_PERIOD=20`, `ATR_PERIOD=14`, and `MIN_BARS=25`.
- `PHASE5_IMPLEMENTATION.md` documents Phase 5 regime logic as EMA-20 on D1 and ATR-14 on H1, which matches the preserved MT5 values.
- `MIN_BARS=25` remains an MT5-side minimum-history guard. A direct named Pine counterpart was not located in the current workspace search, so this value is documented as an intentional MT5 implementation guard rather than a verified Pine constant.
- `SignalEngine.mqh` preserves `PROXIMITY_PIPS=15` and `DISPLACEMENT_PIPS=8`.
- `PHASE6_IMPLEMENTATION.md` documents Phase 6 signal gating as proximity within 15 pips and displacement with at least 8-pip closure, which matches the preserved MT5 values.
- The current `SMC_SuperFib_v13.1.3.pine` search did not expose direct named constants for these MT5 dual-run gate values, so live Pine parity for these thresholds remains pending the Phase 6 gate process rather than being newly established by this patch.

## Validation results

- `rg -n "static const int\\s+\\w+\\s*=\\s*" mt5 -g "*.mqh"` before patch: matched only `mt5/RegimeEngine.mqh` and `mt5/SignalEngine.mqh`
- Same `rg` after patch: no matches remaining
- `node mt5/check-mql-includes.mjs`: passed
- `MetaEditor64.exe /compile:.../mt5/SMC_MarketDataEA.mq5 /log:...`: inconclusive, no compiler log or `.ex5` artifact captured in workspace

## Known parity limits

- This audit confirms value preservation and contract-scope containment, not live MT5↔Pine signal parity.
- A clean MetaEditor rebuild of `mt5/SMC_MarketDataEA.mq5` is still required before claiming compile success.
- Phase 5B/6 operator parity gates remain the authoritative process for validating MT5 regime and signal behavior against Pine.
