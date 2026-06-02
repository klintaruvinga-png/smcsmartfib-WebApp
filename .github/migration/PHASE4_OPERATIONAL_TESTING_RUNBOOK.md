# Phase 4 Operational Testing Runbook

**Created**: 2026-06-01  
**Purpose**: Capture weekend-gap and sparse-data scenario evidence for Phase 4 gate closure  
**Owner**: Track A (Operator)  
**Related**: `.github/migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md`

---

## Overview

This runbook documents the manual testing procedures and evidence-capture steps required to validate Phase 4 behavior under real-world conditions. The two key scenarios are:

1. **Weekend Gap Test**: Verify fib levels freeze correctly when markets close (FX/equity) and resume when they reopen
2. **Sparse-Data Test**: Verify fib engine gracefully handles illiquid sessions with large candle gaps

Both tests must be completed and evidence captured before Phase 4 gate can close on 2026-06-26.

---

## Test 1: Weekend Gap Scenario

**Timeline**: Execute during the first weekend inside Phase 4 soak window (2026-06-01/06-02)  
**Markets involved**: FX (EURUSD, USDJPY, GBPUSD), Equities (US30, NAS100), Crypto (BTCUSD, ETHUSD)  
**Key transitions**:
- Friday 21:00 UTC: Market close (US equity EOD)
- Saturday 00:00 UTC: FX/Equity offline; Crypto 24/7
- Sunday 22:00 UTC: Weekend close (FX closes; Asia prepares)
- Monday 08:00 UTC: Asia open (JPY/HKD active; others sleeping)
- Monday 13:30 UTC: US equity open; all FX resume

---

### 1A. Friday EOD Checkpoint (2026-06-01 20:00 UTC)

**Action**: Capture fib levels for all symbols 1 hour before US market close

```bash
# Export authenticated fib levels
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260601_200000_friday_eod.json
```

**Expected Evidence**:
- ✅ FX levels (EURUSD, USDJPY, GBPUSD): fresh, `updatedAt` within last 60s
- ✅ Equity levels (US30, NAS100): fresh, `updatedAt` within last 60s
- ✅ Crypto levels (BTCUSD, ETHUSD): fresh, `updatedAt` within last 60s
- ✅ All 16 ratios present for LTF_SF and HTF_AF families

**Pass Criteria**: All symbols show fresh levels; no stale timestamps

---

### 1B. Saturday Morning Checkpoint (2026-06-01 10:00 UTC)

**Action**: Verify FX/Equity are offline; Crypto remains live

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260601_100000_saturday_am.json
```

**Expected Evidence**:
- ✅ FX levels (EURUSD, USDJPY, GBPUSD): stale or frozen (no update since Friday 21:00 UTC)
- ✅ Equity levels (US30, NAS100): offline/not-live signal (market closed)
- ✅ Crypto levels (BTCUSD, ETHUSD): **fresh**, `updatedAt` within last 60s (24/7 market)
- ✅ Dashboard signal board shows FX/Equity as OFFLINE; Crypto as LIVE

**Pass Criteria**: 
- Stale timestamps on FX/Equity (no candle progression)
- Fresh timestamps on Crypto (candle progression continues)

---

### 1C. Sunday Evening Checkpoint (2026-06-02 21:00 UTC)

**Action**: Verify pre-Monday regime and final weekend state

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/regime" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260602_210000_sunday_eve.json
```

**Expected Evidence**:
- ✅ FX regime: TRANSITIONAL or stale (market closed)
- ✅ Crypto regime: active classification (TRENDING, RANGING, or CHOP per live H1 action)
- ✅ Backend logs show no errors during weekend gap: `grep "FibEngine\|RegimeEngine\|ERROR" mt5-journal.log | tail -50`

**Pass Criteria**: No engine crashes; regime engine gracefully returns stale/offline state for closed markets

---

### 1D. Monday Asia Open Checkpoint (2026-06-03 08:00 UTC)

**Action**: Verify Asia open (JPY/HKD live, others sleeping), fib levels resume

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=USDJPY" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260603_080000_monday_asia.json

# Verify USDJPY is live, EURUSD still offline
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=EURUSD" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260603_080000_monday_eurusd.json
```

**Expected Evidence**:
- ✅ USDJPY: fresh levels, `updatedAt` within last 60s (Asia JPY session active)
- ✅ EURUSD: stale or unchanged (FX markets offline, Euro sleeps until London open)
- ✅ Crypto: continues fresh (24/7)
- ✅ Backend logs show no stale-loop errors: `[SMC_SF] ea/fib-levels ingested symbol=USDJPY levels_written=32`

**Pass Criteria**: USDJPY resumes, EURUSD remains offline, no backend errors

---

### 1E. Monday London Open Checkpoint (2026-06-03 08:30 UTC)

**Action**: Verify London open (EURUSD, GBPUSD, XAUUSD resume)

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260603_083000_monday_london.json
```

**Expected Evidence**:
- ✅ EURUSD: fresh levels resume, `updatedAt` within last 60s
- ✅ GBPUSD: fresh levels resume
- ✅ XAUUSD: fresh levels (gold follows London session)
- ✅ US30 / NAS100: still offline (US markets open 13:30 UTC EDT)
- ✅ All 16 ratios present across families

**Pass Criteria**: FX resumes fresh level updates; equities remain offline until 13:30 UTC

---

### 1F. Monday US Open Checkpoint (2026-06-03 13:30 UTC)

**Action**: Verify US equity markets resume

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=US30" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260603_133000_monday_us_open.json

curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=NAS100" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260603_133000_monday_nas100.json
```

**Expected Evidence**:
- ✅ US30: fresh levels, `updatedAt` within last 60s
- ✅ NAS100: fresh levels resume
- ✅ All markets (FX, crypto, equities): live and updating normally
- ✅ Dashboard board shows all symbols GREEN (LIVE)

**Pass Criteria**: All markets resume normal operation; no stale levels; full matrix updates

---

## Test 2: Sparse-Data Scenario

**Timeline**: Execute during an identified illiquid session or simulate using historical data  
**Trigger**: Identify a market holiday (e.g., US Thanksgiving 2026-11-26) or news blackout with >10 minute M15 candle gaps  
**Key measurement**: Verify fib engine does not crash and returns valid levels despite sparse candles

---

### 2A. Pre-Sparse Checkpoint (Baseline)

**Action**: Capture normal fib state before sparse session begins

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=EURUSD" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260626_sparse_baseline.json
```

**Expected Evidence**:
- ✅ 16 ratios present for LTF_SF and HTF_AF
- ✅ All timeframes (M15, H1, H4, D1) have valid levels
- ✅ `levels_written=128` in backend log (full matrix)

**Pass Criteria**: Full matrix; no missing ratios

---

### 2B. During Sparse Session (Illiquid Window)

**Action**: Monitor fib engine behavior during sparse-candle gap (e.g., >10 min between M15 closes)

```bash
# Poll every 5 min during sparse window
for i in {1..6}; do
  curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=EURUSD" \
    -H "Authorization: Bearer [token]" \
    -o ./snapshots/20260626_sparse_during_${i}.json
  sleep 300
done

# Check backend logs for engine errors
grep "FibEngine\|ERROR\|NaN\|exception" mt5-journal.log | grep "20260626"
```

**Expected Evidence**:
- ✅ No errors in backend logs during sparse window
- ✅ No `NaN` or crash entries in MT5 journal
- ✅ Levels either **hold stale** (if no new candles) or **update** (if new candle formed)
- ✅ No ERR_ZERO_TIMEFRAME or ERR_CUSTOM_RATE_ERRORS logged

**Pass Criteria**: Engine remains stable; no crashes during sparse period

---

### 2C. Post-Sparse Checkpoint (Recovery)

**Action**: Verify recovery to normal operation after sparse session ends

```bash
curl -X GET "https://[backend]/wp-json/sniper/v1/market-data/fib-levels?symbol=EURUSD" \
  -H "Authorization: Bearer [token]" \
  -o ./snapshots/20260626_sparse_recovery.json
```

**Expected Evidence**:
- ✅ Levels resume normal updates (M15 candles close every 15 min)
- ✅ All 16 ratios present again
- ✅ `levels_written=128` resumed in backend log
- ✅ No stale data corruption from sparse gap period

**Pass Criteria**: Full matrix recovery; no orphaned ratios; normal candle progression resumes

---

## Evidence Capture & Sign-Off

### Checklist for Weekend Gap Test

- [ ] 1A: Friday EOD snapshot captured (`20260601_200000_friday_eod.json`)
- [ ] 1B: Saturday AM snapshot captured (`20260601_100000_saturday_am.json`) — FX/Equity offline, Crypto live
- [ ] 1C: Sunday Eve snapshot captured + backend logs reviewed
- [ ] 1D: Monday Asia snapshot captured (`20260603_080000_`) — USDJPY live, EURUSD offline
- [ ] 1E: Monday London snapshot captured (`20260603_083000_`) — EURUSD/GBPUSD/XAUUSD resume
- [ ] 1F: Monday US Open snapshot captured (`20260603_133000_`) — US30/NAS100 resume
- [ ] ✅ **Verdict**: PASS / FAIL / CONDITIONAL

**Operator Sign-Off**:
```
Name: ________________
Date: ________________
Signature: ________________
Notes: ________________________________________________
```

### Checklist for Sparse-Data Test

- [ ] 2A: Baseline sparse snapshot captured
- [ ] 2B: Sparse-window monitoring completed (6 polls every 5 min); backend logs checked
- [ ] 2C: Recovery snapshot captured; full matrix confirmed
- [ ] ✅ **Verdict**: PASS / FAIL / CONDITIONAL

**Operator Sign-Off**:
```
Name: ________________
Date: ________________
Signature: ________________
Notes: ________________________________________________
```

---

## Integration with Phase 4 Gate

Once both tests are complete:

1. **Archive evidence** to `.github/migration/phase-updates/phase4-weekend-sparse-evidence-[date].md`
2. **Update Phase 4 checklist**: Mark weekend-gap and sparse-data tests as COMPLETE
3. **Link evidence** from `.github/migration-status.md` Phase 4 summary
4. **Proceed to paired export**: Begin MT5 + Pine export capture for final parity gate (2026-06-26)

---

## Do Not Touch List

- Do not modify fib/regime/signal engine code during soak
- Do not reset EA during test window (continuous soak required)
- Do not change watched symbol set mid-test
- Do not interrupt backend polling cycle
- Do not modify market-data endpoint authentication

---

## Questions / Escalation

If any test fails:

1. Capture detailed backend logs: `tail -200 backend-logs-[date].log > ./snapshots/failure-logs.txt`
2. Capture MT5 terminal journal: `copy mt5-journal.log ./snapshots/mt5-journal-failure.log`
3. Update Phase 4 checklist with blocker status
4. Escalate to Project Manager with evidence snapshot

**Success = Both tests PASS with complete evidence archive.**
