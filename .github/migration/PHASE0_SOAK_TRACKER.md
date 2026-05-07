# Phase 0 Live Soak & Completion Tracking Guide
**Started**: 2026-05-06  
**Target Completion**: 2026-05-17  
**Status**: READY TO BEGIN

---

## Overview
This document tracks the live soak test, debugging steps, manual fixes, and evidence collection needed to complete Phase 0 stabilization. Use this as your working reference during the 72h soak period.

### Key Blockers to Resolve
1. ✅ Price feed stable for 72h+ (verify no false LIVE/STALE transitions)
2. ✅ Feed status shows `stale` (not `rate-limited`/`blocked`) when EA symbols age out
3. ✅ MT5 M1 → 15min candle aggregation working for all symbols (>=30 candles)
4. ✅ Full Pine/backend/dashboard parity audit (>95%)

---

## Step 1: Pre-Soak Setup & Logging Configuration

### 1a. Enable Detailed Logging in Backend

**File**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

Add the following log statements (if not already present) for tracking feed status and rate-limit state:

#### Location 1: Around line 498-545 (feedStatus calculation)
```php
// LOG: Per-symbol MT5 authority check and rate-limit state
error_log(sprintf(
    '[PHASE0_SOAK] Health check: symbol=%s | mt5_live=%s | mt5_candles_live=%s | rate_limited=%s | age_sec=%d',
    $symbol,
    $mt5_price_live ? 'true' : 'false',
    $mt5_candles_live ? 'true' : 'false',
    $this->is_feed_rate_limited($user_id, $symbol) ? 'true' : 'false',
    $price_age ?? PHP_INT_MAX
));

// LOG: Final feedStatus decision
error_log(sprintf(
    '[PHASE0_SOAK] Final feed status: all_symbols_mt5_live=%s | feed_any_rate_limited=%s | key_status=%s | batch_age=%d | RESULT=%s',
    $all_symbols_mt5_live ? 'true' : 'false',
    $feed_any_rate_limited ? 'true' : 'false',
    $key_status,
    $batch_age,
    $feed_status
));
```

#### Location 2: Around line 2186 (candle TTL check)
```php
// LOG: Candle fetch attempt
error_log(sprintf(
    '[PHASE0_SOAK] fetch_candles: symbol=%s | timeframe=%s | ttl_active=%s | has_key=%s | will_call_td=%s',
    $symbol,
    $timeframe,
    $candle_ttl_active ? 'true' : 'false',
    is_wp_error($key) ? 'error' : ($key ? 'true' : 'false'),
    (!$candle_ttl_active && !is_wp_error($key) && $key) ? 'true' : 'false'
));
```

#### Location 3: Around line 2203 (429 response)
```php
// LOG: Rate-limit transient set
error_log(sprintf(
    '[PHASE0_SOAK] Rate-limit 429 detected: symbol=%s | setting transient ttl_sec=60',
    $symbol
));
```

#### Location 4: Around line 2818-2820 (is_feed_rate_limited check)
```php
private function is_feed_rate_limited($user_id, $symbol = null) {
    $key = $symbol !== null ? $this->rl_transient_key($user_id, $symbol) : $this->rl_transient_key($user_id);
    $state = get_transient($key) !== false;
    
    // LOG: Check for debugging
    if ($state && $symbol) {
        error_log(sprintf('[PHASE0_SOAK] is_feed_rate_limited: TRUE for %s', $symbol));
    }
    
    return $state;
}
```

### 1b. Enable Frontend Console Logging

**File**: live.tsx, around line 342:

```typescript
if (diagnostic?.engineBlocker === "RATE_LIMITED") {
  console.warn(
    `[PHASE0_SOAK] Live Radar: ${price.symbol} blocked by RATE_LIMITED`,
    { diagnostic, price, regime, gate }
  );
}
```

### 1c. Monitor WordPress Logs

**Command to tail logs** (run in terminal):
```bash
# On Windows PowerShell with WSL:
tail -f /var/www/html/wp-content/debug.log | grep "PHASE0_SOAK"

# Or live monitoring:
Get-Content -Path "C:\path\to\wp-content\debug.log" -Tail 50 -Wait | findstr "PHASE0_SOAK"
```

---

## Step 2: Run Live Soak (72h Monitoring)

### 2a. Baseline Snapshot (T+0:00)

When starting the EA, record:
- [ ] Start time: __________________
- [ ] EA symbols running: __________________
- [ ] MT5 terminal status: __________________
- [ ] Backend health endpoint: __________________
- [ ] Twelve Data key status: __________________

**Manual health check**:
```bash
curl -s https://your-backend.com/health | jq '.feedStatus, .backendSync, .twelveDataKeyStatus'
```

### 2b. Continuous Monitoring Checkpoint Table

