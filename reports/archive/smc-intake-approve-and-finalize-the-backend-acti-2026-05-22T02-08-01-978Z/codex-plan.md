# SMC SuperFIB - Hardened Implementation Contract

**Issue:** SMC Intake — Approve and finalize the backend active-day definition
**Input:** `reports/copilot-research.md`
**Output target:** `reports/codex-plan.md`

---

## 1. Issue validation

**Confirmed**

- The backend active-day business rule is deliberately unresolved. `const ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` is a contract-level safety gate, not a bug.
- `read_progress_streak()` returns `current_streak_days: 0` and `state: 'UNAVAILABLE'` as a static fallback. This is the correct degraded state until the governance decision is made.
- The Phase 2 progress wiring is complete. The endpoint `/user/progress` is registered, authenticated, and tested. The only thing preventing live streak values is the unresolved business rule.
- Frontend `src/routes/progress.tsx` explicitly surfaces the message about pending approval. This is correct behavior, not a defect.

**Likely**

- The active-day definition involves persisted engine activity only (i.e., completed engine runs recorded in the database), not real-time or speculative activity. This is inferred from the phrase "persisted engine activity only" in the research report's Path A description and is consistent with MT5 authority and backend-as-truth constraints.
- Enabling streak truth will require a live staging re-validation pass against `/health`, `/market-data-authority`, and `/user/progress` after the patch.

**Unconfirmed**

- Whether the active-day rule requires a daily P/L threshold, a minimum activity count, or a simple calendar-day-with-any-completed-run definition. This must be resolved via explicit signoff before implementation begins.
- Whether `last_active_date` must be backfilled from historical engine run records or computed prospectively only.
- Whether the `active_day_rule_status` field (Path B) is needed as an intermediate state, or whether a direct toggle from `UNRESOLVED_REQUIRES_SIGNOFF` to an approved constant is sufficient.

**Root cause (corrected and narrowed)**
The streak is unavailable because the business definition of an "active day" has not been formally approved. The technical implementation is correct and complete. The blocking condition is governance, not engineering.

---

## 2. Implementation contract

### File 1: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

- **Section to modify:** The `ACTIVE_DAY_DEFINITION` constant and the `read_progress_streak()` function body.
- **Exact change required:**
  1. Replace `const ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` with the approved definition constant — e.g., `const ACTIVE_DAY_DEFINITION = 'CALENDAR_DAY_WITH_COMPLETED_ENGINE_RUN'` (or the exact string agreed in signoff).
  2. In `read_progress_streak()`, replace the static fallback (`current_streak_days: 0`, `state: 'UNAVAILABLE'`) with a live computation that counts consecutive calendar days from the persisted engine run log where at least one completed run exists, up to and including today.
  3. Set `state` to `'LIVE'` when the streak can be computed from valid data, `'UNAVAILABLE'` only when no persisted run data exists.
  4. `last_active_date` must be derived from the most recent persisted engine run record, not from any frontend or MT5 signal.
- **Guard rails:**
  - Do not alter any other function in this file.
  - Do not change the REST route registration, permission callback, or response schema shape for `/user/progress`.
  - Do not change equity pulse or drawdown fields; those remain owned by account telemetry contracts.
  - `streak.state` must remain `'UNAVAILABLE'` if no persisted run data exists — the fallback is mandatory.
  - MT5 and backend remain the sole sources of activity truth; no frontend or client-side signal may influence streak computation.
- **Why in scope:** This is the single authoritative backend definition point for the active-day rule and the sole source of streak truth. No other change is valid without this one.
- **Acceptance criterion:** `GET /user/progress` returns `streak.state = 'LIVE'` and `streak.current_streak_days > 0` only when the authenticated user has at least one persisted engine run recorded on each of N consecutive calendar days ending today. Returns `state = 'UNAVAILABLE'` with `current_streak_days: 0` when no run data is present.

---

### File 2: `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`

- **Section to modify:** The existing assertion that streak is degraded while `ACTIVE_DAY_DEFINITION` is unresolved.
- **Exact change required:**
  1. Add a new test case asserting that `GET /user/progress` returns `streak.state = 'LIVE'` and a non-zero `current_streak_days` value when the test fixture includes persisted engine run records on consecutive days.
  2. Retain the existing test that asserts `streak.state = 'UNAVAILABLE'` when no persisted run data exists.
  3. Add a test case asserting that `streak.state = 'UNAVAILABLE'` is returned when the run log is empty, even after the definition is resolved.
