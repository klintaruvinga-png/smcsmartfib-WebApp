# SMC SuperFIB — MT5 Candle Ingestion Snapshot Report
**Date:** 2026-05-05
**Branch:** `Pine-to-MT5-EA-Migration`
**Commit:** `5a18120`

---

## Snapshot Summary
- Verified EA payload success with `200 OK` for five symbols: `EURUSD`, `GBPUSD`, `USDJPY`, `GBPJPY.c`, and `AUDUSD`.
- Verified backend DB candle ingestion into `wpup_smc_sf_candles` for the same symbols with correct `1min` candle rows.
- Confirmed end-to-end MT5 candle stream: EA -> webhook -> backend -> database insert.

## Success Point 1 — EA Payloads
Confirmed the following EA log pattern for each symbol:
- `EA PAYLOAD DEBUG -> ... hasTick=true | hasCandle=true | latestClosedCandle=...`
- `EA SEND -> ... | candle_time=... | now=...`
- `WEBHOOK DEBUG: Payload size=... | auth_header_len=...`
- `SMC_MarketDataEA SUCCESS attempt 1 | symbol=... | httpStatus=200 | response={"ok":true,...,"candles_inserted":1,...}`

This confirms the MT5 EA is building valid payloads, the webhook is accepting them, and the backend is returning successful ingestion acknowledgements.

## Success Point 2 — DB Writes Confirmed
Verified recent database writes in `wpup_smc_sf_candles`:
- latest rows for `GBPJPY`, `AUDUSD`, `USDJPY`, `GBPUSD`, and `EURUSD` are present
- candle rows are correctly marked `source=mt5`
- `candle_time` values are aligned with the confirmed EA log timestamps

This confirms the database layer is receiving and persisting MT5-derived candle data.

## Regression Protections / Current State
The following protections are currently tied to the confirmed state:

- `ValidateCandle()` enforces `time > 0` and rejects epoch-zero candles.
- `CandleBuilder.mqh` protects the ring buffer with a persistent `ringFull[]` flag to disambiguate wrapped buffer positions.
- `MarketDataEngine.mqh` uses `SymbolSelect(symbol, true)` + `CopyRates(symbol, PERIOD_M1, 0, 100, warmup)` during initialization to preload M1 history.
- `MarketDataEngine.mqh` sources closed candles from `CopyRates(..., 1, 1, rates)` and verifies `rates[0].time > 0` for `hasCandle`.
- `MarketDataEngine.mqh` retains an explicit `HISTORY NOT READY` branch when `CopyRates()` returns zero, preventing false success injection.
- `smc-superfib-sniper.php` hardens timestamp validation with a year-2000 floor (`$candle_ts < 946684800`).
- `MarketDataEngine.mqh` documents the internal candle buffer offset logic, preventing future `shift` regressions.

## Current Regression Guards
| Protection | Location |
|---|---|
| `ValidateCandle()` rejects epoch-zero candles | `mt5/CandleBuilder.mqh` |
| `ringFull` flag disambiguates wrapped buffer state | `mt5/CandleBuilder.mqh` |
| `CopyRates` closed-candle source + epoch check | `mt5/MarketDataEngine.mqh` |
| `SymbolSelect` + 100-bar preload on initialize | `mt5/MarketDataEngine.mqh` |
| `HISTORY NOT READY` logging for missing broker history | `mt5/MarketDataEngine.mqh` |
| Backend PHP candle timestamp floor to year 2000 | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` |
| `shift=0` / closed-bar documentation guard | `mt5/MarketDataEngine.mqh` |

## Rollback Point
A rollback checkpoint has been recorded at the current verified commit.

- Tag: `snapshot/2026-05-05-mt5-candle-ingestion-verified`

---

## Notes for next verification pass
- Confirm the same ingestion pattern holds for the next hourly boundary and across broker reconnects.
- Add a focused regression test for `CopyRates(..., 1, 1, rates)` path and `hasCandle` epoch guard.
- Confirm `wpup_smc_sf_candles` rows continue to arrive without duplicate or stale `created_at` entries.
