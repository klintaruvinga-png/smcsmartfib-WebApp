# SMC SuperFIB - Watchlist Persistence Hardening Plan

## 1. Issue validation

### Confirmed

- The dashboard watchlist is a single canonical state derived from `user-settings` via `useWatchlist()` inside `src/hooks/useSniperData.ts`. All five UI surfaces (Account, Live Radar, Ticker, Signals, Plan) consume this single source. This is confirmed by explicit file evidence in the research report.
- `post_watchlist_add()`, `post_watchlist_remove()`, `post_user_watchlist()`, and `post_user_settings()` all operate on the same backend watchlist store and are each individually expected to invalidate `smc_sf_engine_snapshot`. The snapshot invalidation path (`delete_engine_snapshot()`) exists and is covered by a regression test.
- `AUDCAD` is a supported instrument symbol in `instrument_specs()`. If it is absent from the dashboard, it is being dropped or not persisted — not rejected.
- The front-end mutation flow deliberately preserves optimistic `user-settings` cache state and delays refetch. The test in `src/hooks/useSniperData.watchlist.test.tsx` confirms this design contract is known and intentional.

### Likely

- A stale `user-settings` GET response is overwriting a freshly mutated optimistic cache after `postWatchlistAdd()` or `postWatchlistRemove()` succeeds. The research report identifies this as the primary mechanism by which the symptom arises.
- At least one of the backend mutation endpoints (`post_watchlist_add`, `post_watchlist_remove`, `post_user_watchlist`, `post_user_settings`) is not returning the fully persisted canonical watchlist array in its response body. `sniperClient.ts` already asserts a `watchlist` array must be present; if the backend omits it or returns a partial list, the optimistic update collapses to stale state.
- `smc_sf_engine_snapshot` is not being invalidated consistently across all four mutation paths, leaving the MT5 health diagnostic reporting for a stale symbol set that diverges from the persisted watchlist.

### Unconfirmed

- Whether `AUDCAD` is dropped by symbol normalization or alias logic inside `get_settings()` or `validate_watchlist_symbols()`. This is an open unknown and must be explicitly verified by the implementation agent before any code is changed.
- Whether any watchlist consumer still reads from a non-canonical source outside `useWatchlist()`. The research report flags this but does not provide confirming evidence.
- Whether the issue is exclusively backend-side or requires a dual front-end and back-end fix. The research report recommends Path B (backend audit) as primary, but does not rule out a query-invalidation race on the front end.

**Corrected root cause framing:** The root cause is not a rendering failure in any single UI surface. The root cause is that one or more backend watchlist mutation endpoints are not returning the full canonical persisted watchlist in their response, causing the frontend optimistic state to be overwritten by a stale `user-settings` GET on the next invalidation cycle. A secondary contributing factor is that `smc_sf_engine_snapshot` invalidation may not be applied uniformly across all four mutation paths.

---

## 2. Implementation contract

### File 1: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

- **Section to modify:** `post_watchlist_add()`, `post_watchlist_remove()`, `post_user_watchlist()`, `post_user_settings()`
- **Exact change required:**
  1. After each successful persist, verify that `delete_engine_snapshot()` is called unconditionally when the watchlist symbol set changes. If any path skips this call on a no-op update (symbol already present / already absent), add a conditional that still calls it when the persisted symbol set differs from the pre-mutation symbol set.
  2. Each mutation response must include the complete canonical `watchlist` array as returned from the post-persist read of `get_settings()`. If any endpoint currently returns only a status or a partial array, add the full `watchlist` field to the response JSON.
  3. In `get_settings()` and `validate_watchlist_symbols()`, verify that `AUDCAD` is not being filtered or aliased out. If a normalization step drops it, add it explicitly to the allowed set or correct the normalization map. Do not widen the allowed set beyond currently supported instruments.
- **Guard rails:**
  - Do not remove or weaken `delete_engine_snapshot()`. It must remain on the mutation path.
  - Do not change `validate_watchlist_symbols()` signature or return contract.
  - Do not alter `instrument_specs()` beyond correcting a normalization bug if one is confirmed.
  - Do not change the REST route slugs or HTTP verbs.
  - Do not touch `post_user_settings()` in ways that affect fields beyond `watchlist`.
