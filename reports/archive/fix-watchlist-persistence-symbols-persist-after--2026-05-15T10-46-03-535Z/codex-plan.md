# SMC SuperFIB - Hardened Implementation Contract

## 1. Issue validation

**Reported root cause:** Stale `user-settings` cache overwrites correct mutation result on remount or cache expiry, causing removed symbols to reappear.

### Confirmed
- `useWatchlistAdd` and `useWatchlistRemove` in `useSniperData.ts` call `writeCanonicalWatchlist` in `onSuccess` to update `["user-settings"]` query data directly — but do **not** call `queryClient.invalidateQueries({ queryKey: ["user-settings"] })`. The omission is intentional and documented in the source with a flicker-prevention comment.
- `useUserSettings` carries `staleTime: 30_000`. During the 30-second window, React Query will not refetch unless explicitly invalidated. After the window, a background refetch can overwrite the `setQueryData` result if the backend has not yet reflected the mutation.
- `account.tsx` renders watchlist via `useCanonicalWatchlist`, which derives exclusively from `useUserSettings` data. Any stale refetch contaminates the rendered list.
- `syncDraftWatchlistFromCache` in `account.tsx` propagates the cache value into local draft state. If the cache is stale at sync time, the draft perpetuates the error.

### Likely
- The "ghost reappearance" symptom (AUDCAD / EURJPY returning after removal) is most likely triggered by a component remount — navigation away from `/account` causes query garbage collection; navigation back triggers a fresh `useUserSettings` fetch; if the 30-second `staleTime` has not expired and the previous `setQueryData` result was evicted by GC, or if it expired and refetch lands before the backend has committed, the removed symbol reappears.

### Unconfirmed
- **Replacement symptom** (removed AUDCAD shows EURJPY instead): Not explained by stale-cache alone. Possible causes include `alignWatchlistItems` reordering, a race between a concurrent add and remove mutation, or a normalization defect in `writeCanonicalWatchlist`. The research report does not confirm this sub-pattern. It must be reproduced and traced separately; the current patch does not address it and must not speculatively target it.
- Backend lag timing: The research states backend lag "may" cause overwrite but provides no measured latency. The confirmed mutation response path (`onSuccess` receives the mutation result, not a GET) means the backend has accepted the change by the time `writeCanonicalWatchlist` runs. True lag risk is on the subsequent background GET, not the mutation response.

### Corrected root cause (tightened)
The correct state written by `writeCanonicalWatchlist` in `onSuccess` is authoritative at write time. The failure window opens when the `["user-settings"]` query is subsequently refetched — either because GC evicted the entry during navigation or because the 30-second stale window expired and an unrelated invalidation or background refetch fired — and that refetch returns data that does not yet reflect the backend's committed state. The fix is to force an invalidation immediately after `writeCanonicalWatchlist` so that the background refetch races against confirmed backend state, not against the lagging pre-mutation state.

---

## 2. Implementation contract

### File 1: `src/hooks/useSniperData.ts`

**Scope:** Mutation handlers for `useWatchlistRemove` and `useWatchlistAdd`.

**Exact location:** The `onSuccess` callback of each mutation, immediately after the call to `writeCanonicalWatchlist`.

**Exact change required:**

In `useWatchlistRemove.onSuccess` — after `writeCanonicalWatchlist(queryClient, mutationResult)` (or equivalent call), add:
```
queryClient.invalidateQueries({ queryKey: ["user-settings"] });
```

In `useWatchlistAdd.onSuccess` — same placement, same line.

**Order within onSuccess:** `writeCanonicalWatchlist` must fire **before** `invalidateQueries`. The `setQueryData` call inside `writeCanonicalWatchlist` ensures the cache already holds the correct value when the background refetch is scheduled. React Query will then confirm or reconcile — it will not flash the old value because the cache is pre-seeded.

**Guard rails — must not change:**
- `onMutate` optimistic update logic must remain untouched.
- `onError` rollback path must remain untouched.
- `staleTime: 30_000` on `useUserSettings` must not be removed or reduced. That setting controls unrelated query behaviour across the app.
- `writeCanonicalWatchlist` internals must not be modified.
- No other query keys may be added to the invalidation call.
- `invalidateWatchlistQueries` helper (if it exists as a separate utility) must not be redirected to `user-settings` globally — scope the invalidation to these two `onSuccess` handlers only.

**Why this file is in scope:** It owns both mutation lifecycles. It is the only layer that can authoritatively sequence the `setQueryData` + `invalidate` pattern.

