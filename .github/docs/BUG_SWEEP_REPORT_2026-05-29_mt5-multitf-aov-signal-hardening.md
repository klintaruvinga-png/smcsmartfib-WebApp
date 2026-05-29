# Bug Sweep Report - 2026-05-29 - MT5 Multi-Timeframe AOV Signal Hardening

## Scope

Focused sweep of the Phase 6 MT5 signal-input hardening patch across:

- `mt5/FibEngine.mqh`
- `mt5/SignalEngine.mqh`
- `mt5/MarketDataEngine.mqh`
- `scripts/mt5-signal-dispatch.test.mjs`

## Findings

- `0` confirmed runtime regressions introduced by the patch.
- `0` stale-data protection regressions.
- `0` backend-authority or payload-shape regressions.

## Evidence

- `npx vitest run scripts/mt5-signal-dispatch.test.mjs` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` -> PASS
- `php scripts/parity-validator.php` -> PASS, synthetic self-test mode, `384/384` exact matches
- `php scripts/parity-validator.php --out reports/phase4-gate-2026-05-29.json` -> PASS, machine-readable parity gate artifact written
- `npm run validate:impl` -> PASS after restoring `reports/codex-implementation.meta.json`

## Residual Risks

- Repo-level validation does not behaviorally execute MT5 Strategy Tester logic.
- Final operational closeout still requires one H1/H4 pass case, one equilibrium block case, one RR-below-minimum block case, and one clean `/ea/signal-candidates` dispatch capture from MT5 logs or Strategy Tester replay.
- The parity gate artifact generated here is synthetic self-test output because no fresh MT5/Pine export pair was available in the repo.

## Conclusion

The repository-level patch is code-safe and preserves backend authority, payload shape, and stale-data protections while closing the confirmed M15-only signal-input gap. Remaining risk is live MT5 replay verification, not an unresolved repo defect in the patched path.
