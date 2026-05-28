# Phase 4 Next Actions Checklist

**Created**: 2026-05-27  
**Updated**: 2026-05-28  
**Phase**: 4 - Fib Engine Migration  
**Status**: Live soak active; corrected H4 runtime verified; parity gate pending  
**Primary tracker**: `.github/migration-status.md`  
**Companion log**: `.github/migration/phase-updates/phase4-live-soak-started-2026-05-27.md`  
**Contract correction addendum**: `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`

---

## Current Baseline

- T0 baseline checkpoint: `2026-05-27 09:00:02 SAST`
- T0 baseline checkpoint: `2026-05-27 07:00:02 UTC`
- Baseline evidence rows: `2026-05-27 09:00:06` to `09:00:15 SAST`
- Historical runtime captured on 2026-05-27:
  - EA reattached
  - `ea_version=1.00`
  - Fib POST OK for `EURUSD`, `USDJPY`, `XAUUSD`
  - Plugin version `13.0.3`
  - Backend ingest confirmed `levels_written=96`
- That `levels_written=96` observation is pre-correction evidence only and is superseded for the active gate by the 2026-05-28 addendum above.
- Corrected runtime verification captured on 2026-05-28:
  - Corrected EA deployed
  - Backend ingest confirmed `levels_written=128`
  - Evidence: `[28-May-2026 15:14:35 UTC] [SMC_SF] ea/fib-levels ingested symbol=XAUUSD levels_written=128 failed=0 user_id=1`

---

## Completed Items

| Status | Task | Evidence | Completed |
|--------|------|----------|-----------|
| [x] | Deploy `Phase-4-Implementation` to live MT5 terminal | MT5 journal + operator confirmation | 2026-05-27 |
| [x] | Capture T0 admin baseline for `PHASE_4_30_DAY` | `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md` | 2026-05-27 |
| [x] | Verify correct EA and plugin build were live at T0 | `ea_version=1.00`, plugin `13.0.3` | 2026-05-27 |
| [x] | Verify backend fib ingestion was live at T0 | `[SMC_SF] ea/fib-levels ingested ... levels_written=96` *(pre-correction evidence only)* | 2026-05-27 |
| [x] | Clear Phase 3 `RISK-06` conditional-closeout blocker | Risk register + status board updated | 2026-05-27 |
| [x] | Redeploy the corrected H4 fib build | Operator confirmation: corrected EA deployed | 2026-05-28 |
| [x] | Reconfirm backend fib ingestion after redeploy | `[28-May-2026 15:14:35 UTC] [SMC_SF] ea/fib-levels ingested symbol=XAUUSD levels_written=128 failed=0 user_id=1` | 2026-05-28 |

---

## Active Next Actions

| Status | Task | Owner | Target | Evidence to capture | Notes |
|--------|------|-------|--------|---------------------|-------|
| [ ] | Confirm authenticated export path for `/market-data/fib-levels` | Operator | Next session | Successful authenticated response for `EURUSD` | Direct unauthenticated GET returns `401 smc_sf_auth_required` by design |
| [ ] | Export `mt5-levels.json` in flat validator format for `EURUSD`, `USDJPY`, `XAUUSD` | Operator | After auth path confirmed | Saved `mt5-levels.json` with `384` rows | Must include M15/H1/H4/D1 and both families |
| [ ] | Capture `pine-levels.json` at the same UTC snapshot as MT5 export | Operator | Same session as MT5 export | Saved `pine-levels.json` with `384` rows | Use closed candles only |
| [ ] | Run parity validator dry run on first matched snapshot set | Operator | After first paired export | `reports/phase4-gate.json` | Early check; not the final gate |
| [ ] | Weekly soak checkpoint snapshot #1 | Operator | 2026-06-03 09:00:02 SAST | Admin export + notes | Manual checkpoint cadence |
| [ ] | Weekly soak checkpoint snapshot #2 | Operator | 2026-06-10 09:00:02 SAST | Admin export + notes | Manual checkpoint cadence |
| [ ] | Weekly soak checkpoint snapshot #3 | Operator | 2026-06-17 09:00:02 SAST | Admin export + notes | Manual checkpoint cadence |
| [ ] | Final 30-day checkpoint snapshot | Operator | 2026-06-26 09:00:02 SAST | Admin export + notes | End of corpus window |
| [ ] | Export final `mt5-levels.json` for gate review | Operator | 2026-06-26 | Final `mt5-levels.json` | Must match Pine capture timestamp and contain 24 groups |
| [ ] | Capture final `pine-levels.json` for gate review | Operator | 2026-06-26 | Final `pine-levels.json` | Same UTC snapshot as MT5 export and contain 24 groups |
| [ ] | Run final parity gate | Operator | 2026-06-26 | `reports/phase4-gate.json` | PASS requires `overall_parity_pct >= 99` and `critical_mismatches_count = 0` |
| [ ] | Weekend gap scenario verification | Operator | First weekend inside soak window | Notes + snapshot evidence | Required by Phase 4 testing guide |
| [ ] | Sparse-data / missing-candle scenario verification | Operator | During illiquid session | Notes + snapshot evidence | Required by Phase 4 testing guide |

---

## Validator Command

```bash
php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json
```

## Gate Pass Criteria

- `overall_parity_pct >= 99`
- `critical_mismatches_count = 0`
- All 16 ratios present for `LTF_SF` and `HTF_AF`
- Coverage includes `EURUSD`, `USDJPY`, `XAUUSD` across `M15`, `H1`, `H4`, `D1`
- Final operator export contains `384` rows across `24` `(symbol,timeframe,family)` groups

---

## Update Log

| Date | Update |
|------|--------|
| 2026-05-28 | Corrected H4 redeploy and runtime verification recorded: `levels_written=128` confirmed at `15:14:35 UTC`; next open step is authenticated export-path confirmation. |
| 2026-05-28 | Checklist corrected to require the M15/H1/H4/D1 matrix, `levels_written=128`, and `384` rows across `24` groups. |
| 2026-05-27 | Checklist created from confirmed live deployment, T0 baseline capture, and runtime verification evidence. |