**Acceptance criterion:** After `useWatchlistRemove` fires and `onSuccess` completes: (a) `getQueryData(["user-settings"])` does not contain the removed symbol; (b) a background refetch is scheduled; (c) after the refetch resolves, `getQueryData(["user-settings"])` still does not contain the removed symbol; (d) navigating away from and back to `/account` does not restore the removed symbol.

---

### File 2: `src/routes/account.tsx`

**Scope:** `syncDraftWatchlistFromCache` call site only.

**Exact location:** The point where `syncDraftWatchlistFromCache` is invoked in response to a watchlist mutation completing (likely inside a `useEffect` or mutation callback that watches `useCanonicalWatchlist`).

**Exact change required:** No code change required **unless** inspection confirms that `syncDraftWatchlistFromCache` reads from `queryClient.getQueryData(["user-settings"])` directly rather than reading from the already-normalised `useCanonicalWatchlist` return value. If it reads the raw query cache directly, the sync must be deferred until the `invalidateQueries` refetch settles (i.e., gated on `isSuccess && !isFetching` from `useUserSettings`). If it reads from `useCanonicalWatchlist` (which is derived reactively), no change is needed — the reactive chain will propagate the update automatically.

**Guard rails — must not change:**
- The watchlist display rendering path using `useCanonicalWatchlist` must remain the single source of truth for displayed symbols.
- No local draft state should be promoted to canonical truth.

**Why this file is conditionally in scope:** The research identifies `syncDraftWatchlistFromCache` as a propagation vector. If it bypasses the reactive chain and reads the cache at a moment when the invalidation refetch is in flight, it could perpetuate stale symbols in the draft. Verification is required before concluding no change is needed.

**Acceptance criterion:** After removal, the draft watchlist shown in the edit UI matches `useCanonicalWatchlist` output and does not contain the removed symbol, including immediately after remount.

---

## 3. Patch sequence

1. **Read and confirm** the `onSuccess` handler body in `useWatchlistRemove` and `useWatchlistAdd` in `useSniperData.ts`. Confirm that `writeCanonicalWatchlist` is called before any `return` or early exit.
2. **Read and confirm** `syncDraftWatchlistFromCache` in `account.tsx`. Determine whether it reads from raw query cache or from the reactive `useCanonicalWatchlist` hook.
3. **Apply** the `invalidateQueries` addition to `useWatchlistRemove.onSuccess` in `useSniperData.ts`.
4. **Apply** the `invalidateQueries` addition to `useWatchlistAdd.onSuccess` in `useSniperData.ts`.
5. **Conditionally apply** the `account.tsx` guard if step 2 confirms the direct cache read path.
6. **Do not** touch `writeCanonicalWatchlist`, `invalidateWatchlistQueries`, or any other query invalidation utilities until steps 1–5 are complete and verified.

**Sequencing risk:** Steps 3 and 4 are independent and may be applied in either order. Step 5 depends on the finding from step 2. There are no migration, schema, or backend contract sequencing risks. No cache warm-up or state pre-seeding is required.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

- Remove a symbol from the watchlist. Immediately verify it is absent in `useCanonicalWatchlist`. Navigate to another route and back. Verify the symbol is still absent.
- Remove a symbol. Wait 35 seconds (past `staleTime`). Verify the symbol does not reappear.
- Add a symbol. Verify it appears immediately. Remove it. Verify it disappears. Confirm the add/remove round-trip leaves no ghost.
- Confirm that the `onError` rollback path still correctly reverts an optimistic removal when the mutation fails (introduce a network failure in dev tools).
- Confirm that `useWatchlistAdd.onError` still reverts an incorrect add.
- Confirm that no other queries (signals, snapshots, engine-health) trigger extra refetches as a side-effect of this change.

**Existing protections that must still hold:**
- Optimistic update in `onMutate` must still apply immediately on mutation start.
- `onError` rollback must still restore the pre-mutation cache state.
- `invalidateWatchlistQueries` must still invalidate its existing targets; the new `user-settings` invalidation must not replace or conflict with it.
- `filterItemsByWatchlist` and `alignWatchlistItems` must continue to receive canonical watchlist data — their inputs are not changed.

**Parity re-validations:** None required. This patch does not touch Pine, MT5, or backend. Backend authority is unchanged — the mutation response remains the source of truth; invalidation only schedules a background GET to confirm what the backend already committed.