- **Guard rails:**
  - Do not remove the existing unavailable-state test.
  - Do not introduce any mocks that bypass the database layer; tests must use the existing fixture infrastructure.
  - Do not alter test infrastructure or test bootstrap files.
- **Why in scope:** The existing tests encode the degraded-state contract. They must be extended, not replaced, to cover the live-state contract.
- **Acceptance criterion:** All three test cases pass: (a) unavailable with no data, (b) live with consecutive run fixtures, (c) existing auth and route registration assertions continue to pass.

---

### File 3: `src/routes/progress.tsx`

- **Section to modify:** The conditional block that renders the "Streak remains unavailable until the backend active-day definition is approved" message.
- **Exact change required:**
  1. Update the conditional so the unavailable message is shown only when `streak.state === 'UNAVAILABLE'`.
  2. When `streak.state === 'LIVE'`, render the streak count and `last_active_date` fields using the existing component structure.
  3. Do not add new UI state beyond what the backend contract already provides.
- **Guard rails:**
  - Do not change the equity pulse or drawdown rendering sections.
  - Do not introduce client-side streak calculation logic of any kind.
  - Do not change the data-fetching hooks or selectors; render only what the API returns.
  - The unavailable message path must remain fully functional.
- **Why in scope:** The frontend is the only user-visible surface that gates on `streak.state`. Once the backend contract is resolved, this conditional must render the live state correctly.
- **Acceptance criterion:** On a browser with a valid session and backend returning `streak.state = 'LIVE'`, the progress page renders the streak count without the "unavailable" message. With `streak.state = 'UNAVAILABLE'`, the existing message renders and no streak count is shown.

---

### File 4: `src/routes/-progress.page.test.tsx`

- **Section to modify:** The test suite covering the unavailable streak state and messaging.
- **Exact change required:**
  1. Add a test case that renders the progress page with a mocked API response of `streak.state = 'LIVE'` and `current_streak_days: N` and asserts the streak count is displayed and the unavailable message is absent.
  2. Retain the existing test that asserts the unavailable message appears when `streak.state = 'UNAVAILABLE'`.
- **Guard rails:**
  - Do not change the mock shape of equity pulse or drawdown fields.
  - Do not test streak business logic in the frontend; the frontend only renders what the API returns.
- **Why in scope:** The frontend tests must cover the live-state render path once the backend contract is resolved.
- **Acceptance criterion:** Both test cases pass: unavailable message present when state is `UNAVAILABLE`, absent when state is `LIVE`.

---

### File 5: `.github/migration-status.md`

- **Section to modify:** The streak status entry that documents it as intentionally degraded pending active-day rule approval.
- **Exact change required:** Update the streak entry to reflect that the active-day definition has been approved and streak truth is live, including the approved definition string and the date of signoff.
- **Guard rails:** Do not alter any other migration status entries.
- **Why in scope:** Migration status is the authoritative record of which contracts are live. The streak entry must transition from degraded to live.
- **Acceptance criterion:** The entry clearly states the definition constant, the date it was approved, and the resulting streak state.

---

### File 6: `PHASE2_IMPLEMENTATION.md`

- **Section to modify:** The streak / active-day definition section.
- **Exact change required:** Update the status from pending signoff to approved, recording the approved definition and the date.
- **Guard rails:** Do not alter any other Phase 2 implementation documentation.
- **Why in scope:** PHASE2_IMPLEMENTATION.md tracks which Phase 2 contracts are complete. Streak resolution closes an open item.
- **Acceptance criterion:** The streak section no longer reads as pending.

---

## 3. Patch sequence

1. **Governance gate (blocking — must complete before any code change):** Obtain explicit written signoff on the active-day definition. The exact definition string must be confirmed before `ACTIVE_DAY_DEFINITION` is changed. If signoff is not obtained, stop and do not proceed to step 2.

