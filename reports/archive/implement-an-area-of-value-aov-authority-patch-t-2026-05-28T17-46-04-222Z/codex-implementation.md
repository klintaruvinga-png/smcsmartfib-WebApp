# Issue summary

Implemented the Area of Value authority patch in `mt5/SignalEngine.mqh` so MT5 candidate emission is blocked unless the nearest trigger respects the HTF authority dealing range, avoids equilibrium, and clears the Pine baseline risk/reward floor.

# Root cause implemented

`SignalEngine::EvaluateSymbol()` previously emitted candidates from the nearest fib trigger with no institutional value-zone authority gate and no Pine-aligned minimum RR check. The patch reconstructs the HTF authority range from the existing `HTF_AF` `FibLevelOut[]` set, classifies `PREMIUM` / `DISCOUNT` / `EQUILIBRIUM`, blocks invalid triggers before lifecycle scoring continues, then suppresses candidates when computed RR is below the Pine `min_rr = 2.0` baseline.

# Exact files changed

- `mt5/SignalEngine.mqh` — added HTF authority range reconstruction, AOV state classification, equilibrium and wrong-side blocking, RR computation, and MT5-local diagnostics.
- `reports/codex-implementation.md` — implementation summary required by the contract.
- `reports/phase4-gate.json` — parity-validator machine-readable gate output from the available synthetic self-test path.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-28_aov-authority-patch.md` — runtime-integrity bug sweep for the patch surface.
- `.github/migration/audits/phase-6-mt5-signal-parity-2026-05-28.md` — parity audit separating repo-level pass evidence from pending live MT5 proof.

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php scripts/parity-validator.php` -> PASS, synthetic self-test `384/384` exact matches
- `php scripts/parity-validator.php --out reports/phase4-gate.json` -> PASS, synthetic self-test gate artifact written

# Reports generated

- `reports/codex-implementation.md`
- `reports/phase4-gate.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-28_aov-authority-patch.md`
- `.github/migration/audits/phase-6-mt5-signal-parity-2026-05-28.md`

# Remaining risks

Manual MT5 or Strategy Tester evidence is still required to prove one allowed discount-long, one allowed premium-short, one blocked equilibrium case, and one blocked RR-below-minimum case. `reports/phase4-gate.json` was produced from the validator's documented synthetic self-test because no fresh MT5/Pine export pair was available in the repo, so operational parity closeout remains pending.

# Any contract ambiguities resolved during implementation

The contract did not explicitly say whether to skip past an invalid nearest trigger and search for a farther valid level. I applied the narrowest safe interpretation: preserve nearest-trigger selection, then block emission when that nearest trigger is equilibrium, in the wrong value zone, or below the Pine RR floor.
