# Phase 0 Next Actions — 2026-05-14

**Status**: Phase 0 soak complete, closeout blocked.

## Confirmed done
- `NAS100` / `US30` MT5 freshness failure was diagnosed and documented in `.github/migration-status.md` as fixed in the EA/session path and awaiting validation.
- `XAUUSD` candle-history readiness failure was diagnosed and documented in `.github/migration-status.md` as a broker alias / symbol normalization issue and fixed in `SymbolNormalizer.mqh`; awaiting EA restart + history accumulation.
- `AUDUSD` / `ETHUSD` chop-gate blocks were audited and classified as genuine live chop engine behavior; no code change is authorized at this time.
- A raw final soak export exists as `.github/migration/phase-updates/phase0-soak-Final-2026-05-14.md` and is now part of the repo evidence chain.

## Current blocker set
- `NAS100=PRICE_NOT_MT5_FRESH`
- `US30=PRICE_NOT_MT5_FRESH`
- `XAUUSD=INSUFFICIENT_CANDLE_HISTORY`
- `AUDUSD=CHOP_GATE_BLOCKED` (confirmed live chop)
- `ETHUSD=CHOP_GATE_BLOCKED` (confirmed live chop)

## Immediate next tasks
1. Validate the `NAS100` / `US30` freshness fix with a focused health check or targeted soak for those symbols.
2. Restart the EA and verify `XAUUSD` M1 → 15m candle-history readiness after at least 7.5 hours of accumulation.
3. Keep `AUDUSD` and `ETHUSD` as observation-only for now; do not change chop-gate logic unless a later parity audit proves the engine output incorrect.
4. Run a focused validation on only the blocked symbols once the freshness and candle-history changes are live.
5. Publish a superseding Phase 0 closeout artifact if the blocked-symbol validation passes.

## Notes
- The most urgent path to close Phase 0 is still the index/timeframe fixes for `NAS100`, `US30`, and `XAUUSD`.
- The chop blocks for `AUDUSD` and `ETHUSD` are not currently the gating defect; they are live engine outcomes and should remain documented as such.
- The repo now contains the final soak export artifact, so the evidence chain is complete for this closeout.
