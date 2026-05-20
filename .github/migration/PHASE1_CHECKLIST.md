# Phase 1 Checklist

**Last-Updated**: 2026-05-20
**Phase**: 1
**Status**: COMPLETE - All route dispatches and scenario tests confirmed; 48h continuity window recorded PASS; Phase 1 PASSED declared

---

## Pre-Validation Prerequisites

- [x] EA code complete and the exact validation build identified
- [x] Backend APIs available in the target validation environment
- [x] Broker test/validation account available
- [x] MT5 terminal access confirmed
- [x] Broker name and server recorded in `PHASE1_TRACKER.md`
- [x] Account type recorded in `PHASE1_TRACKER.md`
- [x] MT5 build recorded in `PHASE1_TRACKER.md`
- [x] `WebhookURL`, `ApiKey`, and `UserId` configured for the validation environment

---

## Track A - MT5 EA

- [x] Deploy `mt5/SMC_MarketDataEA.mq5` to the validation terminal (deployed on branch `fix/gate-heartbeat-debug-log-behind-flag` as of 2026-05-18)
- [x] Confirm `GET /ea/license-check` succeeds for the target operational session before streaming begins (confirmed 2026-05-18 at startup)
- [x] Confirm `POST /ea/heartbeat` fires on the configured timer (confirmed 2026-05-18 at ~00:07 UTC; 8-min interval = 480 sec throttle working)
- [x] Confirm `POST /ea/account-sync` reaches the backend (confirmed 2026-05-17 21:58:11 UTC; account_id=32206603 persisted)
- [x] Confirm `POST /ea/symbol-sync` reaches the backend (confirmed 2026-05-17 21:58:11 UTC; 27 symbols synced)
- [x] Confirm the existing `POST /ea/market-stream` path reaches the backend during the same validation run (confirmed 2026-05-17 21:58+ UTC; auth passing; candles rejected for weekend stale data only)
- [x] Run `terminal restart` scenario and record result
- [x] Run `VPS restart` scenario and record result (PASS via bundled outage-recovery validation on shared hosting; no WHM access for a literal VPS reboot)
- [x] Run `internet interruption` scenario and record result (PASS via the same bundled outage-recovery validation while the EA remained running)
- [x] Run `duplicate heartbeat protection` scenario and record result
- [x] Run `invalid license rejection` scenario and record result
- [x] Record the `48h heartbeat` continuity window result

---

## Track B - Backend

- [x] Confirm invalid-license handling rejects unauthorized operational access without forcing LIVE state (code reviewed in `smc-superfib-sniper.php`)
- [x] Confirm duplicate heartbeat handling does not create duplicate live session truth (code reviewed; stale-loop deadlock guards in place)
- [x] Confirm out-of-sequence `symbol-sync` behavior is understood and recorded during validation (code reviewed; unique key: user_id + account_id + terminal_id + broker_symbol ensures no duplicates)
- [x] Review server-side logs for `license-check`, `heartbeat`, `account-sync`, `symbol-sync`, and `market-stream` (logs reviewed 2026-05-17 to 2026-05-18; all routes confirmed firing)
- [x] Review persistence outcomes for account and symbol sync during each Track A scenario (confirmed: account_id 32206603, 27 symbols synced, heartbeat rows written to engine_runs table)
- [x] Confirm zero dropped sessions during the executed scenario-validation runs
- [x] Confirm zero heartbeat gaps during the 48h continuity window (validation window started 2026-05-18 ~00:07 UTC)

---

## Track C - Dashboard

- [ ] Dashboard work: DEFERRED to Phase 2. No Phase 1 action items.

---

## Gate Sign-Off

**Track A sign-off**: Track A sign-off recorded  
**Date**: 2026-05-20

**Track B sign-off**: Track B sign-off recorded  
**Date**: 2026-05-20

**Phase 1 PASSED declaration**: Phase 1 PASSED recorded  
**Date**: 2026-05-20
