# SMC SuperFIB — Active Book Stream Flicker: Implementation Contract

**Target artifact:** `reports/codex-plan.md`
**Issue:** SMC Intake — Active Book stream flicker and position/book persistence gaps between polls/refreshes
**Date:** 2026-05-27
**Phase:** Phase 0 stabilization

---

## 1. Issue validation

### Confirmed

- **Endpoints are structurally separate.** `useSniperData.ts` issues two independent queries — `useSnapshot()` (→ `/snapshot`) and `useUserTrades()` (→ `/positions` / `/orders`) — with no coordinated merge layer. Independently cached, independently normalized. This is proven by code structure in `src/hooks/useSniperData.ts` and `src/lib/api/sniperClient.ts`.
- **Active Book rendering mixes both signals for visibility gating.** `src/routes/-book.page.tsx` derives positions from `useUserTrades()` but gates group visibility and staleness decoration on `snap?.prices.find(...)`. A symbol present in trades but transiently absent from the snapshot response causes the group to be suppressed or marked stale and then restored on the next poll cycle. This is confirmed by code structure.
- **Watchlist invalidation sequence creates transient empty states.** The existing `alignWatchlist` / `invalidateWatchlistQueries` flow cancels queries, calls `setQueryData`, then invalidates and refetches. During the gap between invalidation and the next successful fetch, canonical data is briefly absent or replaced with an empty intermediate state. The inline comment "Account chip to flicker off and back on" confirms this is a known, pre-existing symptom.
- **`cacheBust: true` on every GET.** Both `sniperClient.ts` and `sdk/src/client/SniperClient.ts` send cache-busting query params, meaning no client-side cache prevents the gap between two asynchronous fetches from being visible.

### Likely

- **Backend `/snapshot` response set is sparse relative to `/positions` for recently updated symbols.** If the backend snapshot producer does not guarantee that every symbol currently present in `/positions` is always present in the concurrent `/snapshot` response (e.g. under load, or due to different update cadences), the race window exists on every poll cycle.
- **Query cancellation timing amplifies visible gaps.** Rapid poll cycles or user-triggered mutations may cancel an in-flight `/snapshot` fetch, leaving the UI with stale or absent snapshot data while `/positions` data is current, widening the flicker window.

### Unconfirmed

- Whether the backend deliberately prunes `/snapshot` symbol lists under load (this is the key unknown that determines whether Path A is sufficient or whether a backend contract change is also required).
- Whether concurrent watchlist mutations from other UI components race against the poll cycle and corrupt the query cache independently.
- Whether `useStreamingTicks.ts` sub-tick desynchronization interacts with snapshot staleness checks to produce secondary flicker in numeric display after positions are visible.

**Corrected root cause statement:** The Active Book renders positions gated on snapshot membership. Because the two endpoints are polled independently with no coordinated merge, the snapshot response set and the positions response set are transiently inconsistent. When the snapshot does not include a symbol that the positions endpoint does, the UI hides or marks stale that symbol until the next successful snapshot poll that includes it. This is not a streaming issue — it is a dual-endpoint gate applied to a single rendering decision.

---

## 2. Implementation contract

### File 1: `src/routes/-book.page.tsx`

- **Section to modify:** The conditional logic that gates Active Book group visibility or position rendering on snapshot membership — specifically any expression of the form `snap?.prices.find(p => p.symbol === position.symbol)` (or equivalent) used as a show/hide or staleness-gate condition for position groups.
- **Exact change required:** Decouple position group visibility from snapshot membership. A position returned by `useUserTrades()` must always render in the Active Book regardless of whether the concurrent snapshot response contains that symbol. Snapshot data (`snap?.prices.find(...)`) must only be used for price decoration (last price, freshness badge colour, stale warning) — never for the show/hide gate of the group itself.
- **Guard rails:**
  - Do not change the staleness badge or `FreshnessBadge` logic — these are decoration only and can remain gated on snapshot presence.
  - Do not change the stale warning overlay — it is informational and must still fire when snapshot data is absent for a symbol.
  - Do not alter the data source for positions: `useUserTrades()` remains the sole authority.
  - Do not alter polling intervals, refetch triggers, or query keys.
  - Do not touch any chart, chart-derived, or numeric threshold components on this page.
