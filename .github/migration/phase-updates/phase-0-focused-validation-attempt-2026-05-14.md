# Phase 0 Focused Validation Attempt - 2026-05-14

## Objective
- Verify whether the merged NAS100/US30 freshness fix and XAUUSD alias fix are active on the live backend during a real NAS100/US30 session window.

## Probe details
- Probe time: `2026-05-14 21:30:45 SAST` (`2026-05-14 19:30:45 UTC`)
- Endpoint: `https://trader.stokvelsociety.co.za/wp-json/sniper/v1/health`
- Method: unauthenticated live `/health` fetch

## Live result
- Overall result: **FAIL - focused validation did not pass**
- `backendSync=live`
- `engineRunState=live`
- `feedStatus=stale`
- `priceFeed=stale`
- `lastBatchAt=2026-05-14T12:37:30+00:00`
- `lastEngineRunAt=2026-05-14T12:37:43+00:00`

## Symbol findings
| Symbol | Observed state | Gate result | Notes |
|---|---|---|---|
| NAS100 | `priceState=unavailable`, `engineBlocker=PRICE_NOT_MT5_FRESH` | FAIL | Probe was inside the documented `13:30-20:00 UTC` active session. The live backend still showed the pre-fix stale state. |
| US30 | `priceState=unavailable`, `engineBlocker=PRICE_NOT_MT5_FRESH` | FAIL | Same failure mode as NAS100 during the active session probe. |
| XAUUSD | `priceState=live`, `candleState=live`, `candleCount=120`, `engineBlocker=CHOP_GATE_BLOCKED` | FAIL | Candle count is still below the required `>= 180` readiness gate. This also does not prove a post-restart accumulation window because the batch timestamps had not advanced since `12:37 UTC`. |
| AUDUSD | `priceState=live`, `candleState=live`, `candleCount=120`, `engineBlocker=CHOP_GATE_BLOCKED` | OBSERVATION ONLY | Matches the previously accepted chop classification. |
| ETHUSD | `priceState=live`, `candleState=live`, `candleCount=120`, `engineBlocker=OK` | OBSERVATION ONLY | Healthy in this probe. |

## Interpretation
- The probe time was inside the required NAS100/US30 active session window, so the index checks were valid.
- The live backend was still serving the same batch timestamps from `12:37 UTC`, which is strong evidence that the required EA reload and/or backend restart had not yet taken effect on the live runtime at the time of the probe.
- Because the runtime deployment state was not current, this probe cannot be used as a Phase 0 PASS closeout.

## Required operator follow-up
1. Reload the live EA with the merged MT5 binary that includes the NAS100/US30 freshness logic and the XAUUSD alias map.
2. Restart or redeploy the live WordPress/PHP backend so the equity-index off-session health logic is active.
3. Re-run the same `/health` capture during a NAS100/US30 active session after the reload/restart.
4. Capture a second XAUUSD readiness snapshot after at least `7.5h` of uninterrupted post-restart accumulation so `candleCount >= 180` can be verified.
