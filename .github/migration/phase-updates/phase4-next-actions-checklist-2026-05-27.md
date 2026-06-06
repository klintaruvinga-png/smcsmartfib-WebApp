# Phase 4 Next Actions Checklist (Updated with Parallel Coding Work)

**Created**: 2026-05-27  
**Updated**: 2026-06-01  
**Phase**: 4 - Fib Engine Migration  
**Status**: Live soak active; H4 runtime verified; synthetic validator PASS recorded; paired-export gate still FAIL. Initial 2026-06-02 artifact is FAIL 40.89%; corrected 2026-06-03 artifact is FAIL 0.26%; committed 2026-06-04 gate artifacts also FAIL; separate stale-candle attempts are BLOCKED/data-invalid.
**Primary tracker**: `.github/migration-status.md`
**Companion log**: `.github/migration/phase-updates/phase4-live-soak-started-2026-05-27.md`  
**Contract correction addendum**: `.github/migration/phase-updates/phase4-timeframe-contract-correction-2026-05-28.md`  
**Operational testing runbook**: `.github/migration/PHASE4_OPERATIONAL_TESTING_RUNBOOK.md` (NEW)

---

## Current Baseline

- T0 baseline checkpoint: `2026-05-27 09:00:02 SAST` (preserved)
- Corrected runtime verification: `[28-May-2026 15:14:35 UTC]` — `levels_written=128` confirmed
- Phase 4 parallel coding work: **ALL COMPLETE** as of 2026-06-01

---

## Completed Items (Phase 4 Baseline)

| Status | Task | Evidence | Completed |
|--------|------|----------|-----------|
| [x] | Deploy `Phase-4-Implementation` to live MT5 terminal | MT5 journal + operator confirmation | 2026-05-27 |
| [x] | Capture T0 admin baseline for `PHASE_4_30_DAY` | `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md` | 2026-05-27 |
| [x] | Verify correct EA and plugin build were live at T0 | `ea_version=1.00`, plugin `13.0.3` | 2026-05-27 |
| [x] | Verify backend fib ingestion was live at T0 | `[SMC_SF] ea/fib-levels ingested ... levels_written=128` | 2026-05-28 |
| [x] | Clear Phase 3 `RISK-06` conditional-closeout blocker | Risk register + status board updated | 2026-05-27 |
| [x] | Redeploy the corrected H4 fib build | Operator confirmation: corrected EA deployed | 2026-05-28 |
| [x] | Reconfirm backend fib ingestion after redeploy | `[28-May-2026 15:14:35 UTC] ... levels_written=128` | 2026-05-28 |
| [x] | Confirm repository parity-validator tooling in synthetic self-test mode | `scripts/parity-validator.php` + `reports/phase4-gate.json` PASS | 2026-05-28 |
| [x] | Confirm authenticated export path for `/market-data/fib-levels` | Successful auth response; snapshots saved | 2026-05-31 |

---

## NEW: Completed Parallel Coding Tasks (Phase 4 Soak Window)

| Status | Task | Category | Deliverable | Completed |
|--------|------|----------|-------------|-----------|
| [x] | Create MT5 regime replay test suite (1A) | Testing | `scripts/mt5-regime-replay.test.mjs` | 2026-06-01 |
| [x] | Expand signal dispatch test with gap scenarios (1B) | Testing | `scripts/mt5-signal-dispatch.test.mjs` (updated) | 2026-06-01 |
| [x] | Document Phase 4 operational testing runbook (1C) | Documentation | `.github/migration/PHASE4_OPERATIONAL_TESTING_RUNBOOK.md` | 2026-06-01 |
| [x] | Build regime parity validator (2A) | Tooling | `scripts/regime-parity-validator.php` | 2026-06-01 |
| [x] | Build signal parity validator (2B) | Tooling | `scripts/signal-parity-validator.php` | 2026-06-01 |
| [x] | Create Phase 7-9 implementation specs (2C) | Planning | `PHASE7_IMPLEMENTATION.md`, `PHASE8_IMPLEMENTATION.md`, `PHASE9_IMPLEMENTATION.md` | 2026-06-01 |
| [x] | Update test:focused regression command | Automation | `package.json` script added | 2026-06-01 |

### New Testing Infrastructure Ready

```bash
# Regime + Signal parity suites now included in focused regression
npm run test:focused
# Output: 37 tests across 10 files (added regime replay + expanded signal scenarios)
```

### New Validator Tooling Ready

```bash
# Phase 5 regime parity validation
php scripts/regime-parity-validator.php --mt5-file mt5-regime.json --pine-file pine-regime.json --out reports/phase5-regime-parity.json

# Phase 6 signal parity validation
php scripts/signal-parity-validator.php --mt5-file mt5-signals.json --pine-file pine-signals.json --out reports/phase6-signal-parity.json
```

