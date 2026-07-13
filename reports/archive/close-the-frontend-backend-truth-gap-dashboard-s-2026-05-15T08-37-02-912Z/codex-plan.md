# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

### Confirmed

**Root cause: React Query staleTime (10 s default) allows the dashboard to serve a cached health response after the backend has already transitioned feedStatus.**

Evidence chain:
- `.github/migration-status.md` explicitly documents "backend health reports live while UI still renders stale" — this is a user-visible symptom, not a hypothesis.
- Soak logs in the PHP backend (`[PHASE0_SOAK] Final feed status: ... RESULT=stale`) confirm the backend is computing and emitting feedStatus transitions correctly and continuously.
- Both `src/routes/admin.tsx` (L570–600) and `src/routes/signals.tsx` (L60–90) use the identical fallback `feedStatus ?? priceFeed`, which means neither component has a local override or secondary source. Both components faithfully render whatever the React Query cache holds.
- `src/router.tsx` sets a global `staleTime: 10_000` ms. The `engine-health` query inherits this unless explicitly overridden. A 10 s staleness window is architecturally incompatible with a system that transitions feedStatus on sub-10-second boundaries (batch_age=3 s observed in soak logs).
- Poll interval is 2 s, but React Query does not re-render from a refetch result if the cached value is still within staleTime. The poll fires but React Query may return the cached value without triggering a re-render.

### Likely

**Secondary: The `engine-health` query key may not be included in the watchlist mutation invalidation cascade.**

The research report confirms watchlist mutations call `invalidateWatchlistQueries()` and cascade to `["snapshot"]` and `["live-signals"]`. The report explicitly flags as unknown whether `["engine-health"]` is in that list. If watchlist changes alter which symbols are evaluated for feedStatus (they do — different symbols have different MT5 authority), then a watchlist mutation must also invalidate the health query or the UI will display feedStatus computed against the previous symbol set.

This is "Likely" not "Confirmed" because the exact invalidation list has not been read from the current file.

### Unconfirmed

**Tertiary: Admin health endpoint diverging from public health endpoint.**

A PHP test (`test-mt5-snapshot-contract.php` L760–805) asserts admin proxies the same payload. The research report rates this low-probability and the guard already exists. Do not plan around this unless the guard is proven broken. Rejected as a root cause for this patch.

### Corrected framing

This is **not** a source-of-truth divergence. The backend is authoritative and correct. The failure is a frontend cache configuration mismatch: the staleTime setting was appropriate for slow-moving data but is incompatible with the feedStatus freshness contract required by Phase 0.

---

## 2. Implementation contract

### File 1: `src/hooks/useSniperData.ts`

**Section to modify:** The `engine-health` query configuration — specifically the `staleTime` option passed to `useQuery` (or the equivalent `queryOptions` block) for the `["engine-health"]` query key.

**Exact change required:**
- Set `staleTime: 0` on the `engine-health` query. This opts the health query out of the global 10 s stale window. React Query will treat every successful fetch as immediately stale, ensuring the next poll interval always triggers a re-render from fresh data.
- Do not change `refetchInterval`. The existing 2 s poll is the correct mechanism. Removing the stale window is sufficient — do not introduce a separate faster poll.

**Guard rails — must not change:**
- The query key `["engine-health"]` must not be renamed or restructured. Invalidation calls elsewhere reference this key by string literal.
- The `pollMs` override path must be preserved as-is. Callers that pass `pollMs` have their own interval logic.
- The `refetchInterval` must remain at its current value (2 s default). Do not change it to 1 s; the research report lists this as "optional for Phase 0" only and it increases backend load without addressing the root cause.
- The fallback chain `h?.feedStatus ?? h?.priceFeed ?? "offline"` in consuming components must not be touched in this file. That logic lives in the route files and is confirmed correct.

**Why this file is in scope:**
This is the single definition point for the `engine-health` query. All consumers — `signals.tsx`, `admin.tsx`, `FreshnessBadge.tsx` — read from this query's cache. Fixing staleTime here fixes all consumers simultaneously without touching display logic.