**Logging / diagnostics that should exist after the patch:** No new logging is required. The existing React Query devtools will confirm that `["user-settings"]` transitions to `invalidated → fetching → fresh` after each mutation success, which is sufficient for diagnostic confirmation.

---

## 5. Non-goals

- **Removing `staleTime` from `useUserSettings`.** Out of scope. Reducing stale time increases API load and is not the minimum safe fix.
- **Modifying `writeCanonicalWatchlist`.** Out of scope. It is correct as written.
- **Addressing the "symbol replacement" symptom** (removed AUDCAD shows EURJPY). Not confirmed as the same root cause. Must not be speculatively folded into this patch.
- **Adding frontend cache invalidation tests.** Out of scope for this patch. The research identifies their absence; that gap should be closed in a separate task.
- **Modifying `invalidateWatchlistQueries`** to globally include `user-settings`. Dangerous over-invalidation. Scope must remain at the two `onSuccess` handlers only.
- **Changing backend watchlist API contracts or PHP validation logic.**
- **Touching signal or snapshot query paths.**
- **Restructuring `account.tsx` watchlist rendering beyond the conditional `syncDraftWatchlistFromCache` guard.**
- **Debouncing or batching mutations.** Not related to the confirmed failure path.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:** If `invalidateQueries` is called *before* `writeCanonicalWatchlist` inside `onSuccess`, the background refetch may complete before the `setQueryData` call, resulting in the stale value being written after the fresh value — the exact failure this patch is meant to prevent. Order of operations within `onSuccess` is therefore the critical correctness constraint.

**User-visible failure mode:** If the backend does lag and the refetch returns pre-mutation state before the backend commits, a brief flicker (symbol reappears then disappears) is possible. The research acknowledges this. Given that `onSuccess` guarantees the backend accepted the mutation, this window is expected to be milliseconds and acceptable. If flicker is observed in testing, the finding must be escalated rather than suppressed with additional `setQueryData` calls.

**Backend authority or stale-state risks:** None introduced. Backend remains the committed source of truth. This patch only schedules a background GET to confirm that committed state; it does not change what the backend stores or how mutations are constructed.

**Whether human approval should be required before merge:** No. The patch is narrow, reversible, and does not affect trading signal generation, Pine scripts, MT5, or backend logic. Standard PR review is sufficient.

---

## 7. Test requirements

**Tests to add:**

- `useSniperData.test.ts` (or equivalent): After `useWatchlistRemove` resolves successfully, assert that `queryClient.invalidateQueries` was called with `{ queryKey: ["user-settings"] }`. Mirror for `useWatchlistAdd`.
- Integration or MSW-based test: Simulate a `useWatchlistRemove` mutation followed by a component remount (unmount + mount of the consumer of `useCanonicalWatchlist`). Assert the removed symbol is absent after remount even when the mocked GET response lags by 500ms.

**Existing tests that must still pass:**

- All existing `useSniperData` mutation tests (optimistic update applied, onError rollback fires, query cache updated on success).
- `test-watchlist-snapshot-regression.php` — backend validation unaffected; must still pass without modification.
- Any existing `account.tsx` rendering or snapshot tests.

**Soak / parity / live-environment verification:**

- No Pine parity re-validation required.
- No MT5 parity re-validation required.
- Manual soak: perform add/remove cycles on a staging environment with network throttling (slow 3G in devtools) to confirm the flicker risk is acceptable in degraded network conditions.

---

## 8. Implementation handoff

**Branch naming recommendation:** `fix/watchlist-persistence-stale-cache`

**Suggested commit grouping:**

- Commit 1: `fix(watchlist): invalidate user-settings after remove mutation onSuccess` — `useSniperData.ts` change for `useWatchlistRemove` only.
- Commit 2: `fix(watchlist): invalidate user-settings after add mutation onSuccess` — `useSniperData.ts` change for `useWatchlistAdd` only.
- Commit 3 (conditional): `fix(watchlist): defer syncDraftWatchlistFromCache until refetch settles` — `account.tsx` change, only if the direct cache read path is confirmed in step 2 of the patch sequence.
- Commit 4: `test(watchlist): assert user-settings invalidation fires after mutation success` — new tests.

**Required reports or artifacts after implementation:**

- Confirm React Query devtools trace showing `["user-settings"]` invalidation fires after each mutation in staging.
- Confirm manual soak result: symbol removed, navigated away, navigated back — symbol absent.
- Confirm `onError` rollback still functions under simulated network failure.

**State transition:** `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