### New Phase Specifications Ready for Deployment

- `PHASE7_IMPLEMENTATION.md` — Controlled Manual Execution (gate: ≥50% win rate)
- `PHASE8_IMPLEMENTATION.md` — Semi-Automation Layer (gate: ≥55% win rate)
- `PHASE9_IMPLEMENTATION.md` — SaaS & Licensing (gate: multi-tenant isolation + $5k MRR)

---

## Weekend Control Note - 2026-06-06

Phase 4 parity should not be rerun as a gate during weekend market closure because the instruments in the test files will have stale M15 candles. Any parity failure during this window is expected and should not be treated as new fib/regime/signal evidence.

The active blocker is data validity, not a confirmed implementation defect.

Next valid Phase 4 action:

1. Wait until market reopen.
2. Confirm MT5 shows fresh broker candles.
3. Confirm every symbol in the Phase 4 test file has at least one newly closed M15 candle.
4. Recapture the MT5 fib export and M15 candle export from the same broker/feed window.
5. Confirm no stale weekend timestamps remain in the candle files.
6. Rerun `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1` only after those checks pass.
7. Preserve both outcomes:
   - stale-export BLOCKED artifacts if freshness still fails;
   - paired-export FAIL/PASS artifacts if the validator runs.

Do not treat the synthetic validator PASS as Phase 4 closeout evidence. The only closeout evidence that can unlock Phase 5 is a paired MT5/Pine live export gate with 99%+ parity, zero critical mismatches, weekend/sparse-data evidence, and operator acceptance.

## Active Next Actions (Phase 4 Operational)

| Status | Task | Owner | Target | Evidence to capture | Blocker for |
|--------|------|-------|--------|---------------------|-------------|
| [ ] | **Wait for market reopen before gate rerun** | Operator | After weekend closure | MT5 shows fresh broker candles for all Phase 4 symbols | Phase 4 rerun |
| [ ] | **Verify fresh closed M15 candles** for every symbol in the Phase 4 test file | Operator | After market reopen | No stale weekend timestamps remain in `data/*_M15.json` | Phase 4 rerun |
| [ ] | **Recapture synchronized M15 candle exports** for EURUSD/USDJPY/XAUUSD aligned to the MT5 fib export snapshot | Operator | After freshness verification | Fresh `data/*_M15.json` files inside the Pine generator freshness window | Phase 4 rerun |
| [ ] | **Export `mt5-levels.json`** for EURUSD/USDJPY/XAUUSD with all M15/H1/H4/D1 timeframes | Operator | Same broker/feed window as candle export | `mt5-levels.json` with 384 rows (24 groups) | Phase 5 gate |
| [ ] | **Capture `pine-levels.json`** at same UTC snapshot as MT5 export | Operator | Same session as MT5 export | `pine-levels.json` with 384 rows | Phase 5 gate |
| [x] | Preserve initial paired-export gate artifact | Operator | 2026-06-02 | `reports/phase4-gate.json` (FAIL 40.89%; 227 critical mismatches) | Phase 5 gate |
| [x] | Preserve corrected paired-export gate artifact | Operator | 2026-06-03 | `reports/phase4-parity/phase4-gate-2026-06-03-corrected.json` (FAIL 0.26%; 383 critical mismatches) | Phase 5 gate |
| [x] | Preserve committed 2026-06-04 gate artifacts | Operator | 2026-06-04 | `reports/phase4-parity/phase4-gate-2026-06-04_*.json`; `_173401` is FAIL 51.04% with 47 critical mismatches | Phase 5 gate |
| [ ] | Rerun Phase 4 parity after market-reopen freshness checks pass | Operator | After fresh closed M15 verification | `reports/phase4-parity/phase4-gate-*.json` or stale-export BLOCKED report | Phase 4 gate closure |
| [ ] | **Weekend gap scenario verification** (Test 1: Fri EOD -> Mon US open) | Operator | Next valid market-reopen window | Snapshots + notes; do not treat stale weekend candle failures as gate evidence | Phase 4 gate closure |
| [ ] | **Sparse-data scenario verification** (Test 2: illiquid session simulation) | Operator | During next illiquid session | Snapshots + backend logs (see runbook for checklist) | Phase 4 gate closure |
| [ ] | Weekly soak checkpoint snapshot #1 | Operator | 2026-06-03 09:00:02 SAST | Admin export + notes | Monitoring |
| [ ] | Weekly soak checkpoint snapshot #2 | Operator | 2026-06-10 09:00:02 SAST | Admin export + notes | Monitoring |
| [ ] | Weekly soak checkpoint snapshot #3 | Operator | 2026-06-17 09:00:02 SAST | Admin export + notes | Monitoring |
| [ ] | Final 30-day checkpoint snapshot | Operator | 2026-06-26 09:00:02 SAST | Admin export + notes | Final gate |
| [ ] | Export final `mt5-levels.json` for gate review | Operator | 2026-06-26 | Final `mt5-levels.json` (384 rows, 24 groups) | Gate closure |
| [ ] | Capture final `pine-levels.json` for gate review | Operator | 2026-06-26 | Final `pine-levels.json` (384 rows, same UTC) | Gate closure |
| [ ] | Run final parity gate | Operator | 2026-06-26 | `reports/phase4-gate.json` | Gate closure |

