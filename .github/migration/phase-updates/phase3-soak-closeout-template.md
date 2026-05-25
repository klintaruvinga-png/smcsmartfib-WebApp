# Phase 3 Soak Closeout — 72h Stability Soak

**Soak window**: 2026-05-22 → 2026-05-25 (72h)  
**Gate target**: Phase 3 — MT5 Market Data Engine COMPLETE  
**Gating Phase 4**: Fib Engine Migration  

---

## Gate Queries (run on production DB at soak close)

### Query 1 — Total Engine Runs (72h window)
```sql
SELECT COUNT(*) AS total_runs, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_runs
FROM wp_smc_sf_engine_runs
WHERE created_at >= '2026-05-22 00:00:00'
  AND created_at <= '2026-05-25 00:00:00';
```
**Pass criteria**: `total_runs > 200,000` AND `error_runs = 0`  
**Phase 0 reference**: 259,464 engine runs / 0 errors / 24h

### Query 2 — Candle Accumulation per Symbol
```sql
SELECT symbol, timeframe, COUNT(*) AS candle_count
FROM wp_smc_sf_candles
WHERE created_at >= '2026-05-22 00:00:00'
  AND created_at <= '2026-05-25 00:00:00'
GROUP BY symbol, timeframe
ORDER BY symbol, timeframe;
```
**Pass criteria**: Each active watchlist symbol has at least 30 M15 candles across the 72h window (required for engine readiness gate)

### Query 3 — MT5 Authority Snapshot Freshness
```sql
SELECT symbol, source, state, updated_at, TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS age_sec
FROM wp_smc_sf_snapshots
WHERE source = 'mt5'
ORDER BY updated_at DESC;
```
**Pass criteria**: All MT5-authoritative symbols have `state = 'live'` and `age_sec < 60` during active market hours

---

## Soak Evidence Checklist

- [ ] T0 baseline captured (admin soak workspace → Capture Baseline → PHASE_3_STABILITY_72H template)
- [ ] Engine runs: ≥200,000 / 0 errors over 72h
- [ ] Candle accumulation: ≥30 M15 candles per symbol over 72h
- [ ] All watchlist symbols MT5-live during US equity session (NAS100, US30, XAUUSD, EURUSD, etc.)
- [ ] Weekend behaviour: FX/crypto CLOSED/offline during weekend, resumed on Sunday open
- [ ] No false LIVE states during off-session or weekend
- [ ] EA reconnect: EA re-establishes stream after disconnect within expected window

---

## Results (fill in at soak close)

| Metric | Value | Pass |
|--------|-------|------|
| Total engine runs (72h) | _(fill)_ | _(fill)_ |
| Error engine runs | _(fill)_ | _(fill)_ |
| EURUSD M15 candles | _(fill)_ | _(fill)_ |
| XAUUSD M15 candles | _(fill)_ | _(fill)_ |
| NAS100 M15 candles | _(fill)_ | _(fill)_ |
| US30 M15 candles | _(fill)_ | _(fill)_ |
| Weekend state observed | _(fill)_ | _(fill)_ |
| EA reconnect confirmed | _(fill)_ | _(fill)_ |

---

## Phase 3 Gate Decision

- [ ] **PASS**: All gate queries pass, all evidence captured — Phase 3 COMPLETE → Phase 4 permitted
- [ ] **CONDITIONAL PASS**: Minor gaps documented — close within 24h, then gate
- [ ] **EXTEND SOAK**: Gate queries fail — extend soak 24h, re-evaluate

**Gate decision date**: _(fill)_  
**Decision maker**: _(fill)_  
**Phase 4 start authorized**: _(fill: YES/NO/PENDING)_

---

## Closeout Artifact Reference

| Artifact | Location |
|----------|----------|
| T0 baseline snapshot | Admin soak workspace → evidence list |
| Phase 3 soak tracker | `.github/migration/PHASE3_SOAK_WINDOW_TASKS.md` |
| Migration status | `.github/migration-status.md` → Phase 3 row |
| Gate closeout doc | `.github/migration/phase-updates/phase3-soak-closeout-YYYY-MM-DD.md` |
| Phase 4 implementation plan | `PHASE4_IMPLEMENTATION.md` (to be created per Task 7) |
