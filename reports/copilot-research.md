# SMC SuperFIB - Active Book Stream Flicker Issue Research

**Date:** 2026-05-27  
**Issue:** Active Book stream is causing flickers and position/book persistance issues in between polls/refreshes

---

## 1. Issue classification

- **Severity:** HIGH
- **Category:** runtime-bug
- **Layer(s) affected:** Dashboard-JS / React-Query polling / Position persistence
- **Phase impact:** Phase 0 (production stabilization)

---

## 2. Confirmed evidence

### 2.1 Polling Architecture
- **Trigger:** `useSniperData.ts` (lines 1-150) controls all polling queries
- **Poll interval:** `DEFAULT_POLL_MS = 2_000` (2 seconds)
- **Query endpoints:**
  - `useUserTrades()` → `/user/trades` endpoint (line ~120)
  - `useSnapshot()` → `/snapshot` endpoint (line ~110)
- **Refetch strategy:** `refetchInterval: enabled ? pollMs : false` (TanStack React Query)
- **Enable condition:** `enabled = backendReady && pollMs !== null` (line ~91)

### 2.2 Book Page Position Rendering
- **File:** `src/routes/-book.page.tsx` (lines 1-150)
- **Data source:** `const { data: trades, isLoading, error } = useUserTrades()` (line ~15)
- **Position list:** `const positions = trades?.positions ?? []` (line ~28)
- **Grouping logic:** `reduce()` to group by `symbol:direction` (lines ~61-65)
- **Rendering:** Maps `Object.entries(grouped)` to render position groups (line ~74+)

### 2.3 Position State Tracking
- **Freshness field:** Each position has `state: "live" | "stale" | "unavailable"` (sniperClient.ts line ~436)
- **Book page rendering:** Checks `stale = posList.some((p) => p.state === "stale") || snapPair?.state === "stale"` (line ~77)
- **Stale warning:** Conditionally rendered when `stale === true` (lines ~104-108)

### 2.4 Streaming Animation Layers
- **File:** `useStreamingTicks.ts` (lines 1-100)
  - Creates intermediate ticks between poll updates
  - Generates 4-9 sub-ticks over ~85% of `pollMs` interval
  - Uses Brownian motion/GBM path for smooth price interpolation
  - Applies per-instance random seed for desynchronization
- **File:** `useTickFlash.ts` (lines 1-50)
  - Emits transient direction ("up" | "down") on numeric value change
  - Auto-clears after `durationMs` (default 700ms)
  - Used in charts.tsx for visual flash on price updates (line ~95)

### 2.5 Position Persistence Issues
- **No explicit position deduplication:** `useUserTrades()` query returns `trades?.positions` array without diffing
- **Array identity volatility:** Each poll refetch may produce a new array reference even if positions are unchanged
- **React re-render trigger:** Position list mapping depends on array identity, not semantic equality
- **Streaming scope:** `useStreamingTicks()` only animates single numeric values (price), not position list lifecycle
- **Cache invalidation:** TanStack React Query default behavior may aggressively invalidate on any refetch response

### 2.6 WordPress Backend Position Data Flow
- **Storage:** `wp_smc_sf_trade_positions` table with `deterministic_key` UNIQUE constraint (smc-superfib-sniper.php line ~6100)
- **Telemetry handler:** `post_user_trades()` endpoint writes positions from EA telemetry (implied via route at line ~6220)
- **Normalization:** `normalizeTelemetryPositions()` in sniperClient.ts (line ~436) reads from API response
- **Freshness field:** Mapped from backend `freshness` field to position `state` property

### 2.7 Market Authority Switching
- **File:** `get_market_data_authority()` endpoint (smc-superfib-sniper.php line ~6180)
- **Authority source:** MT5 (live) vs Twelve Data (fallback)
- **Authority state:** Read from `snapshots` table `source` field
- **Impact on book:** Authority switching may trigger cache invalidation if used as part of query key

---

## 3. Root cause hypothesis

### 3.1 Primary Root Cause: Position Array Volatility
**Most likely:** React component re-renders and positions disappear/flicker because the `positions` array reference changes on every poll, even when the underlying position data is semantically identical.

