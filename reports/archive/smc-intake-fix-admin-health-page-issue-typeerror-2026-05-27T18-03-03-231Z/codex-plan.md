## 1. Issue validation

- Confirmed: The frontend has unguarded property reads that can throw when a health container is absent. The concrete read sites are in [`src/routes/admin.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/admin.tsx): `AdminPage` backend health render block, the baseline-form hydration `useEffect`, `CheckpointCard`, `buildHealthSummary()`, and `buildSoakReportMarkdown()`.
- Confirmed: The backend can legitimately return a checkpoint row whose `snapshot_data` lacks `health`. In [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/smc-superfib-sniper.php), `seed_baseline_checkpoint()` writes `snapshot_data = {}` and `map_soak_checkpoint_row()` returns that blob as-is. That is enough to make `aggregate.health` undefined in `CheckpointCard`.
- Confirmed: The reported research overstates the specific failing field. Missing `feedStatus` alone is not sufficient to crash, because `health.feedStatus ?? health.priceFeed` is safe when `health` exists. The crash requires the parent object being dereferenced to be undefined in the active path.
- Likely: A malformed `/admin/health` payload with a nullish or non-object health body would also crash current frontend paths, because `fetchAdminHealth()` applies no runtime shape validation before `state.health` is consumed.
- Likely: The user-visible Engine Fault on Admin/Health is most directly explained by the seeded or historical checkpoint path, because that missing-`health` condition is proven in this repo and is rendered inside the page without guards.
- Unconfirmed: Older persisted checkpoints, recent snapshot-shape regressions, or a deploy/source mismatch for `index-HU_NwOvP.js` caused this specific incident. The research report does not include the failing row, backend version, or commit evidence needed to prove those claims.
- Corrected root cause: The Admin page trusts runtime health containers that are not guaranteed at render time, and the checkpoint path is provably fed by backend rows whose `snapshot_data` can be `{}`.

## 2. Implementation contract

### `src/routes/admin.tsx`

- Exact target: `AdminPage` backend health display block, the `useEffect` that hydrates `baselineForm` from `state.health`, `CheckpointCard`, `buildHealthSummary()`, and `buildSoakReportMarkdown()`.
- Exact change required: Add a local display-only resolver for optional health objects and route every current direct `*.health.*` read through it. The resolver must safely handle `null`, `undefined`, and partial health objects and return conservative display values only.
- Exact change required: Use fallback values that cannot be mistaken for a healthy system. Required minimum behavior:
- Exact change required: `feedStatus` display resolves from `feedStatus ?? priceFeed ?? "unknown"`.
- Exact change required: `backendSync`, `priceFeed`, and `engineRunState` display fall back to `"unknown"` when absent.
- Exact change required: `twelveDataKeyStatus` display resolves from `twelveDataKeyStatus ?? twelveDataKey ?? "unknown"`.
- Exact change required: timestamp fields continue to pass through `formatTimestamp()` so missing values render as `"Unavailable"`.
- Exact change required: checkpoint summary rows must render safely when `checkpoint.snapshot_data.health` is missing.
- Exact change required: markdown/export helpers must not throw if a checkpoint-backed or malformed health object is incomplete.
- Guard rails: Do not change API endpoints, fetch cadence, auth flow, route structure, data attributes, labels, selectors, soak workflow state, or any backend-owned truth rules.
- Guard rails: Do not synthesize `"live"`, `"stale"`, `"blocked"`, or `"ok"` from missing data. Unknown input must remain unknown/neutral.
- Guard rails: Do not mutate the fetched payloads in-place or redefine backend contracts in this patch.
- Why this file is in scope: Every confirmed crash site is here, and a single local resolver keeps the patch surgical while covering both the visible page and its string-building helpers.
- Acceptance criterion tied to failure path: Admin/Health renders without throwing when `baseline_checkpoint.snapshot_data` is `{}` or when a checkpoint row lacks `health`; the page shows fallback text instead of an Engine Fault overlay.
- Acceptance criterion tied to failure path: Baseline-form hydration and soak report export paths no longer throw on partial health payloads.

### `src/routes/-admin.test.tsx`

- Exact target: `AdminPage` render tests and soak-report fixture builders used by the Admin route test suite.
- Exact change required: Add a regression test that reproduces the confirmed failure path by returning a soak report whose baseline or checkpoint row has `snapshot_data: {}` and verifies the page renders without a runtime exception.
- Exact change required: Assert the checkpoint summary renders conservative fallback text for missing health fields instead of crashing.
- Exact change required: Add one focused test that exercises the frontend health-summary path against a partial health object so `buildHealthSummary()` and baseline-form hydration are covered by rendering behavior, not by type assumptions.
- Guard rails: Do not rewrite unrelated Admin page tests or broaden mocks beyond what is needed to reproduce the failure.
- Why this file is in scope: The current test suite only covers fully populated health payloads and therefore misses the exact null-container failure that reached production.
- Acceptance criterion tied to failure path: The added tests fail against current source and pass only once the null-container guards are in place.

## 3. Patch sequence

1. Add a local display resolver in `src/routes/admin.tsx` for optional health containers, keeping it private to the route file.
2. Replace direct health dereferences in the backend health cards, baseline-form hydration, checkpoint cards, and markdown/summary helpers with resolver-backed reads.
3. Add regression fixtures and tests in `src/routes/-admin.test.tsx` for `snapshot_data: {}` and partial health input.
4. Run the targeted Admin route test suite, then the broader frontend test slice that already covers admin and API client behavior.

- Dependency: Step 2 depends on Step 1 so every consumer uses one fallback policy.
- Dependency: Step 3 depends on Step 2 only for final expected strings; the failing fixture itself should be introduced first or alongside the assertions.
- Sequencing risk: Changing fallback copy after tests are written will create noisy churn; lock the fallback vocabulary before test assertions.
- State/cache/contract risk: No schema, cache, or migration sequencing is permitted in this patch. If deployed, normal frontend asset invalidation is still required so the broken bundle is replaced.

## 4. Regression guards

- Verify the Admin page still renders the existing read-only backend-owned section and retains `data-section="backend-health-readonly"`.
- Verify checkpoint history still renders baseline/checkpoint badges, timestamps, and operator notes when snapshot health is present.
- Verify stale-data protections still hold by inspection: missing health must never render as `"live"`, `"ok"`, or any other authoritative healthy state.
- Verify backend authority still holds: the UI remains display-only and does not backfill, post, or persist reconstructed health data.
- Verify no Pine, signal, regime, anchor, or trading-formula paths are touched. This issue is a diagnostics-page render fault only.
- Parity re-validation required: none for Pine/math parity; only confirm the UI still reflects backend statuses verbatim when those statuses exist.
- Logging/diagnostics after patch: browser console must no longer emit the `reading 'feedStatus'` TypeError on the failing page state. Existing backend `PHASE0_SOAK` diagnostics remain unchanged.

## 5. Non-goals

- Do not patch `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` in this issue, even though it contains a confirmed empty-baseline seed path.
- Do not add a DB migration, snapshot backfill, or checkpoint rewriter for historical rows.
- Do not change `src/lib/api/sniperClient.ts` request behavior or add broad client-side schema validation in this patch.
- Do not loosen or rewrite the TypeScript domain contracts in `src/types/sniper.ts` just to mirror bad historical data.
- Do not redesign the Admin page, change copy beyond conservative fallback text, or alter soak workflow UX.
- Do not treat this patch as permission to change backend health formulas, MT5 authority rules, stale thresholds, or Pine parity logic.
- Avoid the attractive follow-on of auto-healing malformed checkpoint rows in the UI state. Render safely, but keep malformed data visible as unknown rather than silently normalizing it into a trusted snapshot.

## 6. Risk assessment

- Worst-case failure mode if patched incorrectly: the page stops crashing but displays missing health as a healthy status, masking a backend or stale-data fault.
- User-visible failure mode: Admin/Health may render misleading badges, empty cards, or incorrect soak export text if fallback mapping is too permissive.
- Backend authority risk: Any fallback that invents backend status would make the frontend a source of signal truth. That must not happen.
- Stale-state risk: Mapping absent health to `"stale"` everywhere would avoid a crash but would also overstate certainty. Use `"unknown"`/`"Unavailable"` where the backend omitted data.
- Merge approval: Human approval should be required before merge. Standard frontend review is sufficient if the patch remains limited to `src/routes/admin.tsx` and `src/routes/-admin.test.tsx`; backend-owner sign-off is not required unless implementation scope expands into PHP.

## 7. Test requirements

- Add or update targeted Vitest coverage in `src/routes/-admin.test.tsx` for a soak report containing `baseline_checkpoint.snapshot_data = {}` or an equivalent checkpoint row missing `health`.
- Add or update targeted Vitest coverage in `src/routes/-admin.test.tsx` for partial frontend health input so the baseline summary path does not crash.
- Existing tests that must still pass: current Admin route tests in `src/routes/-admin.test.tsx` and existing API client tests in `src/lib/api/sniperClient.test.ts`.
- Manual verification required: open Admin/Health with a seeded baseline or injected failing checkpoint payload and confirm no Engine Fault overlay appears.
- Manual verification required: confirm checkpoint history still shows timestamps and counts, and that fallback text is neutral/conservative when health is missing.
- Manual verification required: trigger soak report export/download and confirm markdown generation no longer throws on partial health data.
- Soak/replay/parity/live-environment verification: no long soak or Pine parity replay is required for merge, but a production-like page load using a known malformed checkpoint row is required because the defect is data-shape specific.

## 8. Implementation handoff

- Branch naming recommendation: `fix/admin-health-null-health-guards`
- Suggested commit grouping: `1) admin health display guards`, `2) admin route regression tests`
- Required reports or artifacts after implementation: targeted test run output for the Admin route suite, one screenshot of the Admin/Health page rendering the malformed checkpoint without crashing, and the final fallback strings used for missing health fields.
- Required reports or artifacts after implementation: if a production build is created, include the generated asset hash that replaces `index-HU_NwOvP.js`.
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
