## 1. Issue validation

- Confirmed: `mt5/MarketDataEngine.mqh` dispatches `SendSignalCandidatesToBackend()` on cadence and does not consult any persisted signal lifecycle before POST.
- Confirmed: `mt5/SignalEngine.mqh::EvaluateSymbol()` is stateless scoring logic. It computes candidate shape and RR/AOV gates, but it does not and should not act as the authoritative live-signal lifecycle gate.
- Confirmed: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php::post_ea_signal_candidates()` currently writes every valid candidate into `smc_sf_mt5_signal_candidates` and only calls `classify_signal_drift()`. No suppression or lifecycle resolution exists there.
- Confirmed: the backend already has authority-side inputs that can support lifecycle decisions without moving truth to the frontend: `get_cached_price()` over `smc_sf_snapshots`, and Phase 2 trade telemetry in `smc_sf_trade_positions` / `smc_sf_trade_orders`.
- Confirmed: the report is correct that duplicate same-range MT5 candidates are not currently blocked.
- Likely: the user-visible spam is caused by repeated writes of same-symbol same-direction same-range candidates while the earlier candidate is still pre-entry active or already represented by a live MT5 order/position.
- Likely: the smallest safe fix is backend-only candidate suppression at ingest. This preserves backend authority, avoids Pine formula changes, and avoids pushing lifecycle inference into MT5 scoring code.
- Unconfirmed: the report does not prove that `mt5/SignalEngine.mqh` needs logic changes. That is rejected as implementation scope.
- Unconfirmed: the report does not prove that `smc_sf_signals` is the right lifecycle authority for this rule. It is not sufficient because it lacks MT5 candidate SL/TP lifecycle truth and mixes Pine/backend signal paths.
- Unconfirmed: “same range” is not explicitly modeled today. The safest in-contract definition is the existing MT5 candidate tuple `symbol + direction + fib_family + fib_ratio + near-equal fib_level`, without adding schema fields.
- Corrected root cause: the missing authoritative gate is in backend MT5 candidate ingest, not in Pine formulas and not in MT5 candidate scoring math.

## 2. Implementation contract

- File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Modify: `public function post_ea_signal_candidates(WP_REST_Request $request)`
- Modify: add new private helpers immediately above `classify_signal_drift()`:
  `find_latest_mt5_candidate_for_range(...)`, `get_mt5_candidate_lifecycle_state(...)`, `candidate_matches_trade_record(...)`, and a small directional price-cross helper.
- Exact change required: before `$wpdb->replace()` for each candidate, load the latest persisted MT5 candidate for the same `user_id`, `symbol`, `direction`, `fib_family`, and `fib_ratio`, then treat it as the same range only if `fib_level` is within one symbol pip of the stored `fib_level`. Do not use timestamp-only dedupe.
- Exact change required: evaluate prior-candidate lifecycle from backend authority only, in this order:
  `ACTIVE_OPEN_POSITION` when a fresh open MT5 position matches symbol, direction, and candidate price levels within tolerance;
  `ACTIVE_PENDING_ORDER` when a fresh active MT5 pending order matches the same way;
  `ACTIVE_PRE_ENTRY` when live MT5 snapshot data exists and the prior candidate entry has not yet been crossed;
  `INACTIVE_STOPPED_OUT` when live MT5 snapshot data exists and price has crossed the prior candidate SL in the adverse direction;
  `INACTIVE_ENTRY_PASSED` when live MT5 snapshot data exists, no matching open order/position exists, and the prior entry has already been crossed;
  `LIFECYCLE_UNRESOLVED` when snapshot or telemetry freshness is insufficient to decide safely.
- Exact change required: suppress the new candidate write only for `ACTIVE_OPEN_POSITION`, `ACTIVE_PENDING_ORDER`, or `ACTIVE_PRE_ENTRY`. In all other states, preserve current write behavior.
- Exact change required: on suppression, do not mutate existing candidate rows, do not create a replacement row, and do not fabricate closure state. Emit a diagnostic log or audit payload containing prior candidate id, incoming candidate id, symbol, direction, and suppression basis.
- Exact change required: when lifecycle is unresolved because authority data is stale or missing, fail open and keep current ingest behavior. Do not suppress from stale data.
- Guard rails: do not change `POST /ea/signal-candidates` route registration, payload field names, candidate table schema, valid status set (`WATCH|ARMED|READY`), `classify_signal_drift()` semantics, stale-data protections, or Phase 6 parity logic.
- Guard rails: do not add frontend logic, do not read dashboard state, do not make `smc_sf_signals` the lifecycle authority for this rule, and do not alter RR/AOV or Pine formulas.
- Why this file is in scope: it is the only reviewed authority boundary that already sees MT5 candidates, live snapshots, and trade telemetry together.
- Acceptance criterion tied to the failure path: two consecutive MT5 candidates for the same symbol/direction/range must result in one stored row when the earlier candidate is still active by live backend authority; the next candidate must store normally once that earlier lifecycle is no longer active.

- File: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- Modify: the existing MT5 candidate ingest test block around `post_ea_signal_candidates()` assertions.
- Exact change required: add a regression that seeds a live MT5 snapshot and a first candidate, then submits a second same-range candidate with unchanged pre-entry validity and verifies that only the first candidate row remains stored.
- Exact change required: add a regression that seeds matching Phase 2 open position or active order telemetry for the prior candidate and verifies same-range suppression still holds even after entry would otherwise be crossed.
- Exact change required: add a regression that proves backend authority is preserved by allowing a new same-range candidate when the prior entry has been crossed but there is no fresh matching open order/position.
- Exact change required: preserve the existing Pine drift assertions for written candidates and add no assertions that require new API response fields.
- Guard rails: do not weaken the existing exact/mismatch drift checks, timestamp normalization checks, or market-stream contract checks.
- Why this file is in scope: it is the existing backend contract test that already exercises candidate ingest and mocked DB behavior.
- Acceptance criterion tied to the failure path: the test suite must fail if duplicate same-range candidates are written during an active lifecycle, and must still pass the current parity/drift contract checks.

## 3. Patch sequence

1. Implement backend lifecycle helpers in `smc-superfib-sniper.php` using existing authority readers only: `get_cached_price()`, `read_trade_positions()`, and `read_trade_orders()`.
2. Wire those helpers into `post_ea_signal_candidates()` before candidate persistence.
3. Add suppression diagnostics in the same function without changing the REST route or requiring schema changes.
4. Extend `test-mt5-snapshot-contract.php` to cover active pre-entry suppression, active order/position suppression, and post-entry release when no authoritative trade state exists.
5. Run the backend contract tests, then run the existing MT5 dispatch regression to confirm MT5 payload/scoring code was not changed.

- Dependencies: step 2 depends on the helper contract from step 1; step 4 depends on the exact suppression states introduced in step 2.
- Sequencing risk: do not add DB columns or new response fields first. This patch should remain schema-free and contract-preserving.
- State/cache risk: lifecycle suppression must use fresh MT5 snapshot and fresh trade telemetry only. Do not consult cached frontend state or stale snapshot rows.

## 4. Regression guards

- Verify `classify_signal_drift()` still runs unchanged for every candidate that is actually written.
- Verify `get_cached_price()` freshness handling remains the gate for any snapshot-based lifecycle decision.
- Verify Phase 2 telemetry freshness still controls whether open positions/orders can be treated as authoritative.
- Verify `post_execute_signals()` remains limited to backend-confirmed `READY` signals and is not broadened by this patch.
- Verify `mt5/SignalEngine.mqh` RR and AOV guards remain untouched.
- Verify no new candidate suppression occurs when snapshot/telemetry authority is stale or unavailable.
- Required parity re-validation: MT5 candidate ingest must still populate drift diagnostics for written candidates, and the dashboard drift endpoint must remain a report of stored candidates only.
- Required diagnostics after patch: each suppression path must emit one structured log or audit event with suppression basis `ACTIVE_PRE_ENTRY`, `ACTIVE_PENDING_ORDER`, or `ACTIVE_OPEN_POSITION`. Each unresolved lifecycle path should emit a diagnostic reason without suppressing.

## 5. Non-goals

- Do not modify `mt5/MarketDataEngine.mqh`.
- Do not modify `mt5/SignalEngine.mqh`.
- Do not change Pine trading formulas, RR thresholds, AOV gates, or status scoring.
- Do not add new MT5 payload fields, new REST endpoints, or frontend-side suppression.
- Do not redesign `smc_sf_signals` lifecycle state or introduce new dashboard truth rules.
- Do not add schema migrations for candidate lifecycle columns in this patch.
- Avoid the attractive but unsafe follow-on of making MT5 itself decide whether a signal remains active across fills/stops. That would duplicate authority and widen parity risk.
- Avoid the attractive but unsafe follow-on of using only `status != 'CLOSED'` from `smc_sf_signals` as the suppression source. That is not the right authority surface for this defect.

## 6. Risk assessment

- Worst-case failure mode if patched incorrectly: valid fresh signals are suppressed across an active market because stale or mismatched authority data is treated as definitive.
- User-visible failure mode: the dashboard either continues spamming duplicate candidates or goes silent on legitimate new setups after one earlier signal.
- Backend authority risk: inferring “entry triggered” from price alone after the fact can corrupt lifecycle truth if open order/position telemetry is ignored. The patch must only use price alone for pre-entry validity and explicit adverse-stop invalidation.
- Stale-state risk: using stale snapshots or stale trade telemetry to keep a prior signal active would block legitimate replacements and violate Phase 0 protections.
- Human approval before merge: required. This touches live signal suppression logic and changes operator-visible behavior in a trading workflow.

## 7. Test requirements

- Add tests in `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` for:
  pre-entry duplicate suppression with live snapshot authority;
  duplicate suppression while matching open MT5 position exists;
  duplicate suppression while matching active MT5 pending order exists;
  acceptance of a new candidate after entry has been crossed when no fresh matching open order/position exists.
- Existing tests that must still pass:
  `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  `scripts/mt5-signal-dispatch.test.mjs`
- Manual verification required:
  replay two candidate batches 120 seconds apart for the same symbol/range with live snapshot still pre-entry and confirm one stored candidate only;
  replay the same scenario with a matching open MT5 position and confirm suppression continues;
  replay with entry crossed and no matching open order/position and confirm the next candidate is stored;
  inspect `GET /market-data/signal-drift` and confirm stored-candidate diagnostics still serialize correctly.
- Soak/live verification needed: one short MT5 dual-run observation window covering at least one repeated candidate cycle and one lifecycle transition, with suppression logs captured.

## 8. Implementation handoff

- Branch naming recommendation: `fix/mt5-signal-lifecycle-suppression`
- Suggested commit grouping:
  `backend: suppress duplicate active MT5 candidates at ingest`
  `tests: add MT5 candidate lifecycle suppression contract coverage`
- Required reports or artifacts after implementation:
  updated `reports/codex-implementation.md`
  command output for the PHP contract test and `scripts/mt5-signal-dispatch.test.mjs`
  one short suppression-log excerpt showing the active-lifecycle basis used
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
