# Issue summary

Phase 4 fib timeframe-matrix corrected from `M15/H1/D1` to `M15/H1/H4/D1` across MT5 emission, backend ingestion, validator coverage, PHP regression tests, and active Phase 4 operator/tracker artifacts, while preserving pre-correction historical evidence through dated supersession notes and a new correction addendum.

# Root cause implemented

Implemented the stale contract propagation fix: `mt5/FibEngine.mqh` now emits `H4`, the WordPress ingest gate now accepts `H4`, `scripts/parity-validator.php` now enforces the exact `EURUSD/USDJPY/XAUUSD x M15/H1/H4/D1 x LTF_SF/HTF_AF x 16 = 384` tuple contract so missing `H4` fails even when absent from both files, the PHP fixture suite now requires the four-timeframe matrix, and active Phase 4 governance docs now require `128` rows per complete symbol ingest plus `384` rows across `24` `(symbol,timeframe,family)` groups for closeout.

# Exact files changed

- `mt5/FibEngine.mqh`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `scripts/parity-validator.php`
- `wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php`
- `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
- `PHASE4_IMPLEMENTATION.md`
- `PHASE4_TESTING_GUIDE.md`
- `reports/fib-parity-validation.md`
- `.github/migration-status.md`
- `.github/migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md`
- `.github/migration/phase-updates/phase4-live-soak-started-2026-05-27.md`
- `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`
- `.github/migration/phase-updates/phase4-implementation-started-2026-05-25.md`
- `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`
- `reports/codex-implementation.md`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS (`levels_written=128` on the four-timeframe fixture; `H4` persisted and returned)
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS (`12` fixture cases across `15min/1h/4h/1day`)
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php scripts/parity-validator.php` -> PASS (`384/384` exact matches, `24/24` required groups present on both sides in self-test)
- Phase 4 artifact grep for stale contract markers -> verified only preserved historical pre-correction notes/logs still mention `levels_written=96`, `288/288`, or `M15/H1/D1`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-28_phase4-h4-timeframe-contract.md`
- `.github/migration/audits/phase-4-fib-engine-parity-2026-05-28.md`
- `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`

# Remaining risks

- Live MT5 evidence is still pre-correction until the corrected H4 build is redeployed and backend logs confirm `levels_written=128`.
- Final Phase 4 closeout still depends on authenticated export, fresh MT5/Pine captures, `384` rows across `24` groups, and manual weekend/sparse-data validation.
- The worktree contained unrelated pre-existing edits outside this patch; those were preserved.

# Any contract ambiguities resolved during implementation

- Interpreted “update any current trackers, checklists, and logs that still present the superseded contract” to include the non-archived `.github/migration/phase-updates/phase4-implementation-started-2026-05-25.md`, but handled it with a dated supersession note instead of rewriting its historical 2026-05-25 evidence.
- Treated pre-correction `levels_written=96` and `288/288` evidence as valid historical captures that must remain visible, but explicitly insufficient for the active corrected gate.
