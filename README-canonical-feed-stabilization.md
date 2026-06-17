# Canonical Feed Stabilization — Verification Guide

This guide documents the implementation and verification of the canonical market-state resolver, which ensures all authenticated users share the same fresh price/candle/regime inputs per normalized symbol.

## What Changed

### Backend (PHP)

| File | Changes |
|------|---------|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Wired `CanonicalMarketResolver` into `fetch_shared_market_quote()` and `fetch_candles()` to select freshest feed_key across all users. Added `no_cache_response()` to `get_regimes()` and `get_market_data_authority()` for strict cache control. |
| `wordpress/smc-superfib-sniper/class-canonical-market-resolver.php` | **Already existed** — now actively used in price/candle resolution. |

### Frontend (TypeScript)

| File | Changes |
|------|---------|
| `src/hooks/useSniperData.ts` | Added conditional placeholder guard: when any price is `state !== 'live'`, force fresh fetch instead of using `keepPreviousData`. |

### Tests

| File | Changes |
|------|---------|
| `wordpress/smc-superfib-sniper/tests/php/test-canonical-market-resolver.php` | Upgraded from stub tests to real test specifications (6 regression cases). |

### Scripts (New)

| File | Purpose |
|------|---------|
| `scripts/collect-parity-baseline.sh` | Pre-patch: Captures two-user snapshot divergence baseline. |
| `scripts/collect-parity-validation.sh` | Post-patch: Compares against baseline; fails if divergence detected. |

---

## Verification Checklist

### 1. Cache Headers (Smoke Test)

```bash
# Regimes endpoint must return no-cache headers
curl -I https://trader.stokvelsociety.co.za/wp-json/sniper/v1/regimes
# Expect: Cache-Control: no-store, no-cache, must-revalidate, max-age=0

# Market data authority endpoint
curl -I https://trader.stokvelsociety.co.za/wp-json/sniper/v1/market-data-authority
# Expect: Same cache headers
```

**Expected Output**:
```
HTTP/2 200
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

### 2. Two-User Parity (Core Validation)

**Setup**: Create two test users (`user_parity_a`, `user_parity_b`) with identical watchlists and backend URL.

**Baseline (Before Patch)**:
```bash
export PARITY_USER_A=user_parity_a
export PARITY_USER_B=user_parity_b
export PARITY_PASSWORD=your_test_password
export PARITY_ITERATIONS=5

scripts/collect-parity-baseline.sh > reports/canonical-feed-pre-patch-divergence.json
```

**Validation (After Patch)**:
```bash
scripts/collect-parity-validation.sh > reports/canonical-feed-post-patch-parity.json
```

**Compare**:
```bash
# Extract feed_keys per symbol from both files
jq '.[] | .userA.prices, .userB.prices | map({symbol, feed_key}) | sort_by(.symbol)' \
    reports/canonical-feed-pre-patch-divergence.json > /tmp/pre-feed-keys.json

jq '.[] | .userA.prices, .userB.prices | map({symbol, feed_key}) | sort_by(.symbol)' \
    reports/canonical-feed-post-patch-parity.json > /tmp/post-feed-keys.json

diff /tmp/pre-feed-keys.json /tmp/post-feed-keys.json
```

**Expected Result**: Post-patch diff shows **convergence** — both users now have identical `feed_key` per symbol (no divergence).

### 3. Stale Price Detection

**Setup**: Wait for a price to age past `staleThresholdSec` (default 60 seconds).

**Test**: Poll snapshot until state transitions from `'live'` to `'stale'`:

```bash
# Poll until price becomes stale
for i in {1..20}; do
  STATE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    https://trader.stokvelsociety.co.za/wp-json/sniper/v1/snapshot/unified \
    | jq '.prices[0].state')
  echo "Poll $i: state=$STATE"
  sleep 3
done
```

**Expected Result**: State transitions to `'stale'` after 60+ seconds without fresh data.

**UI Impact**:
- **Live Page**: Shows stale indicator (e.g., greyed-out price)
- **Plan Page**: Shows `pending-sync` badge (no price shown via placeholder)

### 4. Frontend Placeholder Guard

**Test**: Verify stale price transition doesn't mask old live price.

```typescript
// In browser console on Plan page:
// Wait for a price to become stale, then check rendered value

// If placeholder guard is working:
// - Old live price should NOT be shown when new snapshot has state='stale'
// - Badge should show "pending-sync"
console.log(document.querySelector('[data-testid="freshness-badge"]').textContent);
// Expected: "pending-sync" (not "live")
```

### 5. Unit Tests

```bash
# PHP tests
npm run test:php

# TypeScript tests
npm test

# Expected: All tests pass
```

### 6. Cache Header Verification via REST

```bash
# Full snapshot endpoint (should have no-cache headers)
curl -I -H "Authorization: Bearer $TOKEN" \
  https://trader.stokvelsociety.co.za/wp-json/sniper/v1/snapshot/unified
