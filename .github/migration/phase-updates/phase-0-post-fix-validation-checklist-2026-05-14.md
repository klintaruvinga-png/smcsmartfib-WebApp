# Phase 0 Post-Fix Validation Checklist - 2026-05-14

## Prerequisites
- EA must be reloaded with the compiled fix binary from the merged NAS100/US30 freshness and XAUUSD alias patches.
- Backend must be restarted to pick up the PHP equity-index off-session health-check changes.

## Validation gates

| Symbol | Required state | Evidence to capture | Result | Notes |
|---|---|---|---|---|
| NAS100 | `feedStatus=live` during 13:30-20:00 UTC | Health endpoint snapshot during active session | [FAILED 2026-05-14 19:30 UTC] | Active-session probe still showed `priceState=unavailable` and `engineBlocker=PRICE_NOT_MT5_FRESH`. See `phase-0-focused-validation-attempt-2026-05-14.md`. |
| US30 | `feedStatus=live` during 13:30-20:00 UTC | Health endpoint snapshot during active session | [FAILED 2026-05-14 19:30 UTC] | Active-session probe still showed `priceState=unavailable` and `engineBlocker=PRICE_NOT_MT5_FRESH`. See `phase-0-focused-validation-attempt-2026-05-14.md`. |
| XAUUSD | `feedStatus=live` and M1 -> 15m candle count >= 180 | Health endpoint snapshot plus candle-count check after EA restart | [FAILED 2026-05-14 19:30 UTC] | Probe showed `priceState=live` but only `candleCount=120`. This does not satisfy the post-restart readiness gate. |
| AUDUSD | Observation only - chop state may remain blocked | Health endpoint snapshot | [OBSERVED 2026-05-14 19:30 UTC] | `priceState=live`, `candleState=live`, `candleCount=120`, `engineBlocker=CHOP_GATE_BLOCKED`. Observation only. |
| ETHUSD | Observation only - chop state may remain blocked | Health endpoint snapshot | [OBSERVED 2026-05-14 19:30 UTC] | `priceState=live`, `candleState=live`, `candleCount=120`, `engineBlocker=OK`. Observation only. |

## Pass criteria for superseding closeout
- NAS100 = `feedStatus=live`
- US30 = `feedStatus=live`
- XAUUSD = `feedStatus=live` and M1 -> 15m candle count >= 180
- AUDUSD and ETHUSD may remain chop-blocked without blocking the Phase 0 gate

## Outcome
- Validation completed at: `2026-05-14 21:30:45 SAST` (`2026-05-14 19:30:45 UTC`)
- Validation evidence path: `.github/migration/phase-updates/phase-0-focused-validation-attempt-2026-05-14.md`
- Superseding artifact path: not created - validation failed