---

## Parallel Phase 4A Lane

Phase 4A may run during the 30-day Phase 4 soak, but only for changes that do not alter trading output.

Allowed during soak:

- Repo safety, CI, licensing, docs, and workflow hygiene.
- Auth/CORS/security hardening when staged independently from signal behavior.
- Observability and parity diagnostics that make Phase 4 evidence easier to capture.
- Domain-principle contracts and fixtures for SMT, AMD, ERL/IRL, Silver Bullet, and weekly profiles.

Blocked during soak unless explicitly approved as read-only:

- Fib math changes.
- Regime scoring changes.
- Signal gate changes.
- Dashboard changes that invent or override backend signal truth.

Tracker: `.github/migration/phase-updates/phase4A-production-hardening-and-principles-contract.md`

---

## Validator Commands

```bash
# Final Phase 4 gate (after operator exports paired files)
php scripts/parity-validator.php --mt5-file mt5-levels.json --pine-file pine-levels.json --out reports/phase4-gate.json

# Phase 5 regime parity (after paired regime exports)
php scripts/regime-parity-validator.php --mt5-file mt5-regime.json --pine-file pine-regime.json --out reports/phase5-regime-parity.json

# Phase 6 signal parity (after paired signal exports)
php scripts/signal-parity-validator.php --mt5-file mt5-signals.json --pine-file pine-signals.json --out reports/phase6-signal-parity.json
```

## Gate Pass Criteria (All Phases)

### Phase 4 (Fib)
- `overall_parity_pct >= 99`
- `critical_mismatches_count = 0`
- All 16 ratios present for `LTF_SF` and `HTF_AF`
- Coverage: EURUSD, USDJPY, XAUUSD across M15, H1, H4, D1
- 384 rows across 24 (symbol,timeframe,family) groups
- **NEW**: Weekend gap test PASS + sparse-data test PASS

### Phase 5 (Regime)
- `bias_parity_pct >= 95`
- `regime_parity_pct >= 90`
- `critical_mismatches_count = 0`
- Chop score delta <= 0.15 across all symbols

### Phase 6 (Signal)
- `direction_parity_pct >= 95` **(hard gate)**
- `mismatches_count = 0`
- Entry drift <= 100 pips for acceptable matches

---

## Summary: What's Ready for Phase 5+

| Artifact | Status | Use |
|----------|--------|-----|
| Regime replay test suite | ✅ Ready | `npm run test:focused` includes regime validation |
| Signal replay test suite (expanded) | ✅ Ready | `npm run test:focused` includes 3 new gap scenarios |
| Phase 4 operational runbook | ✅ Ready | Operator uses for weekend/sparse-data testing |
| Regime parity validator | ✅ Ready | After Phase 5 code complete; operator runs for regime gate |
| Signal parity validator | ✅ Ready | After Phase 6 code complete; operator runs for signal gate |
| Phase 7-9 specs | ✅ Ready | Execution (manual) → automation (semi) → SaaS (multi-tenant) |
| Test:focused script | ✅ Ready | Enhanced regression coverage: 37 tests across 10 files |

---

## Update Log

| Date | Update |
|------|--------|
| 2026-06-01 | **Parallel coding work COMPLETE**: All 6 coding tasks finished (regime suite, signal suite, runbook, 2 validators, 3 phase specs). Test:focused script updated to include new test files. Checklist reorganized to show completed coding vs. pending operator tasks. |
| 2026-05-30 | Repository evidence clarified: `reports/phase4-gate.json` is synthetic self-test; final gate requires paired exports + operator signoff |
| 2026-05-29 | Repository bug sweeps confirmed latest Phase 4 wiring fixes remain patched |
| 2026-05-28 | Corrected H4 redeploy and runtime verification: `levels_written=128` confirmed at `15:14:35 UTC` |
| 2026-05-27 | Checklist created from confirmed live deployment, T0 baseline capture, runtime verification |
