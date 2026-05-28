# Phase 4 - Live Soak Started

**Date**: 2026-05-27  
**Status**: Live soak active - corpus accumulation in progress  
**Branch**: `Phase-4-Implementation`  
**Related PR**: [#239](https://github.com/klintaruvinga-png/smcsmartfib-WebApp/pull/239)

---

## Editorial Note - 2026-05-28

This log captured valid pre-correction runtime evidence under the earlier `M15/H1/D1` contract. It is superseded for the active Phase 4 gate by `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`, which raises the required matrix to `M15/H1/H4/D1` and the complete-symbol ingest expectation to `levels_written=128`.

The historical observations below remain intact as evidence of what was running on 2026-05-27. They are not sufficient gate evidence for the corrected contract.

---

## Operator Actions Completed

| Task | Status | Evidence |
|------|--------|----------|
| Deploy `Phase-4-Implementation` EA build to live MT5 terminal | COMPLETE | Operator confirmed deployed live |
| Start Phase 4 live corpus accumulation | COMPLETE | `FibEngine` collecting live corpus for EURUSD/USDJPY/XAUUSD parity gate |
| Capture T0 admin soak baseline | COMPLETE | Exported artifact: `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md` |
| Clear Phase 3 conditional closeout blocker (`RISK-06`) | COMPLETE | Baseline checkpoint present in export; risk register updated |

---

## Baseline Evidence Captured

- Soak type: `PHASE_4_30_DAY`
- Baseline checkpoint display timestamp: `27/05/2026, 09:00:02`
- Manual evidence rows captured from `27/05/2026, 09:00:06` through `27/05/2026, 09:00:15`

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

That `levels_written=96` evidence is preserved as a pre-correction capture and must not be used as the corrected Phase 4 closeout threshold.

---

## Auth Boundary Note

- Direct `GET /wp-json/sniper/v1/market-data/fib-levels?symbol=EURUSD` returned:
  - `smc_sf_auth_required`
  - HTTP `401`
- This matches the current route contract: `/market-data/fib-levels` is protected by `permission_user()` and requires a valid WordPress-authenticated user context.

---

## Remaining Phase 4 Gate Items

1. Redeploy the corrected H4 build and reconfirm `levels_written=128`.
2. Confirm the retrieval path that will be used to export authenticated MT5 fib levels into `mt5-levels.json`.
3. Capture Pine reference levels for `EURUSD`, `USDJPY`, and `XAUUSD` at a known UTC timestamp into `pine-levels.json`.
4. Export matching MT5 fib levels into `mt5-levels.json` with full M15/H1/H4/D1 coverage.
5. Run:

```bash
php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json
```

6. Verify gate pass criteria:
   - `overall_parity_pct >= 99`
   - `critical_mismatches_count = 0`
   - `384` rows across `24` `(symbol,timeframe,family)` groups
