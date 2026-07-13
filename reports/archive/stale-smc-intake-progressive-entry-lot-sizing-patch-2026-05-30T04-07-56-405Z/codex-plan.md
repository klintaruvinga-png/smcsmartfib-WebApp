## 1. Issue validation

- `Confirmed`: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `build_trade_plan()` computes `lotSize.e1/e2/e3` from backend risk budget, `1:2:3` stage weights, stage-specific stop distance, instrument `pip_size`, and `pip_value_per_standard_lot()`, then floors to `0.01`.
- `Confirmed`: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `post_execute_signals()` reads the stored plan and queues each stage with `lots = plan['lotSize'][$stage]`, deterministic `signalId|stage` order IDs, and stage-correct TP mapping.
- `Confirmed`: `src/types/sniper.ts`, `sdk/src/types/index.ts`, and `src/components/PlanCard.tsx` already mirror the backend `lotSize: { e1, e2, e3 }` contract; `src/lib/api/sniperClient.ts` posts only `signalIds` to `/user/execute-signals`, so the frontend is not authoring lot values.
- `Likely`: the immediate defect path is insufficient regression coverage on a high-risk backend-authoritative sizing flow, not a currently-proven cross-layer mismatch.
- `Unconfirmed`: the report does not prove the current backend lot math is wrong.
- `Unconfirmed`: the report does not prove the queue path is rewriting or flattening lots.
- `Unconfirmed`: the report does not prove any current frontend path still emits legacy fixed-lot assumptions.
- `Unconfirmed`: broker-specific `pip_val` assumptions for `US30`, `NAS100`, `BTCUSD`, and `ETHUSD` remain unverified against live broker contract specs.
- `Rejected root cause`: “backend/UI/queue mismatch is the most likely root cause” is too weak as stated.
- `Corrected root cause`: the repo proves a backend-authoritative progressive lot-sizing contract, but it lacks direct regression coverage that would catch plan-math drift, stage-to-queue drift, or backend-to-dashboard mirror drift before merge.

## 2. Implementation contract

- `wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php`
  Exact target: test bootstrap helpers only.
  Exact change required: add only the minimal test doubles needed to exercise progressive lot-size plan generation and `/user/execute-signals` queueing deterministically if current helpers are insufficient.
  Guard rails: do not change production code through helpers, do not fake success paths that bypass current READY/backend-confirmed/staleness rules.
  Why this file is in scope: the current helper set is reflection-oriented but does not obviously cover REST request and queue-path fixtures.
  Acceptance criterion: new progressive lot-size regression tests can run in isolation without external services or live MT5 dependencies.

