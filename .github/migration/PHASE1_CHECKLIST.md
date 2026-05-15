# Phase 1 Checklist

**Last-Updated**: 2026-05-15
**Phase**: 1
**Status**: READY FOR FIELD EXECUTION

---

## Pre-Validation Prerequisites

- [ ] EA code complete and the exact validation build identified
- [ ] Backend APIs available in the target validation environment
- [ ] Broker test/validation account available
- [ ] MT5 terminal access confirmed
- [ ] Broker name and server recorded in `PHASE1_TRACKER.md`
- [ ] Account type recorded in `PHASE1_TRACKER.md`
- [ ] MT5 build recorded in `PHASE1_TRACKER.md`
- [ ] `WebhookURL`, `ApiKey`, and `UserId` configured for the validation environment

---

## Track A - MT5 EA

- [ ] Deploy `mt5/SMC_MarketDataEA.mq5` to the validation terminal
- [ ] Confirm `GET /ea/license-check` succeeds for the target operational session before streaming begins
- [ ] Confirm `POST /ea/heartbeat` fires on the configured timer
- [ ] Confirm `POST /ea/account-sync` reaches the backend
- [ ] Confirm `POST /ea/symbol-sync` reaches the backend
- [ ] Confirm the existing `POST /ea/market-stream` path reaches the backend during the same validation run
- [ ] Run `terminal restart` scenario and record result
- [ ] Run `VPS restart` scenario and record result
- [ ] Run `internet interruption` scenario and record result
- [ ] Run `duplicate heartbeat protection` scenario and record result
- [ ] Run `invalid license rejection` scenario and record result
- [ ] Record the `48h heartbeat` continuity window result

---

## Track B - Backend

- [ ] Confirm invalid-license handling rejects unauthorized operational access without forcing LIVE state
- [ ] Confirm duplicate heartbeat handling does not create duplicate live session truth
- [ ] Confirm out-of-sequence `symbol-sync` behavior is understood and recorded during validation
- [ ] Review server-side logs for `license-check`, `heartbeat`, `account-sync`, `symbol-sync`, and `market-stream`
- [ ] Review persistence outcomes for account and symbol sync during each Track A scenario
- [ ] Confirm zero dropped sessions during the validation window
- [ ] Confirm zero heartbeat gaps during the 48h continuity window

---

## Track C - Dashboard

- [ ] Dashboard work: DEFERRED to Phase 2. No Phase 1 action items.

---

## Gate Sign-Off

**Track A sign-off**: ____________________  
**Date**: ____________________

**Track B sign-off**: ____________________  
**Date**: ____________________

**Phase 1 PASSED declaration**: ____________________  
**Date**: ____________________
