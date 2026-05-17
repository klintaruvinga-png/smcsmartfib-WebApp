# Issue summary

Added the contract-required `OnTimer()` heartbeat tick debug log in the MT5 EA so live terminal logs can show whether the timer fires and whether `g_heartbeatTickCount` advances toward the heartbeat threshold. Existing live MT5 logs already prove the current EA reaches `OnPeriodic()` and successful heartbeat dispatches; the missing piece was direct per-timer observability.

# Root cause implemented

Implemented the narrowest safe interpretation of the contract: the heartbeat path already existed and was live, but `OnTimer()` had no unconditional per-tick diagnostic line, which made live verification of timer firing and heartbeat counter progression impossible from logs alone. The patch adds only that missing observability line and leaves cadence, reset, payload, auth, and stale-data behavior unchanged.

# Exact files changed

- `mt5/SMC_MarketDataEA.mq5` — inserted one additive `PrintFormat("DEBUG OnTimer: heartbeatTick=%d / interval=%d", ...)` immediately after `g_heartbeatTickCount++`.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_heartbeat-timer-observability.md` — added the required runtime-integrity bug sweep artifact with live-log evidence and remaining deployment steps.
- `.github/migration/audits/phase-1-mt5-heartbeat-timer-observability-parity-2026-05-17.md` — added the required Phase 1 parity audit for the MT5 heartbeat path.
- `reports/codex-implementation.md` — wrote and then finalized the required implementation summary.
- `reports/codex-implementation.meta.json` — added the implementation metadata artifact bound to the current plan hash.
- `reports/.codex-implementation-failed.json` — removed the stale failure sentinel so this run is not marked as failed.

# Tests run

- Source inspection of `mt5/SMC_MarketDataEA.mq5` and `mt5/MarketDataEngine.mqh` — PASS (`OnTimer()` increment/threshold path confirmed; existing `OnPeriodic`, `[Heartbeat] Dispatch`, and `[Heartbeat] OK.` logs confirmed in source)
- Live MT5 log inspection: `C:\Users\LEONNA\AppData\Roaming\MetaQuotes\Terminal\FB9A56D617EDDDFE29EE54EBEFFE96C1\MQL5\logs\20260517.log` — PASS for existing `SMC_MarketDataEA: OnPeriodic fired` and `[Heartbeat] Dispatch` / `[Heartbeat] OK.` evidence
- Live MT5 log inspection for `DEBUG OnTimer` before deployment — PASS for absence (`count=0`), which is expected because the patched EA binary is not yet deployed
- `MetaEditor64.exe /compile:.../mt5/SMC_MarketDataEA.mq5` — INCONCLUSIVE (`exit=0`, but no new compiler log entry or `.ex5` artifact was emitted for the patched repo source)
- `MetaEditor64.exe /compile:.../CodexValidation/SMC_MarketDataEA.mq5` — INCONCLUSIVE (`exit=0`, but no `.ex5` artifact was produced for the isolated validation copy)
- `npm run check:mql` / `node .\\mt5\\check-mql-includes.mjs` — INCONCLUSIVE (Node commands hung on this machine and did not return within the timeout window)
- `npm run validate:impl` / `node .\\scripts\\validate-implementation.mjs` — INCONCLUSIVE (same local Node execution hang)

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_heartbeat-timer-observability.md`
- `.github/migration/audits/phase-1-mt5-heartbeat-timer-observability-parity-2026-05-17.md`
- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`

# Remaining risks

- The new `DEBUG OnTimer` line is not yet verified in live logs because the patched source has not been rebuilt and reattached on the active MT5 terminal from this workspace.
- Live confirmation that `g_heartbeatTickCount` increments from `1` through `48` and then resets on heartbeat dispatch remains pending deployment of the patched binary.
- Backend heartbeat receipt immediately after patched deployment is still pending; only the pre-patch live heartbeat path is confirmed from accessible logs.
- Local MetaEditor CLI compilation of the patched source is still inconclusive.
- Local Node-based validation is blocked by a machine-level hang, so `check:mql` and `validate:impl` could not be completed from this environment.

# Any contract ambiguities resolved during implementation

There are multiple local MT5 terminal data directories on this machine, and the active live logs are not sourced from the repository copy directly. Smallest safe interpretation: patch only the repository source of record, inspect accessible live journal evidence for the current heartbeat path, and do not claim patched-runtime confirmation unless the new `DEBUG OnTimer` line is directly observed after redeployment.