2. **Backend constant and computation (`smc-superfib-sniper.php`):** Update `ACTIVE_DAY_DEFINITION` and implement live streak computation in `read_progress_streak()`. This is the root change; all other changes depend on it.

3. **Backend tests (`test-phase2-trade-telemetry.php`):** Extend tests to cover the live-state contract. Must be run immediately after step 2 to confirm the backend implementation is correct before the frontend is touched.

4. **Frontend render (`src/routes/progress.tsx`):** Update the conditional to render live state. Must not be merged before step 3 passes.

5. **Frontend tests (`src/routes/-progress.page.test.tsx`):** Add the live-state test case. Must pass before the frontend change is committed.

6. **Documentation (`migration-status.md`, `PHASE2_IMPLEMENTATION.md`):** Update status records. Apply last, after all functional changes and tests pass.

**Sequencing risks:**

- If step 1 is skipped and the definition is changed without signoff, streak values will be produced by an unapproved rule. This is the primary risk in this patch.
- Steps 2 and 3 must be atomic in the same commit or PR; a backend change without updated tests creates a window where the test suite is inconsistent.
- Step 4 must not be merged to a production-adjacent branch before step 3 is green; the frontend will attempt to render a live state that the backend may not yet return correctly.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

- `GET /user/progress` with a test session that has no persisted run data must return `streak.state = 'UNAVAILABLE'`, `current_streak_days: 0`.
- `GET /user/progress` with a test session that has N consecutive days of persisted run data must return `streak.state = 'LIVE'`, `current_streak_days: N`.
- `GET /user/progress` equity pulse and drawdown fields must be unchanged and match values from account telemetry contracts.
- Full PHP test suite (`test-phase2-trade-telemetry.php` and all sibling test files) must pass without new failures.
- Full frontend test suite (`src/routes/-progress.page.test.tsx` and `src/lib/api/sniperClient.test.ts`) must pass without new failures.
- TypeScript type-check must pass with zero new errors.

**Existing protections that must still hold:**

- `/user/progress` must remain behind `permission_user` authentication. Unauthenticated requests must return 401.
- `streak.state = 'UNAVAILABLE'` must remain the fallback when no run data is present.
- Equity pulse and drawdown must not be affected by any change in this patch.
- Frontend must not perform any streak calculation; it must only render what the API returns.
- MT5 and backend authority must not be diluted; no client-side or Pine signal may influence persisted run data or streak output.

**Parity re-validations required:**

- Backend `/user/progress` contract shape must remain identical to the contract documented in `.github/docs/BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md`. Field names, types, and response structure must not change.
- Dashboard progress page streak rendering must match the backend `streak` object exactly — no field aliasing or client-side transformation.

**Logging and diagnostics that must exist after the patch:**

- Backend must log the active-day definition constant in use at startup or on first `/user/progress` call, so it is auditable in server logs.
- If `read_progress_streak()` cannot find persisted run data for a user, it must log a debug-level entry (not an error) so unavailable state is traceable.

---

## 5. Non-goals

**Out of scope for this patch:**

- Any change to equity pulse, drawdown, or milestone logic.
- Any change to MT5 data ingestion, engine run recording, or account telemetry persistence.
- Any change to Pine scripts or trading formulas.
- Any change to authentication, permissions, or REST route registration.
- Any change to `src/lib/api/sniperClient.ts` or `src/hooks/useSniperData.ts` — the API client and hooks already handle the `streak` field; no change is needed there unless a field name change is discovered during implementation (and that would require re-evaluation).
- Backfilling historical streak data from records predating this patch.
- Building a UI for streak history, streaks leaderboard, or trend visualization.
- Adding the `active_day_rule_status` field proposed in Path B. Path B is explicitly rejected for this patch; the approved definition is a direct replacement of the `UNRESOLVED_REQUIRES_SIGNOFF` sentinel.
- Any change to `.github/docs/BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md` — it is a historical audit artifact.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not add streak trend history, rolling averages, or smoothing to `read_progress_streak()`. Any enrichment of the streak contract beyond the current schema is a scope expansion and must be a separate issue.
- Do not refactor the broader `smc-superfib-sniper.php` plugin while touching the active-day definition. The blast radius of a plugin refactor is too wide to combine with a governance-gate change.
- Do not migrate streak storage to a new database table or schema in this patch.
- Do not add client-side caching or optimistic rendering of streak state.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