- **Why this file is in scope:** This is the rendering site where the dual-endpoint gate produces the visible flicker. It is the minimal change surface.
- **Acceptance criterion:** A symbol present in `useUserTrades()` data must remain visible in the Active Book across the full poll cycle (snapshot absent → snapshot present) without disappearing or flickering. The staleness badge may show "stale" during the snapshot-absent window — that is correct behaviour.

---

### File 2: `src/hooks/useSniperData.ts`

- **Section to modify:** The `alignWatchlist` / `invalidateWatchlistQueries` mutation sequence — specifically the `cancelQueries` → `setQueryData` → `invalidateQueries` → `refetchQueries` ordering around the user-trades query key.
- **Exact change required:** When the watchlist mutation sequence invalidates user-trades queries, ensure `setQueryData` is called with the existing cached data (preserving prior positions) before the invalidation triggers a background refetch. Do not call `setQueryData` with an empty or partial state. The goal is that the query cache always contains the last-known-good positions list until a successful refetch replaces it — never an empty intermediate.
  - Specifically: if `cancelQueries` is called before `setQueryData`, confirm that `setQueryData` receives the previous cache value (from `queryClient.getQueryData`) not an empty array or undefined. If the current code sets an empty or undefined intermediate value, change it to set the previous value.
- **Guard rails:**
  - Do not change the `user-settings` query invalidation behaviour — the research report explicitly calls out that weakening the watchlist mutation guards risks overwriting freshly-updated watchlist state.
  - Do not change the `useSnapshot` query invalidation ordering.
  - Do not alter query keys, stale times, or refetch-on-window-focus settings.
  - Do not alter the `alignWatchlist` function's external API or return signature.
- **Why this file is in scope:** The existing inline comment "Account chip to flicker off and back on" confirms the mutation sequence is a known flicker contributor. The cancel→set→invalidate pattern, if setting an empty intermediate, produces a guaranteed visible gap independent of backend behaviour.
- **Acceptance criterion:** After a watchlist mutation, the Active Book must not show a blank or reduced position list between the cancel and the subsequent successful refetch. The previous position list must remain rendered (possibly with a stale overlay) until the new data arrives.

---

### File 3: `src/lib/api/sniperClient.ts` — READ ONLY, no change

- **Verification only:** Confirm that `cacheBust: true` is applied consistently to both `/snapshot` and `/user/trades` GETs. No change to be made. Document whether removing `cacheBust` on `/snapshot` would be safe — this is a question for the backend team, not a code change in this patch.
- **Guard rails:** No edits to this file in this patch.
- **Why listed:** The implementation agent must read this file to confirm the cache-bust behaviour before touching the rendering gate, since cache-bust affects how quickly stale snapshot data is replaced.

---

### File 4: `sdk/src/client/SniperClient.ts` — READ ONLY, no change

- **Verification only:** Confirm the `/snapshot` and `/positions` endpoint paths and response shapes. No code change.
- **Guard rails:** No edits to this file in this patch.

---

## 3. Patch sequence

1. **Read `src/lib/api/sniperClient.ts` and `sdk/src/client/SniperClient.ts`** — confirm endpoint paths, response shapes, and `cacheBust` behaviour. No edits.
2. **Read `src/hooks/useSniperData.ts`** — locate the exact `alignWatchlist` / `invalidateWatchlistQueries` sequence. Determine whether `setQueryData` is called with an empty or with the prior cached value.
3. **Patch `src/hooks/useSniperData.ts`** — fix the `setQueryData` intermediate state if it is empty or undefined. Preserve prior cache value across the cancel→invalidate gap.
4. **Read `src/routes/-book.page.tsx`** — locate every conditional that uses `snap?.prices.find(...)` or equivalent as a group-level show/hide gate.
5. **Patch `src/routes/-book.page.tsx`** — remove snapshot membership from the group visibility gate. Retain snapshot use for price/freshness decoration only.
6. **Run existing tests** — `src/hooks/useSniperData.test.tsx` must still pass.
7. **Build check** — `npm run build` must succeed.

