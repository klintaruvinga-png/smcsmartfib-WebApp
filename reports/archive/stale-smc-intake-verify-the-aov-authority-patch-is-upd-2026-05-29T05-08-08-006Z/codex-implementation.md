# Issue summary

The remaining confirmed MT5 parity gap was not the AOV gate formulas themselves. The live defect was that signal evaluation still consumed an M15-only fib set, so H1/H4 never participated in nearest-trigger selection, and authority-range lookup was not scoped for mixed-timeframe signal inputs.

# Root cause implemented

`mt5/FibEngine.mqh` now exposes `BuildSignalFibLevelsForTF(...)` and uses it to aggregate `M15`, `H1`, and `H4` signal fib levels while stamping each `FibLevelOut` with its source timeframe. `mt5/SignalEngine.mqh` now resolves the authority range against the selected trigger timeframe before applying the existing AOV/equilibrium/directional/RR gates, and MT5-local diagnostics now print the trigger timeframe. The source-contract guard in `scripts/mt5-signal-dispatch.test.mjs` now pins the multi-timeframe input contract and the retained AOV/RR block markers.

# Exact files changed

- `mt5/FibEngine.mqh`
- `mt5/SignalEngine.mqh`
- `mt5/MarketDataEngine.mqh`
- `scripts/mt5-signal-dispatch.test.mjs`

# Tests run

- `npx vitest run scripts/mt5-signal-dispatch.test.mjs` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php scripts/parity-validator.php` -> PASS (`384/384` exact matches, synthetic self-test mode)
- `php scripts/parity-validator.php --out reports/phase4-gate-2026-05-29.json` -> PASS
- `npm run validate:impl` -> PASS after writing `reports/codex-implementation.meta.json`

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `reports/phase4-gate-2026-05-29.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_mt5-multitf-aov-signal-hardening.md`
- `.github/migration/audits/phase-6-mt5-signal-parity-2026-05-29.md`

# Remaining risks

Repo-level tests can guard the source contract, but they do not behaviorally execute MT5 logic. Final closeout still depends on MT5 Strategy Tester or live replay evidence for one H1/H4 pass case, one equilibrium block case, one RR-below-minimum block case, and one clean `/ea/signal-candidates` dispatch cycle.

# Any contract ambiguities resolved during implementation

The contract mixed a verification request with broad parity concerns. I applied the smallest safe interpretation: keep Pine formulas, backend payload/schema, WordPress parity tests, and D1 signal selection out of scope unless the MT5 multi-timeframe patch proved they were directly required. I updated only the MT5 signal fib input path, trigger-timeframe authority lookup, and the regression guard that pins those contracts.