- `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
  Exact target: new backend regression test covering `build_trade_plan()`.
  Exact change required: assert that `lotSize.e1/e2/e3` is derived from `riskUSC`, `1:2:3` weights, stage-specific stop distances, market-aware FX pip valuation, and the `0.01` minimum floor; include at least one case where differing stop distances still produce backend-authored stage lots rather than a flat ladder.
  Guard rails: do not change Pine formulas, fib ratios, plan shape, stale quote gating, or instrument registry behavior in this test.
  Why this file is in scope: this is the authoritative failure path for incorrect lot sizing.
  Acceptance criterion: the test fails on any regression that flattens lots, ignores stage stop distance, ignores risk allocation, or drops the `0.01` floor.

- `wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php`
  Exact target: new backend regression test covering `post_execute_signals()`.
  Exact change required: seed a stored plan with distinct `lotSize` values and assert queued payloads preserve per-stage `lots`, `tp1/tp2/tp3` mapping, per-stage stops, deterministic order IDs, and existing READY/backend-confirmed gating.
  Guard rails: do not alter the REST request shape, queue schema, dedupe behavior, or execution authorization rules.
  Why this file is in scope: the execution queue is the live exposure boundary.
  Acceptance criterion: the test fails if any queued stage receives the wrong `lots`, wrong TP, or is allowed through when backend authority checks should block it.

- `src/routes/-plan.test.tsx`
  Exact target: plan-page rendering assertions around `PlanCandidateCard`.
  Exact change required: add a focused assertion that the rendered stage lots shown for `E1/E2/E3` match `plan.lotSize.e1/e2/e3` from the backend-authored ladder and are not recomputed or flattened in the UI.
  Guard rails: do not add frontend lot math, do not change plan ranking, and do not weaken the existing execution-disabled behavior for unconfirmed or incomplete plans.
  Why this file is in scope: it is the existing plan-view regression surface already covering ladder completeness.
  Acceptance criterion: the test fails if the dashboard no longer mirrors backend lot sizes stage-by-stage.

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  Exact target: `build_trade_plan()` and/or `post_execute_signals()` only if one of the new targeted tests proves a concrete defect.
  Exact change required: patch only the specific failing branch exposed by the test; keep the fix local to lot derivation or stage queue mapping.
  Guard rails: do not widen into a strategy rewrite, do not change signal gating, do not change stale-data protections, do not change frontend authority boundaries, and do not alter Pine-derived fib logic unless parity corruption is directly proven.
  Why this file is in scope: it is the only production authority for plan lot generation and queued execution sizing.
  Acceptance criterion: all new tests pass, existing authority gates still hold, and stored plan `lotSize` equals queued `lots` per stage for the failing scenario.

## 3. Patch sequence

1. Extend `wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php` only if required to support deterministic plan and queue-path fixtures.
2. Add `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` to pin backend lot derivation behavior before touching production logic.
3. Add `wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` to pin stored-plan to queued-order mapping.
4. Update `src/routes/-plan.test.tsx` to pin the dashboard mirror of backend `lotSize`.
5. Run the new tests plus existing parity tests; inspect failures before editing production PHP.
6. Touch `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` only if a targeted failing test identifies an actual defect.
7. Re-run the full targeted regression set after any production fix.

- Dependencies: backend tests must be written before any PHP logic change so the failure path is explicit and reversible.
- Sequencing risk: patching queue mapping before pinning plan math can mask whether the defect is in generation or execution consumption.
- State/cache/migration risk: no schema migration is authorized; no cache or stale-data bypass is authorized.

## 4. Regression guards

- Re-run existing `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`; market-aware FX pip valuation must still pass unchanged.
- Re-run existing `src/routes/-plan.test.tsx` completeness coverage; three-stage ladder completeness rules must still hold.
- Verify `/user/execute-signals` still accepts only `signalIds` from the client and still sources `lots` from the stored backend plan.
- Verify `post_execute_signals()` still rejects non-`READY` or `backend_confirmed=0` signals.
- Verify deterministic order ID generation from `signalId|stage` is unchanged.
- Verify stage-specific TP mapping `e1->tp1`, `e2->tp2`, `e3->tp3` is unchanged.
- Verify the `0.01` minimum lot floor still holds.
- Parity re-validation required: backend plan `lotSize` to queued order `lots`, and backend plan `lotSize` to dashboard display.
- Logging/diagnostics after patch: no new runtime logging is required for a test-only patch; if production PHP changes become necessary, add only a scoped diagnostic for missing or invalid per-stage lot data before queue insertion.

## 5. Non-goals

- Do not rewrite the risk model, fib model, or Pine formulas.
- Do not change `src/types/sniper.ts`, `sdk/src/types/index.ts`, `src/components/PlanCard.tsx`, `src/mocks/sniperData.ts`, or `sdk/src/mocks/fixtures.ts` unless a targeted test proves the current contract is wrong.
- Do not rework instrument specs for `US30`, `NAS100`, `BTCUSD`, or `ETHUSD` in this patch; that needs separate broker-spec evidence.
- Do not change REST shapes, queue table schema, selectors, IDs, hook points, or dashboard ranking behavior.
- Do not add frontend-side fallback lot calculations.
- Avoid attractive but unsafe follow-ons: broker-economics normalization, wider plan-card redesign, SDK contract refactors, or Pine/backend reconciliation outside this failure path.

## 6. Risk assessment

- Worst-case failure mode if patched incorrectly: MT5 receives oversized or undersized staged orders, breaking account exposure control.
- User-visible failure mode: the dashboard displays one ladder while the queued orders carry different `lots`, causing silent trust loss and execution drift.
- Backend authority risk: any frontend recomputation or client-supplied lot value would violate the current source-of-truth contract.
- Stale-state risk: any attempt to “fix” sizing by bypassing existing freshness or backend-confirmation gates is unacceptable.
- Human approval before merge: required, because this patch touches financial exposure logic or its authoritative test coverage.

## 7. Test requirements

- Add `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` for backend plan lot derivation.
- Add `wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` for stored-plan to queue mapping.
- Update `src/routes/-plan.test.tsx` for dashboard lot-size mirror coverage.
- Existing tests that must still pass: `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php` and the full existing `src/routes/-plan.test.tsx` suite.
- Manual verification required after implementation:
  - build one representative FX plan and confirm `lotSize.e1/e2/e3` are non-flat when stop distances or pip values warrant it;
  - queue the same plan and confirm queued `lots` match stored plan stage-by-stage;
  - open the plan page and confirm displayed stage lots match the backend ladder exactly.
- Replay/parity verification needed: one USD-quoted FX pair and one non-USD FX pair minimum; if production PHP changes touch registry economics, add one index or crypto sample before merge.
- Live-environment verification needed: review one captured plan JSON and one resulting queued payload from the same signal ID after patch.

## 8. Implementation handoff

- Branch naming recommendation: `hardening/progressive-lot-size-contract`
- Suggested commit grouping:
  - `test(php): add progressive lot-size plan regression coverage`
  - `test(php): add execute-signals staged lot mapping coverage`
  - `test(frontend): pin dashboard lot-size mirror`
  - `fix(backend): correct progressive lot sizing path` only if a targeted test proves a production defect
- Required reports or artifacts after implementation:
  - targeted PHP test output
  - targeted frontend test output
  - one sample backend plan JSON showing `lotSize`
  - one sample queued order payload set for the same `signalId`
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
