# Bug Sweep Report - 2026-05-28 - AOV Authority Patch

## Scope

Focused sweep of the MT5 Phase 6 signal-gating patch applied in `mt5/SignalEngine.mqh` to enforce:

- HTF authority dealing-range gating from existing `HTF_AF` levels
- equilibrium trigger suppression
- wrong-side premium/discount suppression
- Pine-baseline `min_rr = 2.0` suppression

## Findings

- `0` confirmed backend contract regressions.
- `0` confirmed stale-data protection regressions.
- `0` confirmed Phase 4 fib-geometry regressions in repo-level validation.
- `1` remaining operational evidence gap: live MT5 or Strategy Tester proof for allowed and blocked candidate cases is still pending.

## Evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php scripts/parity-validator.php` -> PASS, synthetic self-test `384/384` exact matches
- `php scripts/parity-validator.php --out reports/phase4-gate.json` -> PASS, synthetic self-test gate report written
- `mt5/SignalEngine.mqh` now logs symbol, selected fib family, selected ratio, derived zone state, RR, and explicit block reasons for `AOV_EQUILIBRIUM_ZONE`, `AOV_EQUILIBRIUM_LEVEL`, `AOV_DIRECTIONAL_MISMATCH`, and `RR_BELOW_MIN`

## Residual Risks

- This workspace cannot produce the required live MT5 or Strategy Tester captures, so repo validation does not prove a real blocked equilibrium case or real blocked sub-`2.0` RR case yet.
- The parity gate JSON generated here is the validator's documented synthetic self-test because no fresh `--mt5-file` and `--pine-file` export pair was available in the repository.
- The patch intentionally preserves nearest-trigger behavior. If product intent later requires searching past an invalid nearest level for a farther valid level, that would need a separate contract because it changes the signal-selection rule.

## Conclusion

The AOV authority patch is code-safe at the repository level and preserves backend authority boundaries and payload shape. Remaining risk is limited to runtime proof of the new signal-gating behavior in MT5, not an uncovered repo regression in the patched code path.