**Dependencies:**
- Step 3 must complete before step 5 to avoid over-patching the rendering layer for a problem already solved in the hook.
- Steps 1–2 are prerequisite reads; steps 3 and 5 are independent patches but must be verified together in a combined test pass.

**Sequencing risk:** If the `setQueryData` fix (step 3) is committed separately from the rendering gate fix (step 5), an intermediate commit will exist where the hook preserves state but the page still flickers. These two changes should be in a single commit or the page fix should be committed first so no intermediate state is worse than the current baseline.

---

## 4. Regression guards

**Checks the implementation agent must run:**

- `npm run build` — must exit 0, no type errors.
- `npm test -- src/hooks/useSniperData.test.tsx` (or equivalent) — all existing polling and refresh cadence assertions must pass.
- Manual: load the Active Book with at least two active positions. Wait through 3–5 full poll cycles. No position group should disappear and reappear.
- Manual: trigger a watchlist mutation (add or remove a symbol). Verify the Active Book does not blank out or show fewer positions during the refetch gap.
- Manual: verify the `FreshnessBadge` and stale warning still appear correctly when the snapshot does not include a symbol.
- Manual: verify that position groups that have genuinely closed (removed from `/positions`) do disappear — the fix must not make the book show ghost positions.

**Existing protections that must still hold:**

- Stale data warnings and `FreshnessBadge` must still fire when snapshot data is absent or expired for a symbol.
- The `user-settings` query must not be invalidated or refetched as a side-effect of this patch.
- `cacheBust: true` on GETs must remain unchanged (no silent removal).
- Snapshot data must remain read-only decoration — it must not become a write target or mutation trigger.

**Parity re-validations:**

- After patching, confirm that the Active Book position list matches the MT5 EA's open positions (via the backend `/positions` endpoint) in a live session. Snapshot-absent symbols must not appear as phantom positions.
- Backend authority check: positions shown in the Active Book must originate exclusively from `useUserTrades()` → `/positions`. No position must be synthesised from snapshot data alone.

**Logging / diagnostics that should exist after the patch:**

- If a position's symbol is absent from the snapshot response, a `console.debug` or structured log entry should emit: `[book] symbol <X> missing from snapshot, rendering with stale decoration`. This makes future flicker investigation faster. (One log line only — no verbose per-tick logging.)

---

## 5. Non-goals

- **Do not unify the `/snapshot` and `/positions` endpoints (Path B).** That is a backend architectural change outside this patch's scope and requires a separate backend contract negotiation and plan.
- **Do not introduce a WebSocket or SSE stream.** The research report lists this as a longer-term option. It is not in scope for Phase 0.
- **Do not alter `useStreamingTicks.ts`.** The sub-tick animation layer is a separate mitigation for numeric display smoothing. It does not cause position group flicker and must not be touched.
- **Do not change poll intervals, stale times, or `refetchOnWindowFocus` settings.** These are existing contract parameters.
- **Do not change the MT5 EA, PHP backend, or any server-side code.** This patch is frontend-only.
- **Do not clean up unrelated code in `useSniperData.ts` or `-book.page.tsx`.** No opportunistic refactoring.
- **Do not add new API fields or change the response schema for `/snapshot` or `/positions`.**
- **Do not remove `cacheBust: true`** — that is a separate backend caching conversation.
- **Do not touch Pine scripts.** No parity issue with Pine has been confirmed.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If the rendering gate change is made incorrectly (e.g. snapshot data is removed from all decoration, not just the visibility gate), the Active Book would show positions with no price data, no freshness indicators, and no stale warnings — users would see open positions but not know whether the prices are current. This would be a user-visible degradation in signal quality.

