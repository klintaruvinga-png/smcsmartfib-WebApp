# Bug Sweep Report

Date: 2026-05-29
Scope: Backend MT5 signal-candidate lifecycle suppression, stale-data fail-open behavior, and backend-authority preservation for same-range duplicate candidates.

## Integrity checks performed

- Verified `wordpress/smc-superfib-sniper/smc-superfib-sniper.php::post_ea_signal_candidates()` now checks the latest persisted MT5 candidate for the same `symbol + direction + fib_family + fib_ratio` tuple and only treats it as the same range when `fib_level` stays within one pip.
- Verified lifecycle authority stays backend-only by using existing MT5 snapshot and Phase 2 telemetry readers instead of frontend state, Pine formulas, or `smc_sf_signals`.
- Verified suppression only occurs for `ACTIVE_PRE_ENTRY`, `ACTIVE_OPEN_POSITION`, and `ACTIVE_PENDING_ORDER`, while stale or missing authority continues to fail open.
- Verified `classify_signal_drift()` still runs unchanged for candidates that are actually written.
- Verified each suppression path emits a backend diagnostic with prior candidate id, incoming candidate id, symbol, direction, and suppression basis.

## Findings

- Confirmed fixed: duplicate same-range candidates are no longer written while the prior candidate remains pre-entry valid under a live MT5 snapshot.
- Confirmed fixed: duplicate same-range candidates remain suppressed after entry is crossed when a matching live MT5 open position exists.
- Confirmed fixed: duplicate same-range candidates remain suppressed after entry is crossed when a matching live MT5 pending order exists.
- Confirmed preserved: a new same-range candidate is still written after entry is crossed when no fresh matching open position or pending order exists.
- Confirmed preserved: unresolved authority states keep current ingest behavior and log diagnostics instead of suppressing from stale data.

## Suppression log excerpt

`[SMC_SF] ea/signal-candidates suppressed prior=mt5-audusd-pos-1 incoming=mt5-audusd-pos-2 symbol=AUDUSD direction=LONG basis=ACTIVE_OPEN_POSITION reason=matching_open_position`

## Residual risks

- The release path still relies on `read_trade_positions()` and `read_trade_orders()` empties meaning “no matching live trade,” because the contract did not authorize widening telemetry authority beyond those existing readers.
- Live soak verification is still required against a real 120-second MT5 candidate cycle to confirm the backend suppression and release states line up with broker-side fills and stop events.
- This patch intentionally avoids mutating old candidate rows or fabricating closure state, so downstream consumers that want explicit historical lifecycle labels will still need a separate contract.