**Acceptance criterion:**
After a backend feedStatus transition (confirmed via soak log), the dashboard status chip in `signals.tsx` must reflect the new state within one poll interval (≤2 s). Before this patch the UI could lag up to 10 s. The criterion is: observed lag ≤ 2 s in soak validation.

---

### File 2: `src/hooks/useSniperData.ts` — invalidation cascade (conditional)

**Section to modify:** The `invalidateWatchlistQueries()` function (or equivalent mutation `onSuccess` / `onSettled` callback that cascades query invalidation after watchlist changes).

**Exact change required:**
- Verify whether `queryClient.invalidateQueries({ queryKey: ["engine-health"] })` (or equivalent predicate) is already present in the cascade.
- If it is present: no change. Document the finding in the implementation handoff report.
- If it is absent: add `queryClient.invalidateQueries({ queryKey: ["engine-health"] })` to the same cascade block, in the same style as existing invalidation calls. Do not restructure the cascade.

**Guard rails — must not change:**
- Do not remove or reorder existing invalidation calls. The `["snapshot"]` and `["live-signals"]` invalidations must remain.
- Do not introduce a `refetchType: "all"` override unless the existing cascade already uses it — match the existing pattern.
- Do not wrap in a separate `setTimeout`. Invalidation must be synchronous with the mutation success path.

**Why this file is in scope:**
Watchlist mutations change which symbols contribute to feedStatus. If the health query is not invalidated on watchlist change, the UI can display feedStatus computed for a symbol set that no longer matches the active watchlist. This is the secondary confirmed-likely root cause.

**Acceptance criterion:**
After a watchlist mutation, the `engine-health` query must refetch within one poll cycle. The UI status chip must reflect feedStatus computed for the updated symbol set, not the previous set.

---

### Files confirmed out of contract

| File | Reason excluded |
|---|---|
| `src/routes/admin.tsx` | Display logic (`feedStatus ?? priceFeed`) confirmed correct. No change. |
| `src/routes/signals.tsx` | Display logic and authority check confirmed correct. No change. |
| `src/components/sniper/FreshnessBadge.tsx` | Hardened against unknown state strings. No change. |
| `src/router.tsx` | Global `staleTime: 10_000` must not be lowered globally. Only the health query requires `staleTime: 0`. A global change would over-invalidate all queries. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Backend is computing feedStatus correctly per soak logs. No backend changes in this patch. |

---

## 3. Patch sequence

**Step 1 — Read `src/hooks/useSniperData.ts` in full before writing any change.**
Locate the `engine-health` query definition. Confirm the current `staleTime` value (expected: absent or inherited from global 10 s default). Confirm the `refetchInterval` value. Record exact line numbers.

**Step 2 — Apply `staleTime: 0` to the `engine-health` query.**
This is the primary fix. It is self-contained. It does not depend on Step 3 and can be validated independently.

**Step 3 — Inspect `invalidateWatchlistQueries()` or equivalent cascade.**
Read the mutation callback. Determine whether `["engine-health"]` is present. This is a read-then-conditional-write step. Do not write unless the key is absent.

**Step 4 — If `["engine-health"]` is absent from cascade: add the invalidation call.**
Apply in the same pattern as existing calls. This step depends on the finding in Step 3.

**Sequencing constraints:**
- Steps 1 and 2 are independent of Steps 3 and 4 and can be validated separately.
- Step 4 is gated on Step 3's finding. Do not apply Step 4 speculatively.
- No database migration, no PHP deployment, no cache flush required. This is a frontend-only change (conditional on Step 4 finding).

**Contract and state sequencing risks:**
- None: React Query's cache is in-memory and client-side. No persistent state is modified. Rollback is a one-line revert.
- The query key string `"engine-health"` must exactly match the string used in any existing `invalidateQueries` calls. A typo creates a silent miss. Verify by grep before and after.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. `grep -n "engine-health" src/hooks/useSniperData.ts` — confirm the query key string is spelled identically in the definition and in any new invalidation call.
2. `grep -rn "staleTime" src/hooks/useSniperData.ts src/router.tsx` — confirm global staleTime in `router.tsx` is unchanged and the new `staleTime: 0` appears only on the health query.
3. `grep -rn "invalidateQueries" src/hooks/useSniperData.ts` — confirm the full invalidation cascade is present and no existing call was removed.
4. TypeScript build must pass with zero new errors (`tsc --noEmit` or equivalent CI command).

