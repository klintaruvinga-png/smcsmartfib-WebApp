# 1. Issue validation

- Confirmed: The reported visible failure is the `PlanPage` fallback path in `src/routes/-plan.page.tsx`, not a card component render failure. `topCandidates.length === 0` returns diagnostic text instead of mounting `PlanCandidateCard`.
- Confirmed: `topCandidates` can only contain ranked watchlist candidates that have a ladder entry matched by `TradePlan.signalId === SignalCandidate.id`.
- Confirmed: The diagnostics shown by the UI can report `Found 0 total blueprints` when `useLadders()` resolves to an empty or absent ladder array after loading completes.
- Likely: Recent changes affected the `/ladders` frontend data path, query enablement, response shape, or backend snapshot plan generation, causing valid watchlist candidates to have no matching frontend ladder data.
- Likely: The safest first patch is to instrument and harden the ladder-loading and plan-matching path without weakening backend authority or fabricating frontend plans.
- Unconfirmed: The backend `/ladders` endpoint itself is broken. It may be returning an empty plan array because `ensure_engine_snapshot()` has no current plans, because the frontend query is disabled, or because signal IDs no longer align between `/live-signals` and `/ladders`.
- Unconfirmed: `PlanCandidateCard` is defective. Current evidence points upstream because cards are never selected for rendering.

# 2. Implementation contract

- File: `src/routes/-plan.page.tsx`
- Target: `PlanPage`, `laddersBySignalId`, `candidatePool`, `topCandidates`, and the zero-candidate diagnostics block.
- Exact change required: Preserve the existing `PlanCandidateCard` rendering path, but expand diagnostics enough to distinguish no ladders from ID mismatch: include loaded ladder count, ladder signal IDs, top watchlist candidate ID, and whether any watchlist candidate has a matching ladder by `signal.id`.
- Guard rails: Do not synthesize `TradePlan` objects, do not render a card without a backend ladder, do not change `PlanCandidateCard` props, do not remove watchlist filtering, and do not bypass `isTradePlanComplete`.
- Why this file is in scope: It owns the failure path and decides whether users see plan cards or diagnostic text.
- Acceptance criterion: When signals and matching ladders are present, `PlanCandidateCard` renders; when ladders are empty or mismatched, the fallback clearly identifies the missing ladder condition without masking backend state.

- File: `src/hooks/useSniperData.ts`
- Target: `useLadders()`.
- Exact change required: Verify and, if needed, align `useLadders()` enablement with the other live polling hooks so `/ladders` does not remain disabled after settings resolve. Add a focused dev-only diagnostic matching the existing polling diagnostics style if it helps prove query re-enable behavior.
- Guard rails: Do not poll before settings resolve, do not ignore `backendReady`, do not set a frontend fallback backend URL, and do not change unrelated polling hooks.
- Why this file is in scope: The research shows `/ladders` only runs when `backendReady && pollMs !== null`; a stale disabled state would produce the exact zero-blueprint UI.
- Acceptance criterion: With resolved settings and a backend URL, the ladders query is enabled and refetches on the configured interval; with missing or failed settings, the existing settings error and backend URL guards still win.

- File: `src/lib/api/sniperClient.ts`
- Target: `apiClient.getLadders()`.
- Exact change required: Validate the live `/ladders` response shape before returning it. If the backend returns a non-array payload, throw a clear `/ladders: backend response missing ladder array` style error instead of silently feeding an unusable value to the plan page.
- Guard rails: Do not change the `/ladders` endpoint path, auth behavior, `TradePlan` type contract, mock mode behavior, or backend source-of-truth semantics.
- Why this file is in scope: It is the typed boundary between the dashboard and backend ladder contract.
- Acceptance criterion: Array responses continue unchanged; malformed non-array responses fail loudly and are visible through the query error path instead of producing misleading empty-card diagnostics.

- File: `src/routes/-plan.test.tsx`
- Target: `PlanPage ranking and execution guards`.
- Exact change required: Add or update tests covering three cases: matching signal/ladders render cards, empty ladders show the backend-connectivity diagnostic, and non-empty ladders with non-matching `signalId` show the ID mismatch diagnostic.
- Guard rails: Do not weaken existing execution guard tests, ranking tests, watchlist scoping tests, or stage-lot authority assertions.
- Why this file is in scope: It already owns the plan-page regression surface and mocks the exact hooks involved.
- Acceptance criterion: The test suite fails before the implementation if the reported failure path remains ambiguous, and passes after the targeted fix.

