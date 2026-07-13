# SMC SuperFIB - Issue Research Report

**Issue:** SMC Intake - Fix flicker and pending persistence · PATCH

---

## 1. Issue classification

- Severity: HIGH
- Category: runtime-bug / stale-data
- Layer(s) affected: Dashboard-JS / React Query
- Phase impact: Phase 6+ (dashboard stability)

---

## 2. Confirmed evidence

### Issue 1 — C/ARMED cards not persisting in top 3
- **Source file:** [src/routes/-plan.page.tsx](src/routes/-plan.page.tsx#L70-L93)
- **Confirmed behavior:**
  - Line 78–81: `const laddersBySignalId = new Map((ladders ?? []).map((ladder) => [ladder.signalId, ladder]));`
  - Line 82–91: Candidate pool built by mapping `uniqueSignals` and looking up each signal's `id` in `laddersBySignalId`
  - When lookup fails (signal ID mismatch), `candidatePlan = null` and `hasPlan: false`
  - Line 33: Sort comparator ranks candidates with `hasPlan: false` last
  - Line 97: `const topCandidates = rankedWatchlistCandidates.slice(0, 3);` — only top 3 render
  - Result: Missing `hasPlan` causes ranking to bottom → falls out of top-3 slice

- **Root cause: Signal ID churn between polls**
  - [src/types/sniper.ts](src/types/sniper.ts#L161-L180): `SignalCandidate.id` is backend-derived
  - Issue description states: signal ID is derived from `$signal_anchor` (last candle timestamp)
  - New candle = new `$signal_anchor` = new signal ID hash
  - Meanwhile, `ladders` query still maps to old signal ID → lookup fails
  - Both queries poll independently (~2 seconds), creating the window for mismatch

### Issue 2 — Flicker/churn on every poll interval
- **Source file:** [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts#L112-L127) (useLiveSignals)
- **Confirmed configuration:**
  - Line 112–127: `useLiveSignals()` with `staleTime: 0` and `structuralSharing: false`
  - Line 503–513: `useLadders()` with NO `staleTime` and NO `placeholderData`
  - Both queries have independent `refetchInterval: enabled ? pollMs : false` (line 124, 510)
  - `DEFAULT_POLL_MS = 2_000` (line 7)

- **Observable behavior:**
  - On every 2-second poll cycle: React Query marks data stale → fires background fetch → momentarily returns `undefined` while in-flight
  - [src/routes/-plan.page.tsx](src/routes/-plan.page.tsx#L56-L63): Component receives `data: undefined` during refetch
  - Line 97: `const topCandidates = rankedWatchlistCandidates.slice(0, 3);` depends on `signals` and `ladders` data
  - When either is `undefined`, the candidate pool is empty → all ranks recalculate with `hasPlan: false` → render phase sees different top-3
  - User observes card position shifts, disappearances, then snap-back when new data resolves

- **Why two queries compound the problem:**
  - `useLiveSignals` and `useLadders` refetch on different intervals (same poll ms, but independent promise timings)
  - Signals can resolve while ladders are in-flight → component re-renders with partial data
  - During that gap: `laddersBySignalId` is empty → all candidates get `hasPlan: false` → ranks reset → cards shift

---

## 3. Root cause hypothesis

**Primary root cause (Confirmed):** React Query data continuity gap during background refetch

- **Why it happens:** Both `useLiveSignals` and `useLadders` queries return `undefined` to the component while a background fetch is in-flight, instead of keeping the last successful value displayed.
- **Why it was not caught earlier:** The previous bug sweep (2026-05-29) focused only on stale-data freshness (`staleTime: 0` added to `useLiveSignals`), not on UI continuity during refetch cycles. Setting `staleTime: 0` made the problem *worse* by forcing a refetch on every poll, making the `undefined` window recur with every tick.
- **Structural issue:** The sort comparator `compareRankedCandidates` depends on both `signals` and `ladders` being valid arrays. A partial data state (one present, one `undefined`) breaks the invariant.

**Secondary root cause (Confirmed):** Signal ID volatility across candle boundaries
- New candle = new signal anchor = new ID
- Ladder query was fetched with old signal ID before new candle; signal query returns new ID after candle
- Lookup in `laddersBySignalId` fails → candidate rank drops → candidate falls out of top-3 slice

---

## 4. Blast radius

### Files directly affected
- [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts) — `useLiveSignals()` (line 112) and `useLadders()` (line 503) need `placeholderData` option
- [src/routes/-plan.page.tsx](src/routes/-plan.page.tsx) — consuming page uses both queries; dependent logic assumes valid data

### Systems at risk
- **React Query cache/subscriber chain:** Both queries maintain independent subscribers; the refetch cycle causes two separate data transitions on every poll
- **Signal ranking engine:** Sort comparator assumes all candidates have deterministic `hasPlan` state; during refetch gap, state is non-deterministic
- **Blueprint card render chain:** Cards re-render when top-3 candidates change mid-sort due to `undefined` data state

### Parity surfaces at risk
- Pine ↔ Backend: Signal IDs are backend-derived; if Pine anchor changes independently, signals may diverge from ladders
- Backend ↔ Dashboard: No contractual guarantee that signal ID remains stable across a single poll cycle; assumption breaks at candle boundaries

### Stale-state and cache risks
- **High-risk:** If `placeholderData` is added without care, a very stale response could be displayed if the query errors; mitigation: only use `placeholderData` on background refetch (error during refetch should not display old data)
- **Known pattern:** `useStableUserTrades()` at line 172 in `useSniperData.ts` already implements a continuity pattern with `continuityRef.current`, suggesting precedent for keeping stale-good data during refetch

---

## 5. Regression surface

### Currently working behavior that could break
- **Query key consistency:** Both queries have fixed `queryKey` (line 113 `["live-signals"]`, line 506 `["ladders"]`); `placeholderData` must not change query key logic
- **Enabled state guard:** Both queries check `enabled = backendReady && pollMs !== null` (lines 115, 508); query must not fire while backend is unready
- **Manual invalidation on engine batch:** [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts#L518-L527) — `useEngineBatch()` explicitly invalidates both `["live-signals"]` and `["ladders"]` on success (lines 524, 527); `placeholderData` must not mask an explicit invalidation

### Existing guards and validation
- `structuralSharing: false` on `useLiveSignals` (line 121) — intentional choice to allow full re-renders; `placeholderData` must preserve this intent
- `staleTime: 0` on `useLiveSignals` (line 120) — intentional freshness enforcement; `placeholderData` does not change this
- Type-level guard at line 53: `function hasRenderablePlan(candidate: RankedCandidate): candidate is RenderableCandidate` — only renderable candidates are used; logic is sound but masked during `undefined` window

### Test coverage that must stay green
- [src/hooks/useSniperData.test.tsx](src/hooks/useSniperData.test.tsx) — regression coverage for query keys, `enabled` state, poll cadence (from 2026-05-29 bug sweep)
- [src/routes/-plan.page.test.tsx](src/routes/-plan.page.test.tsx#L128-L132) — mocks both hooks and validates ranking logic
- If `placeholderData` is added without test coverage, refetch cycle behavior will be untested

---

## 6. Resolution path options

### Path A: Add `placeholderData: (prev) => prev` to both queries (RECOMMENDED)
- **Narrowest correction surface:** Only modify React Query options on both hooks
- **Changes:**
  1. Add `placeholderData: (prev) => prev` to `useLiveSignals()` query config (line 112–127)
  2. Add `placeholderData: (prev) => prev` to `useLadders()` query config (line 503–513)
- **Outcome:** React Query holds last successful response during background refetch; component never sees `undefined`; UI remains stable between polls; sort never recalculates with partial data
- **Risk:** Low — React Query pattern is standard and well-tested
- **Why recommended:** Directly addresses the root cause (data continuity) without architectural changes; preserves existing invariant assumptions in the sort/render chain

### Path B: Add error boundary or fallback rendering
- **Broader surface:** Modify [src/routes/-plan.page.tsx](src/routes/-plan.page.tsx) to handle `undefined` data explicitly
- **Approach:** Add conditional rendering or skip sort if either query is loading
- **Outcome:** Prevents rank recalculation during partial data states
- **Risk:** Higher — introduces branching logic into the component; may mask data fetch errors; adds test coverage burden
- **Reason not recommended:** Does not fix the underlying data continuity issue; only masks symptoms

### Path C: Synchronize refetch intervals
- **Approach:** Coordinate `useLiveSignals` and `useLadders` to refetch together
- **Outcome:** Reduces the window where one query is in-flight while the other is not
- **Risk:** High — adds cross-query dependencies; complex to implement without introducing race conditions; may break independent polling semantics
- **Reason not recommended:** Addresses a secondary concern (query timing), not the primary issue (data continuity during single query refetch)

**RECOMMENDED: Path A**

---

## 7. Risk flags

- **High-risk system involved:** Yes
  - React Query is the primary data synchronization layer for the entire dashboard
  - Flicker directly impacts user experience; C-grade signals disappearing impacts trade signal capture
  - Signal-to-ladder linkage is part of the backend authority chain

- **Requires parity re-validation:** No (initially)
  - Signal ID derivation is backend-controlled; backend authority is preserved
  - Ladder query results are unchanged; only the *timing* of display changes
  - Spot-check after fix: verify no signals are rendered with stale ladders after a candle close

- **Migration-blocking:** No
  - Issue is frontend-only; does not affect MT5 EA, PHP backend, or data contracts
  - Phase 6 dashboard testing should catch and validate the fix

- **Human review required before merge:** Yes
  - Data continuity patterns require careful review; subtle timing bugs can appear under network throttling
  - Acceptance test: manually observe the plan page for 5+ poll cycles (10+ seconds) with network throttling (slow 3G) to confirm no flicker or card disappearance

---

## 8. Handoff package

### Epicentre files to inspect first
1. [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts#L112-L127) — `useLiveSignals()` query config
2. [src/hooks/useSniperData.ts](src/hooks/useSniperData.ts#L503-L513) — `useLadders()` query config
3. [src/routes/-plan.page.tsx](src/routes/-plan.page.tsx#L56-L97) — ranking and top-3 logic

### Inputs Codex must verify before planning
1. Confirm that `placeholderData: (prev) => prev` is the idiomatic React Query pattern for this use case (vs. other options like `keepPreviousData` from older RQ versions)
2. Verify that no other queries in the codebase use `placeholderData` to establish a pattern match
3. Confirm that network error during refetch should *not* display the placeholder (i.e., placeholder should only apply to successful background refetch, not to error states)
4. Check if test mocks in [src/routes/-plan.page.test.tsx](src/routes/-plan.page.test.tsx#L128-L132) need updating to cover the refetch cycle with placeholder behavior

### Open unknowns
1. **Signal ID stability:** Is the `$signal_anchor` expected to change every candle, or only under certain conditions? If it's always changing, the signal ID itself is volatile by design and may not be a suitable join key with the ladder query. (Likely acceptable if ladder query is also polled at candle frequency, but should be confirmed.)
2. **Backend ladders latency:** Does the `/ladders` endpoint have latency that would cause a stale signal ID mismatch? I.e., is the signal returned at time `T1`, but the ladder not available until time `T2 > T1` (after a new candle)?
3. **Network conditions:** Under slow network, the refetch gap could be seconds rather than milliseconds; is the placeholder behavior acceptable in a 3G throttle scenario?