**Why this fits:**
- `useUserTrades()` returns a new `trades` object on every successful poll refetch
- Each `trades` object contains a new `positions[]` array reference (even if data is the same)
- React's diffing algorithm uses referential equality for arrays in JSX `.map()`
- When array reference changes, React unmounts/remounts position components
- Unmount/remount causes visual flicker and resets any transient animation state

### 3.2 Secondary Root Cause: Position List Mutation on Freshness Transitions
**Likely:** When backend position state transitions from `live` → `stale` or back, the position list is re-fetched and produces a different array identity.

**Why this fits:**
- Position freshness depends on MT5 EA push frequency and backend snapshot staleness
- Between polls, a position's `state` field can transition (e.g., if MT5 push gap exceeds threshold)
- Backend returns a new positions array on next poll with updated `state` values
- Frontend treats this as a complete list change, not a targeted state update
- Positions visually disappear/reappear during freshness transitions

### 3.3 Tertiary Root Cause: Lack of Position Persistence Cache
**Confirmed:** There is no client-side deduplication or diffing of position data between polls.

**Why:**
- `useSniperData.ts` uses TanStack React Query with default cache behavior
- No custom `structuralSharing` or diffing logic in the query configuration
- `useUserTrades()` query at line ~120 does not implement diff-based caching
- Each poll response is treated atomically; no tracking of which positions changed

### 3.4 Streaming Animation Does Not Address Position List Lifecycle
**Confirmed:** Streaming animations (`useStreamingTicks`, `useTickFlash`) only target individual numeric fields (price), not the position list itself.

**Why this is relevant:**
- Streaming creates the illusion of smooth updates for a single value
- But if the position list (`trades.positions[]`) is unmounted/remounted, all animations reset
- The position list itself has no fade-in/fade-out or smooth persistence layer
- New positions from a poll appear instantly; disappeared positions vanish instantly

---

## 4. Blast radius

- **Epicentre files:**
  - `src/hooks/useSniperData.ts` — polling query configuration without structural sharing
  - `src/routes/-book.page.tsx` — position list rendering without deduplication
  - `src/lib/api/sniperClient.ts` — API response normalization without change tracking
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — backend position telemetry handler

- **Affected systems:**
  - Active Book dashboard (position list flickering)
  - Position state transitions (live/stale/unavailable)
  - MT5 position telemetry ingestion (backend write side)
  - Position freshness tracking on frontend

- **Parity surfaces at risk:**
  - Position list consistency between React dashboard and WordPress backend
  - Freshness state tracking (if cache invalidation causes stale transitions to re-apply)
  - Position ID deduplication (if `deterministic_key` is not aligned with frontend key strategy)

- **Stale-state risks:**
  - If a position is briefly marked `stale` during a poll, it may disappear from the UI
  - Then reappear when next poll marks it `live` again
  - User may think position was closed, when in reality it was just a freshness flicker
  - No audit trail of these transient visibility changes

---

## 5. Regression surface

- **Behavior to preserve:**
  - Position list updates reflect actual position changes from MT5 EA, not cache artifacts
  - Stale positions are visually indicated (badge/warning) but remain in the list
  - Position entry price, current price, P&L calculations are accurate and do not drift
  - Positions do not disappear when they transition between freshness states
  - Position identity is stable across polls (same position should not re-render if data unchanged)

- **Existing guards:**
  - Backend `deterministic_key` prevents position duplicates in the database
  - Position `state` field tracks freshness (LIVE/STALE/UNAVAILABLE)
  - `WarningLine` component renders when position or snapshot is stale (lines ~104-108 of book page)
  - `FreshnessBadge` displays freshness state visually

- **Tests or audits:**
  - Phase 0 soak test harness includes position persistence checks (implied in `build_health_payload()` at smc-superfib-sniper.php)
  - No explicit regression test for position list identity across polls (currently absent)

---

## 6. Resolution path options

### Path A: Narrow fix — Implement Structural Sharing in React Query
**Scope:** Add `structuralSharing: true` to all polling queries in `useSniperData.ts`.

