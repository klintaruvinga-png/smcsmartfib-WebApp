## Issue summary

Stopped — the implementation contract for MT5 Change B-1 conflicts with repository reality because `SendHeartbeat()` is already invoked from `mt5/SMC_MarketDataEA.mq5`.

## Root cause implemented

Not implemented — Codex stopped before code changes. The contract requires halting B-1 if any `SendHeartbeat()` call site exists outside its definition, and a full-text search found `engine.SendHeartbeat();` in `mt5/SMC_MarketDataEA.mq5`.

## Exact files changed

None — no files changed.

## Tests run

None — stopped before code changes.

## Reports generated

None — stopped before code changes.

## Remaining risks

The contract assumes the heartbeat path is unwired in `OnPeriodic()`, but this branch already dispatches heartbeat from `OnTimer()` with `g_heartbeatTickCount` throttling. Proceeding would risk duplicating or misdiagnosing the MT5 live-state path without a corrected contract for the actual failure.

## Any contract ambiguities resolved during implementation

The contract suggested split implementation branches, but runtime context required `codex/smc-intake-chart-ticker-and-live-polling-is-brok`, so that branch was used. The stopping conflict was the verified presence of `engine.SendHeartbeat();` in `mt5/SMC_MarketDataEA.mq5`, which invalidates the B-1 assumption before any safe patch can be applied.