| Checkpoint | Time | Feed Status | MT5 Live Count | Candles OK | Notes |
|-----------|------|-------------|----------------|-----------|-------|
| T+0h | __ | __ | __ | __ | Baseline |
| T+12h | __ | __ | __ | __ | |
| T+24h | __ | __ | __ | __ | **Day 1 complete** |
| T+36h | __ | __ | __ | __ | |
| T+48h | __ | __ | __ | __ | **Day 2 complete** |
| T+60h | __ | __ | __ | __ | |
| T+72h | __ | __ | __ | __ | **Soak complete** |

### 2c. Test Scenario A: Symbol Aging (Market Close/Weekend)

**Expected behavior**: Feed status should show `stale` not `rate-limited`

**Check**:
- [ ] Review logs for: `[PHASE0_SOAK] Final feed status: ... RESULT=stale`
- [ ] Verify `mt5_live=false` and `rate_limited=false`
- [ ] Screenshot Live Radar showing `stale` state

**If stuck on `rate-limited`**:
```sql
-- Check for stuck transients
SELECT option_name, option_value FROM wp_options 
WHERE option_name LIKE '%smc_sf_rl_%';

-- Delete stuck transient (manual fix):
DELETE FROM wp_options WHERE option_name = 'smc_sf_rl_<USER_ID>_<SYMBOL>';
```

### 2d. Test Scenario B: Force Refresh

**Expected behavior**: All transients clear, feed recovers automatically

**Check**:
- [ ] Logs show transient deletion: `[PHASE0_SOAK] Cleared rate-limit transients`
- [ ] feedStatus updates to `live` or `stale` based on fresh data
- [ ] No symbols remain stuck on `rate-limited`

### 2e. Test Scenario C: Backend Restart

**Expected behavior**: Transients clear, feed recovers to normal state

**Check**:
- [ ] Logs show clean state after restart
- [ ] feedStatus correctly reflects current state

---

## Step 3: Candle History Verification (Parallel with Soak)

### 3a. Enable Candle Gap Logging

**File**: smc-superfib-sniper.php, lines 2180-2210:

```php
private function fetch_candles($user_id, $symbol, $timeframe, $outputsize) {
    // ... existing code ...
    
    global $wpdb;
    $stored_candles = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM {$this->table('candles')} WHERE user_id = %d AND symbol = %s AND timeframe = %s ORDER BY time DESC LIMIT 120",
        $user_id,
        $symbol,
        $timeframe
    ));
    
    $count = count($stored_candles);
    if ($count < 30) {
        error_log(sprintf(
            '[PHASE0_SOAK] CANDLE_GAP: symbol=%s | timeframe=%s | count=%d | status=INSUFFICIENT',
            $symbol,
            $timeframe,
            $count
        ));
    } else {
        error_log(sprintf(
            '[PHASE0_SOAK] CANDLE_OK: symbol=%s | timeframe=%s | count=%d',
            $symbol,
            $timeframe,
            $count
        ));
    }
    
    return $stored_candles;
}
```

### 3b. Candle Count Query

Run periodically during soak:
```sql
SELECT 
    symbol,
    timeframe,
    COUNT(*) as candle_count,
    MIN(time) as oldest,
    MAX(time) as newest
FROM wp_smc_sf_candles
WHERE user_id = YOUR_USER_ID
GROUP BY symbol, timeframe
ORDER BY symbol, timeframe;
```

### 3c. Candle History Tracker

| Symbol | Timeframe | T+24h | T+48h | T+72h | Status |
|--------|-----------|-------|-------|-------|--------|
| | M1 | | | | |
| | 15min | | | | |

**Target**: All symbols >=30 candles in 15min by T+72h

### 3d. Manual Fix: Trigger Aggregation

If symbol is stuck with <30 candles:
```php
// Force M1 → 15min aggregation:
$m1_candles = $this->fetch_candles($user_id, $symbol, '1min', 1000);
$this->aggregate_m1_to_15min($user_id, $symbol, $m1_candles);
$m15_candles = $this->fetch_candles($user_id, $symbol, '15min', 120);
error_log(sprintf('[FIX] Aggregation complete: %s | now have %d 15min candles', $symbol, count($m15_candles)));
```

---

## Step 4: Feed Status Behavior Verification

### 4a. Verify `stale` During Aging

**Expected log sequence**:
```
[PHASE0_SOAK] Health check: symbol=EURUSD | mt5_live=true | mt5_candles_live=true | rate_limited=false | age_sec=5
[PHASE0_SOAK] Final feed status: all_symbols_mt5_live=true | feed_any_rate_limited=false | key_status=ok | batch_age=8 | RESULT=live

... hours pass, no EA pushes ...

[PHASE0_SOAK] Health check: symbol=EURUSD | mt5_live=false | mt5_candles_live=false | rate_limited=false | age_sec=18000
[PHASE0_SOAK] Final feed status: all_symbols_mt5_live=false | feed_any_rate_limited=false | key_status=ok | batch_age=18005 | RESULT=stale
```

**Verification checks**:
- [ ] `mt5_live` transitions true → false
- [ ] `feed_any_rate_limited` stays false
- [ ] `RESULT` is `stale` (not `rate-limited`)