**Existing protections that must still hold after the patch:**
- `FreshnessBadge` safe fallback to "stale" for unknown strings — must not be bypassed.
- Admin health endpoint marked read-only — no change to that comment or guard.
- Backend PHP health computation — untouched, must remain the sole authority for feedStatus transitions.
- MT5 authority check `mt5AuthorityLive = h?.feedStatus === "live"` in `signals.tsx` — must remain unchanged.
- The `rate-limited` → `stale` normalization in `signals.tsx` — must remain unchanged.

**Parity re-validations required:**
- After deploying, observe soak logs for one market-hours session. Confirm that when backend logs `RESULT=live`, the dashboard status chip transitions to live within ≤2 s. Record the timestamp delta.
- Confirm admin health HealthCard and signals status chip show the same state simultaneously (both read from the same React Query cache; they should already agree, but verify after the staleTime change).

**Logging and diagnostics that must exist after the patch:**
- No new logging is required in this patch. The existing `[PHASE0_SOAK]` backend logs are the ground truth. The validation is: backend log timestamp of transition vs. browser DevTools Network tab timestamp of the next `/health` response — the gap must be ≤2 s.
- Add a one-line comment in `useSniperData.ts` adjacent to `staleTime: 0` explaining why: "Phase 0: health query must reflect backend state within one poll cycle; disable caching." This is an operational constraint, not obvious from the code.

---

## 5. Non-goals

**Out of scope for this patch:**

- Reducing `refetchInterval` from 2 s to 1 s. The root cause is staleTime, not poll frequency. Changing interval is an unvalidated optimization.
- Adding a `nextRefetchHint` field to the backend health response (Option B from the research report). Requires a backend contract change. Not needed to close the documented mismatch.
- Creating a UI-dedicated freshness endpoint (Option C). Introduces a new backend endpoint and caching layer. Not needed.
- Touching `src/routes/admin.tsx` or `src/routes/signals.tsx` display logic. Both are confirmed correct.
- Changing the global `staleTime` in `src/router.tsx`. Affects all queries; blast radius too wide.
- Modifying `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`. Backend is authoritative and correct.
- Modifying Pine trading formulas. No parity corruption proven; not in scope.
- Improving the health endpoint response contract beyond what already exists.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not add optimistic updates for feedStatus. The UI must never project a live state the backend has not confirmed.
- Do not add a client-side feedStatus aggregator. Frontend must not become a source of signal truth.
- Do not remove the `?? priceFeed` fallback from display components. It is a safe backward-compatibility guard.
- Do not widen the watchlist invalidation cascade to include queries beyond `["engine-health"]` unless a separate investigation proves they are also affected.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If `staleTime: 0` is applied to the wrong query (e.g., `["snapshot"]` or `["live-signals"]` instead of or in addition to `["engine-health"]`), all queries would refetch on every render cycle where React Query considers data stale — which with `staleTime: 0` is always. This would cause excessive backend polling, not a data correctness failure, but could degrade performance and mask actual issues during soak. Mitigation: grep to confirm the option is applied only to the health query definition.

If the invalidation call in Step 4 uses a misspelled query key, the health query is silently never invalidated on watchlist mutation. The primary fix (Step 2) still reduces the lag to ≤10 s but the secondary cause remains. This is a silent miss, not a regression. Mitigation: grep to verify key string matches exactly.

**User-visible failure mode:**

Without this patch: dashboard status chip shows "stale" (or a prior state) for up to 10 s after the backend has updated to "live". Signal engine appears blocked to the user when it is not. Phase 0 gate remains open.

With an incorrect patch (wrong query targeted): no user-visible change to health display; the original symptom persists.