If the `setQueryData` fix is applied incorrectly (e.g. the previous cache value is retrieved after `cancelQueries` has already cleared it), the fix would have no effect and the flicker would persist.

**User-visible failure mode:**

A symbol's position group disappears for 1–3 poll cycles (typically 10–30 seconds depending on poll interval) and then reappears. The user may interpret this as the position having been closed. This directly affects trading decisions.

**Backend authority risks:**

- Path A (this patch) preserves backend authority: positions come exclusively from `/positions`. No risk of frontend synthesising phantom positions.
- If the backend deliberately omits a symbol from `/positions` (e.g. position closed), the fix must not prevent that removal from propagating. The acceptance criterion explicitly requires that genuinely closed positions still disappear.

**Stale-state risk:**

The `setQueryData` preservation change (step 3) holds prior positions in cache longer. If a position closes between two poll cycles and the cached data is the pre-close snapshot, the position will remain visible until the next successful `/positions` fetch. This is acceptable — it narrows the flicker window without creating ghost positions, since the next successful fetch will remove the closed position.

**Human approval required before merge:** Yes. A reviewer must confirm:

1. That holding prior `useUserTrades()` cache data during the mutation gap does not violate the backend's intended staleness contract.
2. That the backend does not use `/snapshot` omission as an intentional signal to hide a position in the UI (if it does, Path A is wrong and this plan must be revised).

---

## 7. Test requirements

**Tests to add:**

- `src/hooks/useSniperData.test.tsx` — add a test case: when `useUserTrades()` returns a position for symbol X but `useSnapshot()` returns a response that omits symbol X, the hook must still expose symbol X in its output without marking it as hidden. This tests the cache-preservation behaviour during the refetch gap.
- `src/routes/-book.page.tsx` (or a corresponding component test if one exists) — add a render test: given a trades list with symbol X and a snapshot that does not include symbol X, the Active Book must render a group for symbol X with a stale decoration but must not hide or unmount the group.

**Existing tests that must still pass:**

- All existing tests in `src/hooks/useSniperData.test.tsx` — particularly any assertions about poll cadence, canonical settings behaviour, and query invalidation ordering.
- Any existing render tests for `-book.page.tsx` or `src/components/sniper/*` components.
- `npm run build` type-check must pass with zero errors.
- `npm run check:mql` must still pass (unrelated, but must not be broken by any accidental file touch).

**Soak / live-environment verification:**

- After deploying, monitor the Active Book across a minimum of one full trading session with at least 3 active positions. Watch for any remaining flicker events.
- Confirm via browser network tab that `/snapshot` and `/positions` poll responses arrive within expected intervals and that no request is left in a permanently-cancelled state after a watchlist mutation.
- Parity check: Active Book position count must match MT5 terminal open position count at least once per minute during the soak session.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`fix/active-book-flicker-phase0`

**Suggested commit grouping:**

- Commit 1: `fix(book): preserve user-trades cache during watchlist mutation refetch gap` — changes to `src/hooks/useSniperData.ts` only.
- Commit 2: `fix(book): decouple position group visibility from snapshot membership` — changes to `src/routes/-book.page.tsx` only.
- Commit 3: `test(book): add snapshot-absent position rendering assertions` — new/updated tests only.

Do not combine commits 1 and 2. Each must be reviewable independently so the reviewer can confirm that the rendering gate change is not hiding a hook-layer problem that should have been fixed there.

**Required reports or artifacts after implementation:**

- `reports/codex-implementation-report.md` — must include: files changed, exact lines modified, test results (pass/fail), build result, and the answer to the open unknown: "Was `setQueryData` calling with an empty intermediate value? (yes/no, with line reference)."
- Update `reports/codex-plan.md` status to `IMPLEMENTATION_COMPLETE` in the pipeline state.

**State transition required after plan handoff:**

`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