### 4b. If Stuck on `rate-limited`

1. Find which symbol is causing it
2. Check transient state:
   ```sql
   SELECT * FROM wp_options WHERE option_name LIKE '%smc_sf_rl_%';
   ```
3. Delete if stale:
   ```php
   delete_transient('smc_sf_rl_<USER_ID>_<SYMBOL>');
   ```

---

## Step 5: Regression Checklist (T+24h, T+48h, T+72h)

### 5a. No False LIVE States
- [ ] No stale prices showing as `live`
- [ ] feedStatus doesn't show `live` when batch_age > 120

### 5b. No Stale-Loop Deadlocks
- [ ] feedStatus not flipping rapidly (>1 per minute)
- [ ] No timestamp corruption in logs

### 5c. Sufficient Candles
- [ ] All symbols have >=30 candles
- [ ] No symbols stuck at <10 candles

### 5d. Heartbeat Growth
```sql
SELECT COUNT(*) FROM wp_smc_sf_engine_runs 
WHERE user_id = YOUR_USER_ID 
  AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR);
```
- [ ] Row count grows linearly (1-2 per refresh cycle)
- [ ] Not zero (EA must be running)

---

## Step 6: Parity Audit After Soak

### 6a. Run Full Comparison

After T+72h, compare:
- **Pine signals** (manual review or logs)
- **Backend signals** (query signals table)
- **Dashboard signals** (screenshot or API)

**Expected**: >=95% match on direction, status, levels, regime, gate state

### 6b. Create Parity Report

File: `.github/migration/audits/phase-0-full-parity-2026-05-10.md`

```markdown
# Phase 0 Full Parity Audit - [Date]

**Soak Period**: 2026-05-06 to 2026-05-[XX]  
**Symbols Tested**: [list]

## Signal Engine Parity
- Sample Size: [N]
- Match Rate: [X]%
- Status: ✓ PASS (>95%) | ✗ FAIL

## Fib Engine Parity
- Sample Size: [N]
- Match Rate: [X]%
- Status: ✓ PASS (>95%) | ✗ FAIL

## Regime Parity
- Sample Size: [N]
- Match Rate: [X]%
- Status: ✓ PASS (>95%) | ✗ FAIL

## Candle History Verification
- All symbols >=30 M1 candles: ✓ YES | ✗ NO
- All symbols >=30 15min candles: ✓ YES | ✗ NO
- Aggregation working: ✓ YES | ✗ NO

## Feed Status Behavior
- EA symbols age to `stale` not `rate-limited`: ✓ YES | ✗ NO
- Non-EA symbols show real TD `rate-limited`: ✓ YES | ✗ NO
- Force refresh clears transients: ✓ YES | ✗ NO

## Summary
Phase 0 Stabilization: ✓ READY FOR PHASE 1 | ✗ NEEDS MORE WORK
```

---

## Step 7: Phase 0 Completion

### 7a. Completion Log

File: `.github/migration/phase-updates/phase-0-completion-2026-05-10.md`

```markdown
# Phase 0 Completion Log - [Date]

## Actions Taken
- [x] Enabled detailed logging
- [x] Ran 72h live soak
- [x] Verified feed status transitions
- [x] Confirmed candle history adequate
- [x] Ran full parity audit
- [x] Resolved regressions

## Blockers Resolved
- ✓ Live soak completed
- ✓ Feed status verified
- ✓ Candles aggregating
- ✓ Parity >95%

## Status: ✓ PHASE 0 COMPLETE
**Ready for Phase 1: MT5 Bridge Infrastructure**
```

### 7b. Update Migration Status

Update migration-status.md:
- Change Phase 0 status from `IN-PROGRESS` to `COMPLETE`
- Set completion date
- Unlock Phase 1

---

## Troubleshooting Quick Ref

### Symbol Stuck on `rate-limited` After EA Push
**Fix**: Delete transient or verify MT5 authority
```php
delete_transient('smc_sf_rl_<USER_ID>_<SYMBOL>');
```

### Candles Stuck <30
**Fix**: Verify Twelve Data key or manually trigger aggregation
```php
$this->aggregate_m1_to_15min($user_id, $symbol, $m1_candles);
```

### feedStatus Shows `blocked` for EA Symbols
**Fix**: Check `is_mt5_authoritative()` logic in `build_symbol_state()`

### Logs Not Appearing
**Fix**: Enable WordPress debug logging in `wp-config.php`
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

---

## Sign-Off

**Soak Started**: ________________ by ________________  
**Soak Completed**: ________________ by ________________  
**All Criteria Met**: ☐ YES ☐ NO  
**Ready for Phase 1**: ☐ YES ☐ NO  

---

## Observations & Notes

[Your findings during soak go here]
```

Once added, you can track your progress directly in that file as you work through the 72h soak.Once added, you can track your progress directly in that file as you work through the 72h soak.