# 3. Patch sequence

1. Add or tighten `src/routes/-plan.test.tsx` coverage for matching ladders, empty ladders, and signal ID mismatch.
2. Update `src/lib/api/sniperClient.ts` so `getLadders()` rejects malformed live responses while preserving valid array responses and mock data.
3. Review `src/hooks/useSniperData.ts` query enablement for `useLadders()` and add only minimal diagnostics if the hook can remain disabled after settings resolve.
4. Update `src/routes/-plan.page.tsx` diagnostics so the zero-card state distinguishes no ladders from non-matching ladder IDs.
5. Run the focused route test, then run the broader build/test commands listed below.

- Dependency: Tests should be written before route/hook/API changes so the implementation proves the exact failure path.
- State risk: React Query caches `["ladders"]`; implementation must not reuse stale empty data after settings/backend URL changes if the query key or backend URL behavior is involved.
- Contract risk: Backend `/ladders` remains the source of truth; frontend changes must not infer plans from signals.
- Migration risk: None expected. No schema migration is in scope.

# 4. Regression guards

- Run `npx vitest run src/routes/-plan.test.tsx`.
- Run `npm run build`.
- If available in the current environment, manually verify `/plan` with live backend settings: cards render when `/live-signals` and `/ladders` share signal IDs, and diagnostics appear only when ladders are empty or mismatched.
- Existing protections that must still hold: settings load errors render `SettingsQueryErrorState`; missing backend URL renders the Account configuration guard; incomplete backend plans keep execution disabled; stage lots are displayed from backend values without recomputation.
- Parity re-validation required: Dashboard must match backend ladder authority by `signalId`; no Pine formulas or MT5 signal formulas are part of this patch.
- Logging/diagnostics expected: If dev-only logging is added, it must be limited to ladder query re-enable or malformed response diagnostics and must not log credentials or full account payloads.

# 5. Non-goals

- Do not redesign the plan page UI.
- Do not change `PlanCandidateCard` visuals or execution controls except where tests prove a direct contract issue.
- Do not generate frontend fallback plans from live signals.
- Do not change Pine, MT5, or trading formulas.
- Do not change backend risk, lot sizing, stage execution, or order placement logic.
- Do not widen the patch into unrelated polling, dashboard, or WordPress cleanup.
- Avoid the attractive but unsafe follow-on of showing cards for unmatched signals; unmatched ladders must remain a diagnostic state.

# 6. Risk assessment

- Worst-case failure mode if patched incorrectly: The dashboard renders a plausible plan card that is not backed by the backend ladder contract, creating a false execution signal.
- User-visible failure mode: Users continue seeing plain diagnostic text instead of signal plan cards, or see a more explicit mismatch/error state if backend data is unavailable.
- Backend authority risk: High if frontend starts deriving plans; low if the patch only validates response shape, query enablement, and diagnostics while requiring backend `TradePlan` data.
- Stale-state risk: Moderate. React Query may retain stale empty ladders if backend URL/settings changes are not sequenced correctly.
- Human approval before merge: Required, because this affects live trading plan visibility and backend/dashboard parity.

# 7. Test requirements

- Add/update `src/routes/-plan.test.tsx` to assert matching `signal.id` and `TradePlan.signalId` render `plan-candidate-card`.
- Add/update `src/routes/-plan.test.tsx` to assert empty ladders show the existing `Ladders endpoint returned no data - check backend connectivity` diagnostic.
- Add/update `src/routes/-plan.test.tsx` to assert non-empty ladders with no matching watchlist candidate IDs show a mismatch-specific diagnostic and do not render cards.
- Add/update API-client unit coverage if an existing local test harness already covers `sniperClient`; otherwise keep response validation covered through focused manual verification.
- Existing checks that must still pass: `npx vitest run src/routes/-plan.test.tsx` and `npm run build`.
- Live-environment verification: With authenticated backend settings, compare `/wp-json/sniper/v1/live-signals` signal IDs to `/wp-json/sniper/v1/ladders` `signalId` values for at least one watchlist symbol before accepting the patch.

# 8. Implementation handoff

- Branch naming recommendation: `codex/fix-plan-card-ladders-contract`.
- Suggested commit grouping: one commit containing the focused tests, ladder response validation, hook/route diagnostics, and no unrelated files.
- Required reports or artifacts after implementation: `reports/codex-implementation.md`, `reports/codex-implementation.meta.json`, focused test output, and build result in the implementation handoff.
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`.
