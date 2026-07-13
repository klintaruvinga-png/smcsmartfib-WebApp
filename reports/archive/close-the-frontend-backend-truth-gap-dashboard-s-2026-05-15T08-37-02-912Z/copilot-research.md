# SMC SuperFIB — Frontend/Backend feedStatus Truth Gap Investigation

## 1. Issue Classification

- **Severity**: HIGH
- **Category**: data-contract / stale-data / frontend-backend-parity
- **Layer(s) affected**: Dashboard-JS / PHP-backend / REST-API
- **Phase impact**: Phase 0 / Phase 1 (migration authority boundary)

---

## 2. Confirmed Evidence

### 2.1. Admin Health Component
- **File**: [src/routes/admin.tsx](src/routes/admin.tsx#L570-L600)
- **Pattern**: Renders feedStatus using fallback: `health.feedStatus ?? health.priceFeed`
- **Display**: HealthCard component shows System Status based on this field
- **Read-only**: "values are owned and updated by the backend"

### 2.2. Dashboard Signals Health Status
- **File**: [src/routes/signals.tsx](src/routes/signals.tsx#L60-L90)
- **Pattern**: Uses identical fallback: `h?.feedStatus ?? h?.priceFeed ?? "offline"`
- **Logic**: Normalizes "rate-limited" → "stale" for FreshnessState rendering
- **Authority check**: `mt5AuthorityLive = h?.feedStatus === "live"`

### 2.3. Backend Health Endpoint
- **File**: [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L1180-L1320)
- **Computation**: feedStatus aggregates per-symbol MT5 freshness:
  - All symbols MT5-live → `live`
  - Any rate-limited (without MT5 authority) → `rate-limited`
  - Key missing/blocked → `blocked`
  - Batch age ≤120s and no stale symbols → `live`
  - Otherwise → `stale`
- **Evidence logs**: Extensive `[PHASE0_SOAK]` instrumentation present
- **Example log**: `[PHASE0_SOAK] Final feed status: all_symbols_mt5_live=false | feed_any_rate_limited=false | key_status=ok | batch_age=3 | RESULT=stale`

### 2.4. Frontend Query & Polling
- **File**: [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts#L1-L50)
- **Pattern**: React Query with polling interval: `refetchInterval: pollMs ?? DEFAULT_POLL_MS`
- **Default poll**: 2000ms (2 seconds)
- **Query keys**: `["snapshot"]`, `["live-signals"]`, `["engine-health"]`
- **Stale time**: 10_000ms (10 seconds) default per [src/router.tsx](src/router.tsx#L1-L20)

### 2.5. Documented Mismatch
- **File**: [.github/migration-status.md](../.github/migration-status.md#L8-L20)
- **Log entry**: "Frontend feed status mismatch documented: backend health reports live while UI still renders stale."
- **Status**: Marked as pending validation/closure

---

## 3. Root Cause Hypothesis

### 3.1. Most Likely: Stale Query Cache Not Invalidated on Backend Update
**Confirmed**
- Admin and Signals pages both poll the same health endpoint at 2s intervals
- React Query caches response with 10s stale time
- If backend updates feedStatus (e.g., all MT5 symbols now fresh), but:
  1. A stale cached response exists in React Query cache
  2. The next refetch hasn't fired yet
  3. OR a refetch fired but the response hasn't been processed
- **Result**: Dashboard continues rendering the old stale value

**Why this fits**:
- Both components use identical `health.feedStatus ?? health.priceFeed` logic
- Evidence shows backend IS computing feedStatus correctly (logs confirm transitions)
- Symptom matches query cache lag, not source-of-truth divergence
- Documented as "UI still renders stale" while backend shows live

### 3.2. Secondary: Health Query Not Refetching on Watchlist Changes
**Hypothesis**
- When watchlist is modified, feedStatus computation changes (different symbols, different MT5 authority)
- [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts#L200-L220) cancels and invalidates many queries on watchlist mutation
- **Question**: Is the health query explicitly invalidated when watchlist changes?
- If not, an old cached health response could persist with stale feedStatus

### 3.3. Tertiary: Admin Health Endpoint Not Mirroring Public Health
**Unconfirmed**
- Admin health test asserts: `assert_same($health, $adminHealth, 'Admin health endpoint must proxy the same payload as /health')`
- If there is a code path where they diverge, admin could show different feedStatus
- **Likelihood**: Low (test exists and should catch divergence)

---

## 4. Blast Radius

### 4.1. Affected Files & Components
- [src/routes/admin.tsx](src/routes/admin.tsx) — HealthCard display of feedStatus
- [src/routes/signals.tsx](src/routes/signals.tsx) — Feed status check and authority logic
- [src/components/sniper/FreshnessBadge.tsx](src/components/sniper/FreshnessBadge.tsx) — Renders FreshnessState
- [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts) — Query polling and invalidation
- [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php) — Backend health computation
- React Query cache state (QueryClient in [src/router.tsx](src/router.tsx))

### 4.2. Parity Surfaces at Risk
- **Pine → Backend**: feedStatus authority is now on backend (MT5 EA push vs. Twelve Data)
- **Backend → Dashboard**: health.feedStatus must stay in sync via polling
- **Dashboard UI layers**: Admin health, Signals status chip, FreshnessBadge all display the same field
- **Authority boundary**: MT5 live signals depend on feedStatus=live to proceed

### 4.3. Stale-State Risks
- Query cache can hold 10s of stale data if refetch is delayed
- Watchlist mutations may not invalidate health query
- Rapid feedStatus transitions (e.g., market open/close) could appear delayed
- Signal engine blocks execution on feedStatus !== "live" — if UI shows stale but backend is live, user sees false blocker

---

## 5. Regression Surface

### 5.1. Currently Working Behavior to Preserve
- Both admin and signals pages correctly render `feedStatus ?? priceFeed` fallback
- Backend health computation is validated by tests and soak logs
- React Query polling is active and working (2s default interval)
- Watchlist mutations cascade invalidate to snapshot/signals queries
- HealthCard tone styling is correct per FreshnessState

### 5.2. Existing Guards
- FreshnessBadge hardened against unknown state strings (safe fallback to "stale")
- Admin health marked read-only with "values owned by backend"
- Health test verifies admin endpoint proxies correctly
- Soak logs show backend computing feedStatus correctly through multiple state transitions

### 5.3. Tests & Audits Covering This Area
- [wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php](wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php#L760-L805) — health endpoint contract
- Phase 0 soak tracker — documents feedStatus transitions during market hours
- Manual health checks via browser console show correct responses

---

## 6. Resolution Path Options

### Option A: Force Health Query Invalidation on Backend Update (Recommended)
**Surface**: Narrow
- **Action**: Implement aggressive refetch on watchlist mutations
- **Mechanism**: 
  1. Confirm health query is included in `invalidateWatchlistQueries()` cascade
  2. Consider polling feedStatus separately at faster interval (e.g., 1s) during trading hours
  3. Add explicit staleTime=0 for health query to disable caching during Phase 0
- **Rationale**: Quickest closure; leverages existing React Query invalidation pattern; no backend changes
- **Risk**: Minimal; increases polling load but Phase 0 is single-user soak

### Option B: Health Query Refresh Trigger (Backend Push Signal)
**Surface**: Moderate
- **Action**: Backend returns `nextRefetchHint` in health response
- **Mechanism**:
  1. When backend detects feedStatus change (any symbol transitions live/stale), increment hint
  2. Frontend detects hint change, manually refetch immediately
  3. Reduces reliance on polling interval for state transitions
- **Rationale**: Responds to state changes in real-time; survives polling delays
- **Risk**: Requires backend contract change; adds complexity to health response

### Option C: Separate Authority Source for UI
**Surface**: Broader
- **Action**: Create UI-dedicated freshness endpoint
- **Mechanism**: 
  1. Backend maintains separate UI health cache (aggregates from main cache)
  2. Shorter TTL on UI cache (1s vs. 10s)
  3. UI polls only the UI endpoint
- **Rationale**: Decouples UI refresh from engine health polling
- **Risk**: Introduces new endpoint and caching layer; higher maintenance

### **Recommended**: Option A
- **Why**: Lowest risk, fastest implementation, proven pattern in codebase
- **Phases**: 
  1. Verify health query is in watchlist invalidation list
  2. Set `staleTime: 0` for health query (opt-out of caching)
  3. Optional: reduce polling interval to 1s for Phase 0
  4. Validate via soak log

---

## 7. Risk Flags

### High-Risk System Involved?
**YES**
- feedStatus gates signal engine execution and MT5 authority decisions
- False "stale" while backend is "live" blocks all trading signals
- Directly blocks Phase 0 → Phase 1 gate

### Requires Parity Re-Validation?
**YES**
- **Engine**: Signal engine (reads feedStatus to determine authority)
- **Test**: Confirm dashboard reflects backend feedStatus within <2s after transition
- **Regression**: Ensure stale fibs still render correctly when feedStatus=stale

### Migration-Blocking?
**YES**
- Phase 0 gate: "frontend health mismatch" must close before Phase 1 approval
- Phase 1 depends on dashboard authority reflecting MT5 live state accurately

### Human Review Required?
**YES**
- Authority boundary (Pine → MT5) is critical
- Query caching decisions affect real-time perception of system state
- Soak validation must confirm no false "live" states are rendered

---

## 8. Handoff Package

### Epicentre Files to Inspect First
1. [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts) — React Query health polling setup
2. [src/routes/admin.tsx](src/routes/admin.tsx) — Admin health display logic
3. [src/routes/signals.tsx](src/routes/signals.tsx) — Signals page health check
4. [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php) — Backend health builder

### Inputs Codex Must Verify Before Planning
1. Is the health query currently in the `invalidateWatchlistQueries()` invalidation list?
2. What is the current staleTime for the health query? (default is 10s)
3. Has feedStatus ever been observed to transition live → stale or vice versa in logs without the UI updating?
4. What is the round-trip latency for `/health` endpoint in Phase 0 soak?
5. Is there a timing window between watchlist mutation and health query refresh?

### Open Unknowns
- **Unknown 1**: Exact latency profile for /health endpoint under load
- **Unknown 2**: Whether rapid feedStatus transitions (sub-1s) have been observed
- **Unknown 3**: Whether UI has been manually tested to show delayed update after backend change
- **Unknown 4**: Full query dependency graph for watchlist mutations

---

## Investigation Summary

The frontend/backend truth gap on feedStatus is not a source-of-truth divergence—both admin.tsx and signals.tsx use the identical fallback pattern (`feedStatus ?? priceFeed`) and the backend correctly computes feedStatus by aggregating per-symbol MT5 freshness. The root cause is **query cache staleness**. React Query's 10-second default staleTime allows the dashboard to display an outdated health response even after the backend has updated to reflect a new feedStatus state.

**Path forward**: Force health query refresh via aggressive invalidation on watchlist mutations and reduce staleTime to 0 for Phase 0, ensuring the dashboard reflects backend state within 1–2 seconds of any feedStatus transition. This preserves the proven polling architecture while eliminating the cache lag that manifests as the documented "UI still renders stale while backend shows live" mismatch.
