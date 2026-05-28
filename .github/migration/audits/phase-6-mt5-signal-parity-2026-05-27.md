# Phase 6 MT5 Signal Parity Audit

Date: 2026-05-27
Auditor: Codex automation
Status: PASS with runtime replay pending
Scope: MT5 Phase 6 signal-dispatch input parity and candidate-emission readiness

## Executive Summary

- Overall parity: runtime replay pending
- Static code-path parity: 100% of the audited signal inputs now come from authoritative MT5 engines
- Threshold required: 95% replay parity before Phase 6 cutover
- Trend: improving

## Component Parity Metrics

### Fib Engine

| Metric | Pine/PHP Authority | MT5 Value | Match | Accuracy |
|--------|--------------------|-----------|-------|----------|
| Signal fib source | Session-anchor fib engine | `FibEngine.BuildSignalFibLevels()` | Yes | 100% |
| Signal timeframe input | M15 signal path | M15 structured levels | Yes | 100% |
| Fib family coverage | `LTF_SF` and `HTF_AF` available to callers | `LTF_SF` and `HTF_AF` emitted into `FibLevelOut[]` | Yes | 100% |
| Broker-time session alignment | Broker offset required before anchor grouping | `RefreshBrokerOffset()` called before signal dispatch | Yes | 100% |

Observations: this audit verified source-of-truth usage in code, not live replay against MT5 terminal output.

### Regime Engine

| Metric | Pine/PHP Authority | MT5 Value | Match | Accuracy |
|--------|--------------------|-----------|-------|----------|
| HTF bias source | Regime engine output | `RegimeEngine.ComputeRegimeState().htfBias` | Yes | 100% |
| LTF regime source | Regime engine output | `RegimeEngine.ComputeRegimeState().ltfRegime` | Yes | 100% |
| Chop gate source | Regime engine output | `RegimeEngine.ComputeRegimeState().chopScore` | Yes | 100% |

Observations: the previous placeholder defaults (`TRANSITIONAL`, `RANGING`, `0.5`) have been removed from the signal-dispatch path.

### Signal Engine

| Metric | Previous State | Current State | Match | Accuracy |
|--------|----------------|---------------|-------|----------|
| Candidate emission readiness | Blocked by `fibCount = 0` scaffold | Enabled when authoritative fib/regime inputs exist | Yes | 100% blocker closure |
| Backend contract shape | Existing `/ea/signal-candidates` payload | Unchanged | Yes | 100% |
| Runtime replay parity | Not verifiable in this workspace | Pending | Pending | Pending |

Observations: this run removed the code-path blocker but did not observe a live MT5 candidate cycle.

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| MT5 signal dispatch used scaffold inputs and could not emit candidates | HIGH | 1 | Fixed in `mt5/MarketDataEngine.mqh`, `mt5/FibEngine.mqh`, `mt5/RegimeEngine.mqh` | Cleared in code |

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Runtime replay score | Not captured | No MetaEditor compile log or MT5 terminal replay in workspace | Yes, temporarily |

## Recommendations

1. Rebuild `mt5/SMC_MarketDataEA.mq5` and capture a compiler artifact before claiming runtime parity.
2. Add a dedicated Phase 6 replay harness that asserts candidate creation across trending, ranging, and chop cases.
3. Validate backend `/ea/signal-candidates` writes and dashboard rendering on at least one FX pair and one index/metal pair.

## Verification Checklist

- [x] Audited signal path now consumes authoritative fib inputs
- [x] Audited signal path now consumes authoritative regime inputs
- [x] Source-level regression guard added
- [x] Backend contract unchanged
- [ ] Historical replay validated
- [ ] Multi-pair MT5 runtime testing completed

## Artifacts

- `npm run check:mql`
- `npx vitest run scripts/mt5-signal-dispatch.test.mjs`
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
