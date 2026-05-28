# Phase 4 - Live Soak Started

**Date**: 2026-05-27  
**Status**: Live soak active - corpus accumulation in progress  
**Branch**: `Phase-4-Implementation`  
**Related PR**: [#239](https://github.com/klintaruvinga-png/smcsmartfib-WebApp/pull/239)

---

## Operator Actions Completed

| Task | Status | Evidence |
|------|--------|----------|
| Deploy `Phase-4-Implementation` EA build to live MT5 terminal | ✓ COMPLETE | Operator confirmed deployed live |
| Start Phase 4 live corpus accumulation | ✓ COMPLETE | `FibEngine` now collecting live corpus for EURUSD/USDJPY/XAUUSD parity gate |
| Capture T0 admin soak baseline | ✓ COMPLETE | Exported artifact: `C:\Users\LEONNA\Downloads\phase-4-30-day-2026-05-27.md` |
| Clear Phase 3 conditional closeout blocker (`RISK-06`) | ✓ COMPLETE | Baseline checkpoint present in export; risk register updated |

---

## Baseline Evidence Captured

- Soak type: `PHASE_4_30_DAY`
- Baseline checkpoint display timestamp: `27/05/2026, 09:00:02`
- Manual evidence rows captured from `27/05/2026, 09:00:06` through `27/05/2026, 09:00:15`
- Health at export time:
  - Feed status: `live`
  - Backend sync: `live`
  - Engine run state: `live`
  - Last batch: `27/05/2026, 20:26:26`
  - Last engine run: `27/05/2026, 20:26:33`
- 24h aggregates at export time:
  - Watchlist count: `13`
  - Snapshots: `24`
  - Candles: `51674`
  - Engine runs: `105688 total / 750 success / 0 error`

---

## Runtime Verification Confirmed

- EA restart / reattach completed on live terminal
- License-check dispatch confirmed with `ea_version=1.00`
- Fib ingestion dispatch confirmed from MT5 journal:
  - `[FibEngine] POST OK symbol=EURUSD`
  - `[FibEngine] POST OK symbol=USDJPY`
  - `[FibEngine] POST OK symbol=XAUUSD`
- WordPress plugin version confirmed live: `13.0.3`
- Backend ingest log confirmed:
  - `[SMC_SF] ea/fib-levels ingested symbol=XAUUSD levels_written=96 failed=0 user_id=1`

## Auth Boundary Note

- Direct `GET /wp-json/sniper/v1/market-data/fib-levels?symbol=EURUSD` returned:
  - `smc_sf_auth_required`
  - HTTP `401`
- This matches the current route contract: `/market-data/fib-levels` is protected by `permission_user()` and requires a valid WordPress-authenticated user context.
- Conclusion:
  - Phase 4 EA deployment verification: `PASS`
  - Phase 4 backend fib ingestion verification: `PASS`
  - MT5 export path for `mt5-levels.json`: still needs an authenticated retrieval method from the WordPress side or another trusted export path

---

## Remaining Phase 4 Gate Items

1. Let the live soak continue until the 30-day corpus window is complete.
2. Confirm the retrieval path that will be used to export authenticated MT5 fib levels into `mt5-levels.json`.
3. Capture Pine reference levels for `EURUSD`, `USDJPY`, and `XAUUSD` at a known UTC timestamp into `pine-levels.json`.
4. Export matching MT5 fib levels into `mt5-levels.json`.
5. Run:

```bash
php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json
```

6. Verify gate pass criteria:
   - `overall_parity_pct >= 99`
   - `critical_mismatches_count = 0`
