## Issue summary

Stopped — the implementation contract assumes heartbeat has no existing EA call site, but `mt5/SMC_MarketDataEA.mq5` already dispatches `engine.SendHeartbeat()` from `OnTimer()`.

## Root cause implemented

Not implemented — Codex stopped before code changes. Pre-patch verification found an existing heartbeat dispatch path in `mt5/SMC_MarketDataEA.mq5`, so adding a second call in `mt5/MarketDataEngine.mqh::OnPeriodic()` would violate the contract and risk duplicate heartbeats instead of addressing the real failure path.

## Exact files changed

None — no files changed.

## Tests run

None — stopped before code changes.

## Reports generated

None — stopped before code changes.

## Remaining risks

The current issue is not a missing call site in `OnPeriodic()`. The real defect is elsewhere in the existing `OnTimer() -> engine.SendHeartbeat()` path or in the cadence/validation expectation around `g_heartbeatIntervalTicks=48`, and that conflict must be re-planned before any production patch is applied.

## Any contract ambiguities resolved during implementation

The contract and research reports claimed `SendHeartbeat()` had no invocation outside its definition, but repository inspection found `engine.SendHeartbeat()` already present in `mt5/SMC_MarketDataEA.mq5`. I treated that as a hard stop because the contract explicitly says to stop when repository reality conflicts with the verified plan.