- **Why this file is in scope:** It is the authority for watchlist persistence and engine snapshot invalidation. If it does not return the full canonical watchlist in mutation responses, every downstream consumer is vulnerable to stale-state overwrite.
- **Acceptance criterion:** After `postWatchlistAdd('AUDCAD')` completes, the response body contains a `watchlist` array that includes `AUDCAD`. After `postWatchlistRemove('AUDCAD')` completes, the response body contains a `watchlist` array that excludes `AUDCAD`. In both cases, `smc_sf_engine_snapshot` must be absent from the cache immediately after the call.

---

### File 2: `src/lib/api/sniperClient.ts`

- **Section to modify:** `postWatchlistAdd()` and `postWatchlistRemove()` response validation
- **Exact change required:** Confirm that the existing assertion that the backend response contains a `watchlist` array is enforced and not silently swallowed. If the assertion throws but is caught without propagating to the mutation error path, harden the error propagation so the frontend mutation is marked failed rather than resolved with stale data.
- **Guard rails:**
  - Do not change the endpoint URLs.
  - Do not add new fields to the request payload.
  - Do not change the function signatures.
  - Do not suppress the existing `watchlist` array assertion.
- **Why this file is in scope:** It is the front-end boundary against a malformed backend response. If the assertion already fires and is silently caught, the front-end will resolve optimistic mutations with stale data, producing the exact symptom described.
- **Acceptance criterion:** If the backend returns a response that lacks a `watchlist` array, `postWatchlistAdd()` and `postWatchlistRemove()` must reject with an error that causes the calling mutation hook to enter its `onError` path.

---

### File 3: `src/hooks/useSniperData.ts`

- **Section to modify:** `useWatchlistAdd()` and `useWatchlistRemove()` mutation hooks — specifically the `onSuccess` and `onSettled` invalidation strategy
- **Exact change required:** Verify that `user-settings` query invalidation is deferred until after the mutation response is fully applied to the cache. If the current implementation calls `invalidateQueries('user-settings')` eagerly (before the mutation `onSuccess` has written the response watchlist into the cache), reorder so the cache write from the mutation response completes before any refetch is triggered. Do not add a new delay or timer — use query client sequencing.
- **Guard rails:**
  - Do not remove the optimistic update.
  - Do not remove the rollback path in `onError`.
  - Do not change `useWatchlist()` return shape or selector identity.
  - Do not alter `useCanonicalWatchlist()` if it exists as a separate selector.
  - Do not touch signal, live, or plan data fetching hooks in this file.
- **Why this file is in scope:** The research report identifies a query-cache race as a likely co-contributor. Even if the backend fix resolves the primary issue, a race here would re-introduce the symptom under load or slow network conditions.
- **Acceptance criterion:** After `useWatchlistAdd('AUDCAD')` resolves successfully, the canonical `useWatchlist()` output includes `AUDCAD` across a full component remount without requiring a page refresh.

---

### File 4: `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`

- **Section to modify:** Existing snapshot invalidation test suite
- **Exact change required:** Add one test case per mutation endpoint (`post_watchlist_add`, `post_watchlist_remove`, `post_user_watchlist`, `post_user_settings`) that asserts the response body includes a `watchlist` key containing the full persisted symbol array. Add one test case that confirms `smc_sf_engine_snapshot` is deleted from cache after each mutation type when the symbol set changes.
- **Guard rails:**
  - Do not remove existing test cases.
  - Do not change existing test fixture structure.
  - Do not add tests that bypass `validate_watchlist_symbols()`.
- **Why this file is in scope:** The new response-body and snapshot-invalidation requirements added to the PHP backend need regression coverage or they will silently regress.
- **Acceptance criterion:** All new and existing tests pass. Each new test fails against the pre-patch backend code and passes after the patch.

---

### File 5: `src/hooks/useSniperData.watchlist.test.tsx`

- **Section to modify:** Existing mutation and optimistic-update test suite
- **Exact change required:** Add one test case that simulates a slow `user-settings` GET response arriving after a successful `postWatchlistAdd()` mutation and asserts that the stale GET does not overwrite the newly added symbol in the canonical watchlist. Add one test case that simulates `postWatchlistAdd()` returning a response missing the `watchlist` array and asserts the mutation enters the `onError` path.
- **Guard rails:**
  - Do not remove or weaken existing optimistic-update test cases.
  - Do not mock the backend in ways that assume a new endpoint signature.
- **Why this file is in scope:** The two new scenarios (slow GET overwrite and malformed response propagation) are the exact failure modes this patch targets. They need explicit front-end test coverage.
- **Acceptance criterion:** Both new tests pass after front-end changes. Existing tests continue to pass unmodified.

---

## 3. Patch sequence

