# Executive Summary

- Overall health: stable after a targeted Phase 6 MT5 signal-dispatch hardening pass.
- Bugs found: 1 HIGH stale-signal risk in MT5 candidate dispatch.
- Fixes applied: MT5 Phase 6 now skips signal candidate evaluation unless the symbol freshness state is LIVE.
- Remaining risks: no MetaEditor compile log or live MT5 terminal replay is available in this workspace.
- Migration readiness: Phase 6 dual-run remains migration-ready for guarded candidate emission, pending one live terminal capture.

## Confirmed Problems

| Severity | Category | Component | Root cause | Impact | Status |
|---|---|---|---|---|---|
| HIGH | Signal freshness truth | `mt5/MarketDataEngine.mqh` | `SendSignalCandidatesToBackend()` evaluated fib/regime inputs before checking per-symbol freshness. | Stale, closed, delayed, or disconnected symbols could emit MT5 signal candidates when historical rates were still available. | Patched |

## Surgical Fixes Applied

- `mt5/MarketDataEngine.mqh`
  - Added a per-symbol `IsLive(symbols[i])` guard before fib aggregation, regime computation, and `SignalEngine.EvaluateSymbol()`.
  - Added diagnostic logging with `FreshnessStateName(GetFreshnessState(symbols[i]))` when candidate evaluation is skipped.
- `scripts/mt5-signal-dispatch.test.mjs`
  - Added a regression assertion that the freshness guard exists before `fibEngine.BuildSignalFibLevels(...)`.

## Parity Verification Results

| Area | Result | Evidence |
|---|---:|---|
| Fib parity | 100% synthetic gate | `php scripts/parity-validator.php --out reports/phase6-signal-freshness-2026-05-30.json` |
| Regime parity | No formula drift introduced | MT5 dispatch still uses `regimeEngine.ComputeRegimeState(...)`; guard only blocks non-live sources. |
| Signal parity | Guarded | `npx vitest run scripts/mt5-signal-dispatch.test.mjs` passed after red-green verification. |
| Freshness parity | Hardened | MT5 signal dispatch now uses existing `FreshnessEngine` authority before candidate emission. |

## Remaining Risks

- Live MT5 terminal replay is still unavailable in this workspace.
- MetaEditor compile output is still unavailable; `npm run check:mql` only verifies include and source-level guard structure.
- Phase 6 operational closeout still needs one real `/ea/signal-candidates` capture showing stale symbols skipped and live symbols still emitted.

## Regression Checklist

- Refresh tests: `npm run check:mql` passed.
- Stale detection tests: `npx vitest run scripts/mt5-signal-dispatch.test.mjs` passed after a confirmed failing red run.
- Signal readiness tests: MT5 signal dispatch guard verified before fib/regime/signal evaluation.
- Backend sync tests: `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- Parity verification tests: `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` and synthetic parity validator passed.

## Safe Deployment Order

1. Deploy the MT5 include patch to the Phase 6 EA branch.
2. Compile in MetaEditor and check for MQL syntax/runtime warnings.
3. Run a terminal replay with at least one stale/closed symbol and one live symbol.
4. Confirm only LIVE symbols post to `/ea/signal-candidates`.
5. Re-run backend candidate drift checks after the first live capture.

## Do Not Touch List

- Pine trading formulas.
- Backend signal drift thresholds and `pine_match` classification.
- Stale threshold semantics in WordPress snapshot authority.
- Phase 7 execution activation gate.