The backend begins returning non-zero streak values computed from incorrect or incomplete persisted run data. Users see streaks that do not reflect real trading activity. Because the frontend renders backend truth directly, there is no client-side gate to catch this. The streak value would be wrong in a user-visible, confidence-affecting way and would persist until the backend is corrected and re-deployed.

**User-visible failure mode:**

Progress page displays a streak count that does not match the user's actual engine activity history, or displays a streak count when the backend is in a state where no valid activity exists. Alternatively, the "unavailable" message disappears but no streak count is shown, leaving a blank or broken UI element.

**Backend authority and stale-state risks:**

- If `ACTIVE_DAY_DEFINITION` is changed without confirming that the persisted engine run log is complete and correct, streak computation will be based on incomplete data. Partial run records or records from engine runs that were not fully completed could produce inflated or deflated streak counts.
- The `last_active_date` field must be sourced exclusively from the persisted run log. If any other source (MT5 timestamp, client clock, cached value) is used, stale-state corruption is possible.

**Whether human approval is required before merge:**

**Yes. Human approval is mandatory before merge.** The active-day business rule signoff is not a technical decision. The implementation agent must not merge or deploy this patch without explicit written confirmation from the authorized decision-maker that the definition is approved. This approval must be recorded in the commit message and referenced in `migration-status.md`.

---

## 7. Test requirements

**Tests to add:**

| Test file | Test case | Target area |
|---|---|---|
| `test-phase2-trade-telemetry.php` | `test_progress_streak_returns_live_state_with_consecutive_run_fixtures` | Backend `read_progress_streak()` with valid fixture data |
| `test-phase2-trade-telemetry.php` | `test_progress_streak_returns_unavailable_with_no_run_data` | Backend fallback — retain or update existing |
| `src/routes/-progress.page.test.tsx` | Render with `streak.state = 'LIVE'` and non-zero count | Frontend live-state rendering |

**Existing tests that must still pass:**

- All existing assertions in `test-phase2-trade-telemetry.php`: route registration, permission callback, authenticated access, degraded streak state.
- All existing assertions in `src/routes/-progress.page.test.tsx`: unavailable message rendering, no crash on unavailable state.
- All assertions in `src/lib/api/sniperClient.test.ts` relating to `/user/progress` response parsing.
- Full TypeScript compile and lint must pass.

**Soak, replay, parity, and live-environment verification:**

- After deployment to staging, a live call to `GET /user/progress` with a known test account that has persisted run data must be made and the response inspected manually against the expected streak count.
- A live call with a test account that has no run data must confirm `streak.state = 'UNAVAILABLE'`.
- `/health` and `/market-data-authority` must return healthy status after deployment to confirm no collateral damage to other routes.
- Equity pulse and drawdown values on the progress page must be spot-checked against known account telemetry values to confirm no regression.

---

## 8. Implementation handoff

**Branch naming recommendation:**

`codex/smc-intake-active-day-definition-signoff`

**Suggested commit grouping:**

1. `feat(backend): approve active-day definition and enable live streak computation` — covers `smc-superfib-sniper.php` changes only.
2. `test(backend): extend progress streak tests to cover live-state contract` — covers `test-phase2-trade-telemetry.php` additions.
3. `feat(frontend): render live streak state on progress page` — covers `src/routes/progress.tsx`.
4. `test(frontend): add live-state render test for progress streak` — covers `src/routes/-progress.page.test.tsx`.
5. `docs: record active-day definition approval in migration status and Phase 2 docs` — covers `migration-status.md` and `PHASE2_IMPLEMENTATION.md`.

**Required reports or artifacts to generate after implementation:**

- A post-implementation parity report confirming that the backend `/user/progress` response shape is unchanged from the contract documented in `BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md`, with the exception of the `streak.state` and `streak.current_streak_days` fields transitioning from degraded to live values.
- A staging validation log showing the raw JSON response of `GET /user/progress` for both the test-with-data and test-without-data accounts.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`

> Implementation may not begin until governance signoff on the active-day definition is obtained and recorded. Once signoff is confirmed, the implementation agent may proceed in the commit sequence above without further planning approval.