1. **PHP backend — response body hardening** (`smc-superfib-sniper.php`): Ensure all four mutation endpoints return the full canonical `watchlist` array. This must be done first because the front-end fix in step 3 depends on the backend reliably returning a valid watchlist.
2. **PHP backend — snapshot invalidation audit** (`smc-superfib-sniper.php`): Confirm `delete_engine_snapshot()` is called on all symbol-set-changing mutation paths. Can be applied in the same commit as step 1 since both touch the same file.
3. **PHP backend — AUDCAD normalization check** (`smc-superfib-sniper.php`): Verify and correct any normalization or alias filtering that drops `AUDCAD`. Must be done after step 1 is confirmed, not before, because if `AUDCAD` is dropped before persistence the response body fix is moot.
4. **PHP regression tests** (`test-watchlist-snapshot-regression.php`): Add new test cases immediately after the PHP changes. Must pass before front-end changes are started.
5. **Front-end response validation hardening** (`sniperClient.ts`): Harden error propagation for missing `watchlist` in response. Depends on the backend now reliably returning the field so the assertion will pass on valid calls.
6. **Front-end query invalidation sequencing** (`useSniperData.ts`): Correct `onSuccess` / `onSettled` ordering if a race is confirmed during inspection. This is the lowest-risk front-end change and must not be applied speculatively — apply only if the race is confirmed by code inspection.
7. **Front-end test additions** (`useSniperData.watchlist.test.tsx`): Add new test cases after front-end changes.

**Sequencing risks:**
- Steps 1–3 are in the same file. Apply as a single atomic commit to avoid a state where the response is hardened but normalization still drops `AUDCAD`.
- Step 6 is conditional. The implementation agent must inspect `useSniperData.ts` and confirm a race exists before making any change. Do not apply speculatively.
- Steps 4 and 7 must pass before the branch is submitted for PR review.

---

## 4. Regression guards

### Checks the implementation agent must run after patching

- Run `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` in full. All existing and new cases must pass.
- Run `src/hooks/useSniperData.watchlist.test.tsx` in full. All existing and new cases must pass.
- Manual end-to-end: add `AUDCAD` via the Account UI, navigate to Live Radar, confirm `AUDCAD` appears without page refresh. Remove `AUDCAD`, confirm it disappears without page refresh.
- Confirm `smc_sf_engine_snapshot` is absent from the backend cache immediately after each of the four mutation endpoints is exercised with a symbol-set change.

### Existing protections that must still hold

- The optimistic `user-settings` cache update must remain. Do not remove it.
- The `onError` rollback path in `useWatchlistAdd()` and `useWatchlistRemove()` must remain.
- `delete_engine_snapshot()` must be called on every watchlist symbol-set change on the backend.
- `validate_watchlist_symbols()` must remain and must still reject unsupported symbols.
- `sniperClient.ts` assertion that the response contains a `watchlist` array must remain and must not be silently caught.

### Parity re-validations required

- Dashboard-JS canonical watchlist (from `useWatchlist()`) must exactly match the `watchlist` array returned by `GET /user/settings` after any mutation settles.
- Backend persisted `watchlist` (as read from `get_settings()` post-persist) must match the `watchlist` array returned in the mutation response body.
- MT5 engine snapshot must not reference a symbol set that diverges from the persisted watchlist after any mutation.

### Logging or diagnostics that should exist after the patch

- Each backend mutation endpoint should log a warning if `delete_engine_snapshot()` is skipped (i.e., if the symbol set did not change). This makes silent no-ops detectable in server logs.
- The front-end `sniperClient.ts` must log an error (not silently swallow) when the `watchlist` assertion fails, so it appears in browser console and monitoring.

---

## 5. Non-goals

- Refactoring `useWatchlist()`, `useCanonicalWatchlist()`, or any selector beyond the specific race condition fix, if confirmed.
- Changing the Live Radar, Ticker, Signals, or Plan components. These are consumers of the canonical watchlist; if the canonical watchlist is correct after this patch, they will render correctly without changes.
- Changing the MT5 bridge, MT5 data feed, or any MT5 connector code.
- Adding new watchlist endpoints or changing REST route slugs.
- Changing Pine trading formulas or signal engine weighting logic.
- Widening the supported instrument set beyond what `instrument_specs()` already defines.
- Adding new frontend watchlist UI features or UX improvements.
- Auditing or changing `src/routes/charts.tsx` — included in the research blast radius but not implicated by the confirmed or likely root causes.
- Addressing any watchlist consumer that may read from a non-canonical source — this is an open unknown. Do not attempt to fix what has not been confirmed.
- Performance improvements, caching strategy changes beyond the specific invalidation race, or architecture changes.