**Changes:**
- Line ~110: Add `structuralSharing: true` to `useSnapshot()` query config
- Line ~120: Add `structuralSharing: true` to `useUserTrades()` query config
- Line ~130+: Apply to `useLiveSignals()`, `useUserAccount()`, `useUserProgress()`, etc.

**Effect:**
- TanStack React Query will compare old vs new response structures
- If positions array content is identical, returns the old array reference
- React components will not re-render; no position flicker
- Minimal change; zero behavioral modification

**Risk:** Low. Structural sharing is a TanStack best practice and transparent to business logic.

### Path B: Medium fix — Add Client-Side Position Diffing
**Scope:** Implement custom diff logic in `useSniperData.ts` to track position changes between polls.

**Changes:**
- Add a `useRef()` to cache the previous positions array
- In `useUserTrades()` query `select()` callback, compute diff (added/removed/modified)
- Return only changed positions; preserve old reference for unchanged data
- Optionally emit a custom event or hook for animation on add/remove

**Effect:**
- Position list maintains referential stability when data is unchanged
- Newly added/removed positions can trigger targeted animations
- More control over position lifecycle (fade-in/fade-out, etc.)
- Enables tracking which positions actually changed for audit/diagnostics

**Risk:** Medium. Requires new state management; could introduce subtle diff bugs.

### Path C: Broader fix — Implement Optimistic Position Caching
**Scope:** Add a local cache layer that persists position data across polls and deduplicates based on `deterministic_key`.

**Changes:**
- Add a custom hook `usePositionCache()` that maintains a Map<deterministic_key, Position>
- On each poll, merge new positions into the cache (upsert by key)
- Return de-duped list; re-use position objects when data is unchanged
- Add a cleanup routine to remove positions that disappeared (closed/swept)

**Effect:**
- Position list reference stability even across backend cache invalidation
- Positions retain visual state across rapid re-renders
- Can implement fade-out animation for positions marked "closed"
- Positions that flicker between visible/invisible can be tracked and logged

**Risk:** Higher. Requires careful state management to avoid cache getting out of sync with backend.

### Recommended
**Path A.** The narrow fix is the highest-impact-to-effort ratio. Structural sharing in React Query is designed exactly for this use case: preventing re-renders when underlying data is unchanged. This requires only 3-4 lines added to query configs and is a known best practice. It directly addresses the volatility of array references between polls.

**If Path A does not fully resolve:** escalate to Path B to add explicit diffing for additional control over position lifecycle.

---

## 7. Risk flags

- **High-risk system involved:** Yes. Position data is the core of the Active Book feature; flickers erode user trust in data accuracy
- **Requires parity re-validation:** Yes. Position list changes should be validated against backend state; ensure no valid positions are hidden by cache bugs
- **Migration-blocking:** No. This is a Phase 0 stabilization issue, not a migration gate
- **Human review required before merge:** Yes. A reviewer should verify:
  1. Structural sharing is enabled on all polling queries (no queries missed)
  2. Test harness includes a flicker-detection check (position list should not unmount/remount on data-unchanged polls)
  3. Stale position visibility is preserved (stale positions still render, not hidden)

---

## 8. Handoff package

### Epicentre files to inspect first
- `src/hooks/useSniperData.ts` — polling query config
- `src/routes/-book.page.tsx` — book page rendering and position grouping logic
- `src/lib/api/sniperClient.ts` — position normalization and response handling
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — backend position telemetry flow

### Inputs Codex must verify before planning
1. Does TanStack React Query version support `structuralSharing`? (v5+ yes; v4 partial)
2. Are there other polling queries in the dashboard that exhibit similar flicker? (search for `refetchInterval`)
3. Is position `id` field stable across backend updates, or can it change? (check backend deterministic_key logic)
4. What is the current behavior when positions transition between `live` → `stale` → `live`? (trace state changes in test runs)
5. Is there a test harness that validates position list identity across polls?

### Open unknowns
1. Does the backend sometimes return duplicate positions in the same poll response?
2. Are there race conditions where a position is added and then immediately removed across consecutive polls?
3. Does the market authority switching (MT5 → Twelve Data) cause query cache invalidation?
4. How long does it typically take for a position state to transition from LIVE → STALE in production?
5. Are there existing bug reports or telemetry data about position flicker frequency and triggers?
