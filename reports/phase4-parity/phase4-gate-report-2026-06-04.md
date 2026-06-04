# Phase 4 Live Parity Run Report

Date: 2026-06-04

## Summary

- Run command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1`
- Result: **BLOCKED**
- Failure: `generate-pine-levels-v13.cjs` rejected the exported candle corpus as stale before parity validation.
- Notes: `scripts/export-mt5-candles.ps1` was updated to write UTF-8 without a BOM, so the current run failed on freshness rather than JSON parsing.

## Details

- MT5 fib export: 384 rows -> `reports/phase4-parity/mt5-levels.json`
- Candle export: 3 files -> `data/EURUSD_M15.json`, `data/USDJPY_M15.json`, `data/XAUUSD_M15.json`
- Latest exported candle timestamps:
  - EURUSD_M15: 2026-06-04T10:15:05Z
  - USDJPY_M15: 2026-06-04T10:15:06Z
  - XAUUSD_M15: 2026-06-04T10:15:03Z
- MT5 export snapshot: 2026-06-04T10:42:19.623Z
- Failure reason: stale candles exceeded the allowed freshness gap of 900s.

## Next action

1. Confirm the M15 candle export endpoint can return a fresh 10:30 or later candle for a run executed at 10:42 UTC.
2. If the endpoint only returns the previous closed candle, adjust run timing or the freshness guard to match the expected data cadence.
3. Re-run parity after restoring synchronized candle and MT5 export snapshots.

## Artifacts

- `reports/phase4-parity/mt5-levels.json`
- `data/EURUSD_M15.json`
- `data/USDJPY_M15.json`
- `data/XAUUSD_M15.json`
