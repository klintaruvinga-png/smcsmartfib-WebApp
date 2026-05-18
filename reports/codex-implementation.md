# Issue summary

Stopped — the implementation contract claims the MT5 heartbeat dispatch call is missing, but the repository already calls `engine.SendHeartbeat()` from `OnTimer()` in `mt5/SMC_MarketDataEA.mq5`.

# Root cause implemented

Not implemented — Codex stopped before code changes. The contract’s required patch is invalid against repository reality because heartbeat dispatch is already wired, so applying the prescribed change would widen scope and misdiagnose the chart/live-polling failure.

# Exact files changed

None — no files changed.

# Tests run

None — stopped before code changes.

# Reports generated

None — stopped before code changes.

# Remaining risks

The current issue remains unresolved because the supplied contract targets the wrong failure path. Additional repo evidence also shows `mt5/SMC_MarketDataEA.mq5` references `HeartbeatIntervalTicks` in `OnInit()` without a matching input declaration in the inspected file, which suggests the MT5 side needs a fresh reality-based diagnosis before any patch is safe.

# Any contract ambiguities resolved during implementation

Resolved to stop on the smallest safe interpretation: the contract’s confirmed root cause is contradicted by the repository because `engine.SendHeartbeat()` already exists at `mt5/SMC_MarketDataEA.mq5:271`, so I treated this as a contract-versus-repo conflict and did not apply speculative changes.
