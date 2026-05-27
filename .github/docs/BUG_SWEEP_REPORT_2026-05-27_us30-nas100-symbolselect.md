# Bug Sweep Report - 2026-05-27 - us30-nas100-symbolselect

**Report Date**: 2026-05-27  
**Phase**: Phase 3 / Phase 4 boundary - MT5 intake stability hardening  
**Scanner**: Codex implementation pass  
**Issue**: US30 and NAS100 recurring offline state during expected live operation

---

## Summary

- **Total Issues Found**: 1
- **Critical Issues**: 0
- **High Priority Issues**: 1
- **Medium Priority Issues**: 0
- **Low Priority Issues**: 0

## Confirmed Problem

| Severity | Component | Root Cause | Runtime Impact | Fix Applied |
|----------|-----------|------------|----------------|-------------|
| High | `mt5/SMC_MarketDataEA.mq5` startup subscription path | The EA did not perform an explicit post-resolution `SymbolSelect()` pass with startup diagnostics at the exact `g_symArray[]` boundary documented in the contract, leaving the US30/NAS100 offline recurrence difficult to prevent and observe in deployment | If a resolved non-chart symbol is not actively subscribed in Market Watch, `SymbolInfoTick()` can return `false`, freshness ages to `DISCONNECTED`, backend persists `offline`, and the dashboard mirrors that state | Added explicit `SymbolSelect(g_symArray[i], true)` loop in `OnInit()` before `engine.Initialize()`, with per-symbol `[SymbolSelect]` OK/WARN logging |

## Root Cause / Analysis

- Tracker history shows this problem family already existed in Phase 0 as a multi-symbol freshness failure.
- Alias normalization is correct in `mt5/SymbolNormalizer.mqh`; backend `CLOSED` / `DISCONNECTED -> offline` mapping is also correct.
- The remaining safe hardening point is the startup subscription path in `SMC_MarketDataEA.mq5`, using the already resolved broker symbols stored in `g_symArray[]`.
- Repository reality also contains `SymbolSelect()` calls in `ResolveBrokerSymbol()` and `MarketDataEngine.Initialize()`. This patch does not widen architecture; it makes the contract's startup guard explicit and auditable at the exact failure boundary.

## Exact Changes

- `mt5/SMC_MarketDataEA.mq5`
  - Added explicit `SymbolSelect()` loop after symbol resolution and before `engine.Initialize()`.
  - Added `[SymbolSelect] <symbol>: OK` and warning diagnostics for each resolved symbol.
- `reports/fix-us30-nas100-symbolselect.md`
  - Recorded code evidence, local validation status, and live verification gaps.
- `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md`
  - Marked the `SymbolSelect()` in `OnInit()` acceptance criterion complete and recorded the 2026-05-27 follow-up note.
- `.github/migration/audits/phase-0-mt5-parity-2026-05-27.md`
  - Added current parity re-validation artifact for this patch.

## Validation

- `npm run check:mql` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` -> PASS
- `npm run build` -> PASS
- `MetaEditor64.exe` CLI compile attempt -> INCONCLUSIVE (no compiler log or new `.ex5` artifact surfaced to workspace automation)

## Remaining Risks

1. Live MT5 Journal evidence for `[SymbolSelect] US30: OK` and `[SymbolSelect] NAS100: OK` is still required.
2. Backend snapshot verification for live-session US30/NAS100 rows is still required.
3. Dashboard live-badge verification during an active US equity session is still required.
4. Pre-market `offline` preservation after redeploy is still required.

## Acceptance Criteria

- Local source validation passes without breaking backend or dashboard contracts.
- The EA remains non-failing on startup if a broker temporarily refuses symbol selection.
- The live operator can now verify the exact subscription state for every runtime symbol from the MT5 Journal.
- No stale-data guard, session rule, alias map, or backend state authority was weakened.