---

## 6. Risk assessment

### Worst-case failure mode if patched incorrectly

If `delete_engine_snapshot()` is accidentally removed or gated incorrectly, the MT5 engine will continue operating against a stale symbol set. In the worst case, signals and live data will be generated for symbols that are no longer in the user's watchlist, or will be absent for symbols that are. This is a silent correctness failure — no immediate error will surface.

### User-visible failure mode

If the backend mutation response body change is incomplete or introduces a new omission, `sniperClient.ts` will throw an assertion error on every watchlist mutation. The user will be unable to add or remove symbols until a page reload, and the canonical watchlist will be stuck at its pre-mutation state.

### Backend authority and stale-state risks

If the `user-settings` GET response is allowed to overwrite the mutation result cache before the cache write completes (the race condition), the watchlist will visually revert to its pre-mutation state after every add or remove. This is the primary stale-state risk. The backend PHP fix alone will not eliminate this risk if the front-end race is confirmed — both must be corrected.

### Whether human approval should be required before merge

**Yes.** The watchlist persistence path is load-bearing for Live Radar visibility, signal filtering, and MT5 engine snapshot integrity. The patch touches the PHP backend persistence layer, which has no rollback mechanism at the application level. A human reviewer must verify the response body changes against the existing PHP test suite and confirm that `delete_engine_snapshot()` remains on all paths before merge.

---

## 7. Test requirements

### Tests to add

- `test-watchlist-snapshot-regression.php`: one case per mutation endpoint asserting the response body includes a full `watchlist` array; one case per mutation endpoint asserting `smc_sf_engine_snapshot` is absent after a symbol-set-changing mutation.
- `useSniperData.watchlist.test.tsx`: one case simulating a slow `user-settings` GET arriving after a successful mutation, asserting the newly added symbol is not overwritten; one case simulating a response missing the `watchlist` array, asserting the mutation enters `onError`.

### Existing tests that must still pass unchanged

- All existing cases in `test-watchlist-snapshot-regression.php`.
- All existing cases in `useSniperData.watchlist.test.tsx`.
- Any snapshot or integration test that exercises the `useWatchlist()` selector return value.

### Soak, replay, parity, or live-environment verification needed

- After deploying the PHP backend patch to staging, perform at least three add/remove/add cycles with `AUDCAD` and verify the canonical watchlist in both the backend response and the frontend `useWatchlist()` output remains consistent across each cycle.
- Verify `smc_sf_engine_snapshot` is cleared after each cycle via the backend health diagnostic endpoint.
- Confirm that other symbols in the watchlist are not affected by the `AUDCAD` normalization correction.

---

## 8. Implementation handoff

### Branch naming recommendation

`fix/watchlist-audcad-persistence-and-snapshot-hardening`

### Suggested commit grouping

1. `fix(backend): return full watchlist array in all mutation endpoint responses` — covers all four PHP mutation endpoints response body changes.
2. `fix(backend): ensure engine snapshot invalidation on all watchlist mutations` — covers the `delete_engine_snapshot()` audit and any missing call sites.
3. `fix(backend): correct AUDCAD normalization in get_settings/validate_watchlist_symbols` — only if normalization bug is confirmed; do not create this commit if not confirmed.
4. `test(backend): add response-body and snapshot-invalidation regression cases` — covers new PHP test cases.
5. `fix(frontend): harden sniperClient watchlist assertion error propagation` — covers `sniperClient.ts` change.
6. `fix(frontend): correct user-settings invalidation sequencing after watchlist mutation` — only if the race is confirmed by code inspection; do not create this commit if not confirmed.
7. `test(frontend): add stale-GET-overwrite and malformed-response watchlist test cases` — covers new front-end test cases.

### Required reports or artifacts to generate after implementation

- Diff summary of all four PHP mutation endpoint response bodies showing the added `watchlist` field.
- Test run output for `test-watchlist-snapshot-regression.php` (all cases, pass/fail).
- Test run output for `useSniperData.watchlist.test.tsx` (all cases, pass/fail).
- Manual verification log of the add/remove/add cycle for `AUDCAD` on staging including screenshots of the Live Radar and Account UI before and after.
- Confirmation that `smc_sf_engine_snapshot` was absent from cache after each tested mutation.

### State transition

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