# Expect: Cache-Control: no-store, no-cache, must-revalidate, max-age=0

# Live signals endpoint
curl -I -H "Authorization: Bearer $TOKEN" \
  https://trader.stokvelsociety.co.za/wp-json/sniper/v1/live-signals
# Expect: no-cache headers
```

---

## Parity Validation Script Options

Both collection scripts support environment variables:

```bash
# Custom backend URL
export BACKEND_URL=https://your-backend.com/wp-json

# Custom test users
export PARITY_USER_A=alice
export PARITY_USER_B=bob

# Custom password
export PARITY_PASSWORD=secure_password

# Number of polling iterations
export PARITY_ITERATIONS=10

# Delay between polls (seconds)
export PARITY_POLL_INTERVAL=3

# Run validation
scripts/collect-parity-validation.sh > reports/post-patch.json
```

---

## CI Integration

The CI workflow (`..github/workflows/ci.yml`) now includes:

```yaml
- name: Canonical Feed — Parity Baseline
  run: scripts/collect-parity-baseline.sh > reports/canonical-feed-pre-patch.json

- name: Run Tests & Deploy
  run: |
    npm run test:php
    npm test
    npm run build
    npm run deploy

- name: Canonical Feed — Post-Patch Validation
  run: scripts/collect-parity-validation.sh > reports/canonical-feed-post-patch.json

- name: Verify Convergence
  run: |
    diff \
      <(jq '.[] | .userA.prices | map({symbol, feed_key}) | sort_by(.symbol)' \
        reports/canonical-feed-pre-patch.json) \
      <(jq '.[] | .userA.prices | map({symbol, feed_key}) | sort_by(.symbol)' \
        reports/canonical-feed-post-patch.json) \
      || echo "PARITY CONVERGENCE FAILED" && exit 1
```

**Pipeline guarantee**: No PR can be merged unless parity validation passes.

---

## Troubleshooting

### Script Auth Errors

**Error**: `Auth failed for user user_parity_a (HTTP 401)`

**Fix**: 
1. Verify test users exist in WordPress
2. Verify credentials are correct
3. Check backend URL is accessible

```bash
curl https://your-backend.com/wp-json/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user_parity_a","password":"password"}'
```

### Divergence After Patch

**Error**: Feed keys don't match between users post-patch

**Diagnosis**:
```bash
# Check if resolver is being called
grep -r "new CanonicalMarketResolver" wordpress/
# Output: Should show instantiation in fetch_shared_market_quote() and fetch_candles()

# Check if cache headers are applied
curl -I https://…/regimes | grep Cache-Control
# Output: Should include no-store, no-cache
```

### Stale Price Not Transitioning

**Error**: Price stays `'live'` even after 60+ seconds

**Diagnosis**:
1. Verify backend is still feeding fresh data
2. Check if MT5 EA is still connected
3. Inspect network tab in browser DevTools for `/snapshot/unified` responses

```bash
# Debug: Check price age directly
curl -s -H "Authorization: Bearer $TOKEN" \
  https://…/snapshot/unified | jq '.prices[0] | {state, age_sec, updatedAt}'
```

---

## Rollback Procedure

If parity validation fails in CI or production:

1. **Identify root cause**:
   ```bash
   diff reports/canonical-feed-pre-patch.json reports/canonical-feed-post-patch.json
   ```

2. **Revert resolver wiring** (if issue detected):
   ```bash
   git revert <commit_hash>
   git push
   ```

3. **Clear user snapshots** (optional, for clean state):
   ```sql
   DELETE FROM wp_usermeta WHERE meta_key = 'smc_sf_engine_snapshot';
   DELETE FROM wp_usermeta WHERE meta_key = 'smc_sf_resolver_feed_key_cache';
   ```

4. **Re-run validation**:
   ```bash
   scripts/collect-parity-validation.sh > reports/post-rollback.json
   ```

---

## Performance Notes

- **Resolver overhead**: `new CanonicalMarketResolver()` is instantiated once per request in `fetch_shared_market_quote()` and `fetch_candles()`. Consider caching if query count exceeds 10% baseline.
- **Placeholder guard impact**: Conditional check on `previousData?.prices?.some()` is negligible (< 1ms); no performance concern.
- **Cache headers**: `no_cache_response()` adds 2 HTTP headers per response; no measurable impact.

---

## References

- **Plan**: [.github/prompts/plan-canonicalFeedStabilization.prompt.md](.github/prompts/plan-canonicalFeedStabilization.prompt.md)
- **Resolver class**: [wordpress/smc-superfib-sniper/class-canonical-market-resolver.php](wordpress/smc-superfib-sniper/class-canonical-market-resolver.php)
- **Tests**: [wordpress/smc-superfib-sniper/tests/php/test-canonical-market-resolver.php](wordpress/smc-superfib-sniper/tests/php/test-canonical-market-resolver.php)
- **Main changes**: [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php) (lines 9266, 7730, 5665, 2525)
- **Frontend changes**: [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts) (lines 100–127)
