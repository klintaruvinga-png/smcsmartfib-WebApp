# Bug Sweep Report — Heartbeat Timer Observability

Date: 2026-05-17
Issue: `SMC Intake - Re-plan and run targeted checks: confirm OnTimer() prints in live logs and that g_heartbeatTickCount increments`
Scope: `mt5/SMC_MarketDataEA.mq5`, `mt5/MarketDataEngine.mqh`, live MT5 journal evidence

## Confirmed findings

- `mt5/SMC_MarketDataEA.mq5` increments `g_heartbeatTickCount` inside `OnTimer()` and resets it only after the existing threshold check.
- `mt5/MarketDataEngine.mqh` already logs `SMC_MarketDataEA: OnPeriodic fired`, `[Heartbeat] Dispatch`, and `[Heartbeat] OK.` in the normal timer/heartbeat path.
- Current live MT5 journal evidence from `C:\Users\LEONNA\AppData\Roaming\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\logs\20260517.log` shows repeated `OnPeriodic fired` lines and successful heartbeat dispatches at lines `36358-36359`.
- Current live MT5 journal evidence does not contain any `DEBUG OnTimer` lines yet (`count=0`), which is expected because this repo patch has not been redeployed into the running EA binary.

## Patch applied

- Added one additive `PrintFormat("DEBUG OnTimer: heartbeatTick=%d / interval=%d", ...)` immediately after `g_heartbeatTickCount++` in `mt5/SMC_MarketDataEA.mq5`.
- No heartbeat cadence, reset condition, dispatch call site, payload, auth contract, or stale-data guard was changed.

## Runtime integrity assessment

- Backend authority: preserved.
- Heartbeat route/auth semantics: unchanged.
- Stale-data protection: unchanged.
- Symbol polling and `engine.OnPeriodic()` path: unchanged in source; historical live logs still prove the pre-existing path is active.

## Remaining gaps

- The new `DEBUG OnTimer` line is not yet verified in live logs because the patched EA source has not been rebuilt and attached on the active terminal from this workspace.
- `g_heartbeatTickCount` progression to `48` cannot be claimed as live-verified until the deployed binary emits the new debug line through one full interval.
- Local MetaEditor CLI compilation of the patched repo source was inconclusive: the executable returned cleanly, but no new compiler log entry or `.ex5` artifact was produced for the isolated validation copy.

## Required follow-up

1. Rebuild the patched EA inside the target MT5 environment.
2. Reattach or reload the patched EA on the live chart.
3. Capture at least 48 consecutive `DEBUG OnTimer` lines plus the next `[Heartbeat] Dispatch` and `[Heartbeat] OK.` pair.
4. Confirm backend heartbeat receipt timestamp matches the dispatch window.
