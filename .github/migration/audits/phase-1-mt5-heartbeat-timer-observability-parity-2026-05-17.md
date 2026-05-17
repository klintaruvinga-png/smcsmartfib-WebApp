# Phase 1 MT5 Heartbeat Timer Observability Parity Audit

Date: 2026-05-17
Phase: 1
Engine: MT5 EA heartbeat path
Issue: `SMC Intake - Re-plan and run targeted checks: confirm OnTimer() prints in live logs and that g_heartbeatTickCount increments`

## Objective

Confirm that Phase 1 heartbeat liveness can be verified from MT5 runtime logs without changing backend authority, payload shape, or heartbeat cadence.

## Source parity result

- `mt5/SMC_MarketDataEA.mq5` remains the only heartbeat trigger point. `engine.SendHeartbeat()` is still called only after `g_heartbeatTickCount >= g_heartbeatIntervalTicks`.
- `mt5/MarketDataEngine.mqh` still owns the authoritative heartbeat transport and logs `[Heartbeat] Dispatch` and `[Heartbeat] OK.` on the normal path.
- The patch adds observability only: one `DEBUG OnTimer` line after the counter increment.

## Live evidence available

- `C:\Users\LEONNA\AppData\Roaming\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\logs\20260517.log` contains repeated `SMC_MarketDataEA: OnPeriodic fired` lines through `17:55:02` local terminal time.
- The same log contains successful heartbeat evidence at:
  - `14:16:14` dispatch / `14:16:15` OK
  - `15:19:55` dispatch / `15:19:56` OK
  - `16:15:32` dispatch / `16:15:34` OK
  - `17:15:54` dispatch / `17:15:56` OK
- `DEBUG OnTimer` is absent from current live logs (`count=0`), so the patched instrumentation is not yet deployed in the running EA.

## Validation status

- Source parity: PASS
- Existing live heartbeat path present: PASS
- Existing live `OnPeriodic` path present: PASS
- New `DEBUG OnTimer` live-log observability: PENDING DEPLOY
- Live confirmation that `g_heartbeatTickCount` increments from `1` to `48`: PENDING DEPLOY
- Backend receipt confirmation after patched deployment: PENDING DEPLOY
- MetaEditor compile proof for the patched repo source: INCONCLUSIVE from this workspace

## Conclusion

Phase 1 heartbeat authority and cadence remain intact in source, and the live environment already proves the current EA reaches both `OnPeriodic` and heartbeat dispatch successfully. The remaining gap is deployment of the new additive `DEBUG OnTimer` instrumentation so the timer tick counter can be observed directly in the live journal across one full heartbeat interval.
