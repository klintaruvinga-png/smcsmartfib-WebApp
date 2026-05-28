# Issue summary

Hardened the progressive entry lot-sizing contract with backend and dashboard regression coverage so plan generation, execute-signals queueing, and plan-card rendering all stay pinned to backend-authored stage lots.

# Root cause implemented

Implemented missing regression coverage around a high-risk backend-authoritative sizing path. No production PHP change has been applied because the current repository evidence does not yet prove a plan-math or queue-mapping defect; the patch first locks the contract in tests.

# Exact files changed

- `wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php` — extended the shared PHP harness with the minimal REST and wpdb doubles needed to exercise deterministic plan-building and execute-signals queueing.
- `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` — added backend regression coverage for risk-derived stage lot sizing, FX pip valuation, and the `0.01` floor.
- `wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` — added backend regression coverage for stored-plan to queued-order stage lot, TP, SL, deterministic ID, and authority-gate behavior.
- `src/routes/-plan.test.tsx` — added a focused assertion that the dashboard mirrors backend `lotSize.e1/e2/e3` values without recomputing them.

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php` -> PASS
- `npx vitest run src/routes/-plan.test.tsx` -> PASS (`15/15`)
- `node scripts/validate-implementation.mjs` -> PASS after adding the required `reports/codex-implementation.meta.json`

# Reports generated

- `reports/codex-implementation.md` — required implementation summary written before validation per contract.
- `reports/codex-implementation.meta.json` — required implementation metadata with `plan_hash` for pipeline validation.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-28_progressive-entry-lot-sizing.md`
- `.github/migration/audits/phase-0-backend-dashboard-progressive-lot-sizing-parity-2026-05-28.md`

# Remaining risks

- No production defect was proven by the contracted regression set, so this patch intentionally does not change `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`. A real future defect in `build_trade_plan()` or `post_execute_signals()` would still require a surgical backend patch against the now-pinned failure path.
- Broker-specific pip-value assumptions for non-forex instruments remain outside this patch scope.
- Live broker or MT5 capture for the same staged-lot plan and queued payload is still a manual follow-up, not a repo-local verified fact.

# Any contract ambiguities resolved during implementation

- The plan document suggested a branch naming recommendation that differed from runtime context. Resolved by following the required runtime branch `codex/smc-intake-progressive-entry-lot-sizing-patch`.
- The contract authorized production PHP edits only if a targeted failing test proved a concrete defect. Resolved by implementing test coverage first and deferring any production logic change unless validation proves one is necessary.