**Backend authority and stale-state risks:**

None introduced by this patch. The backend remains the sole authority for feedStatus computation. Reducing staleTime to 0 means the frontend polls more aggressively against fresh data, not that the frontend computes anything. Backend stale-data protections (MT5 freshness aggregation, batch_age checks, blocked/rate-limited classification) are untouched.

The `mt5AuthorityLive` flag in `signals.tsx` derives from `h?.feedStatus === "live"`. After this patch, that flag will reflect backend state within ≤2 s instead of ≤10 s. This is the correct direction — it closes the window where signals are blocked by a stale-false negative.

**Human approval required before merge:**

Yes. The feedStatus field gates MT5 authority decisions. Any change to how the frontend reads and caches it must be reviewed by a human before merge. The soak validation result (timestamp delta ≤2 s confirmed) must be attached to the PR before approval. This is a Phase 0 gate item per the documented mismatch in `.github/migration-status.md`.

---

## 7. Test requirements

**Tests to add:**

1. **Unit test — React Query health query staleTime**: In the test file covering `useSniperData.ts`, add a test that asserts the `engine-health` query is configured with `staleTime: 0`. Use the query's `options` or `defaultOptions` assertion pattern. This test must fail if the staleTime is reverted to the global default. Target: `src/hooks/useSniperData.ts`, the `engine-health` query options block.

2. **Unit test — watchlist invalidation cascade includes health**: In the test file covering watchlist mutations, add a test that asserts `invalidateQueries` is called with a key matching `["engine-health"]` after a watchlist mutation success. This is conditional: only add this test if Step 3 of the patch sequence reveals the key was missing and was added in Step 4.

**Existing tests that must still pass:**

- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` L760–805 — health endpoint contract test. Must pass unmodified. No PHP changes in this patch so failure here would indicate an environmental issue, not a regression.
- All existing React Query tests covering `["snapshot"]` and `["live-signals"]` query behavior — must pass unmodified.
- TypeScript type check (`tsc --noEmit`) must pass with zero errors.

**Soak, replay, and live-environment verification:**

- **Phase 0 soak validation** (required before PR merge): During one live market-hours session after deployment, compare backend `[PHASE0_SOAK]` log timestamps for feedStatus transitions against browser DevTools Network tab response timestamps for `/health`. The observed lag must be ≤2 s (one poll cycle). Record the result in `.github/migration/PHASE0_SOAK_TRACKER.md`.
- **Manual regression check**: Confirm that when feedStatus is "stale" (backend logs confirm it), the dashboard chip correctly renders stale and does not flash live. `staleTime: 0` only affects cache expiry; it does not change the rendered value when the backend is genuinely stale.
- **Parity check**: Confirm admin HealthCard and signals status chip show the same feedStatus simultaneously by loading both routes in adjacent tabs and triggering a backend state transition.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`fix/health-query-stale-time-phase0`

**Suggested commit grouping:**

- **Commit 1**: `fix(health-query): set staleTime=0 on engine-health query to eliminate 10s cache lag` — contains only the staleTime change in `useSniperData.ts`.
- **Commit 2** (conditional, only if Step 3 finds the key missing): `fix(watchlist-invalidation): include engine-health in watchlist mutation invalidation cascade` — contains only the invalidation addition.
- Do not combine the two changes into one commit. They address distinct failure modes and must be independently revertable.

**Required reports or artifacts to generate after implementation:**

- Update `.github/migration-status.md`: change the "frontend feed status mismatch" item from "pending validation/closure" to "patched — pending soak confirmation."
- After soak validation passes: update `.github/migration/PHASE0_SOAK_TRACKER.md` with the observed timestamp delta and mark the feedStatus mismatch item closed.
- Update `.github/migration/audits/phase-0-closeout-gate-parity-2026-05-14.md` to reflect this gate item's resolution.
- PR body must include: root cause (staleTime configuration), files changed, the conditional nature of the invalidation fix, soak validation result (attach after confirmation), and explicit statement that backend PHP is untouched.

**State transition:**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
