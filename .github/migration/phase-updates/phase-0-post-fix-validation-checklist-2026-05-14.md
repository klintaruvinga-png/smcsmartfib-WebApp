# Phase 0 Post-Fix Validation Checklist — 2026-05-14

## Prerequisites
- EA must be reloaded with the compiled fix binary from the merged NAS100/US30 freshness and XAUUSD alias patches.
- Backend must be restarted to pick up the PHP equity-index off-session health-check changes.

## Validation gates

| Symbol | Required state | Evidence to capture | Result | Notes |
|---|---|---|---|---|
| NAS100 | `feedStatus=live` during 13:30-20:00 UTC | Health endpoint snapshot during active session | [PENDING] | Off-session `CLOSED` handling must no longer produce `PRICE_NOT_MT5_FRESH`. |
| US30 | `feedStatus=live` during 13:30-20:00 UTC | Health endpoint snapshot during active session | [PENDING] | Off-session `CLOSED` handling must no longer produce `PRICE_NOT_MT5_FRESH`. |
| XAUUSD | `feedStatus=live` and M1 -> 15m candle count >= 180 | Health endpoint snapshot plus candle-count check after EA restart | [PENDING] | Requires at least 7.5h of uninterrupted accumulation after restart. |
| AUDUSD | Observation only — chop state may remain blocked | Health endpoint snapshot | [PENDING] | `CHOP_GATE_BLOCKED` does not block Phase 0 closeout if the primary symbols pass. |
| ETHUSD | Observation only — chop state may remain blocked | Health endpoint snapshot | [PENDING] | `CHOP_GATE_BLOCKED` does not block Phase 0 closeout if the primary symbols pass. |

## Pass criteria for superseding closeout
- NAS100 = `feedStatus=live`
- US30 = `feedStatus=live`
- XAUUSD = `feedStatus=live` and M1 -> 15m candle count >= 180
- AUDUSD and ETHUSD may remain chop-blocked without blocking the Phase 0 gate

## Outcome
- Validation completed at: [PENDING]
- Superseding artifact path: [PENDING]
