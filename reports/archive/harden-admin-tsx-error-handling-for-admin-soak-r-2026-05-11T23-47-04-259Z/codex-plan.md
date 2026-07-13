# SMC SuperFIB - Hardened Implementation Contract

**Input artifact:** `reports/copilot-research.md`
**Output artifact:** `reports/codex-plan.md`

---

## 1. Issue validation

**Confirmed**

- `soakState.kind === "error"` is already set on initial load failure. The failure path exists but is structurally weak: it is visually scoped to the soak report panel only and does not propagate into the shared `panelError` message area. A user can land on a partially-failed admin page with no prominent signal that the soak report failed to load.
- `refreshSoakReport()` sets `panelError` on refresh failure, but the initial `useEffect` load does not. This asymmetry means the first-load failure is silently less visible than a manual refresh failure — a direct inconsistency.
- The error text on initial load failure contains a raw API error string with no retry affordance. This is a UX gap, not a logic gap.

**Likely**

- `fetchAdminHealth()` failure collapses auth denial and general backend failure into the same `denied` state, which produces misleading UI when health check fails for a non-auth reason. The research report identifies this as a related gap. It is likely present but is a secondary issue to the soak report focus.

**Unconfirmed**

- That `admin.soak-report.tsx` is causing any user-visible failure. The route redirects to `/admin` in `beforeLoad`, which means the real soak report workspace is always `admin.tsx`. The redirect is consistent with this being an intentional design choice. No evidence it is broken or causing silent failures.
- That malformed/empty API responses are occurring in production. The research report notes `call()` throws a generic error on empty payload — this is a theoretical risk, not an observed failure.

**Corrected root cause (refined from report):** The soak report failure path exists but is underspecified: initial load errors are not promoted to `panelError`, there is no retry affordance on initial load failure, and the error message text is not user-facing quality. This produces silent-looking failures on first page load.

---

## 2. Implementation contract

### File 1: `src/routes/admin.tsx`

**Function/section:** `useEffect` that calls `fetchSoakReport()` on mount (initial load effect), and the JSX block that renders the soak report panel when `soakState.kind === "error"`.

**Exact changes required:**

1. In the `useEffect` catch block for `fetchSoakReport()` (initial load path only): after setting `soakState` to `{ kind: "error", message }`, also call `setPanelError(message)` so the shared panel message area reflects the failure. This mirrors the existing behavior in `refreshSoakReport()`.

2. In the JSX conditional for `soakState.kind === "error"`: replace or supplement the existing error presentation with:
   - A clearly labelled message: `"Soak report failed to load."` followed by the raw error message in a secondary line or details element.
   - A retry button that calls `refreshSoakReport()` (this function already exists; connect it here).

3. In `refreshSoakReport()`: confirm it already sets both `soakState` and `panelError`. If the existing `refreshSoakReport()` sets only one, align it to set both. This is a consistency guard, not a new behaviour.

**Guard rails — must not change:**

- Do not alter the `soakState` type shape or its `kind` discriminant values (`loading`, `error`, `ready`).
- Do not alter `fetchSoakReport()` in `sniperClient.ts`.
- Do not alter the `AuthError` catch branch; auth errors must continue to navigate to `/login` without touching `panelError` or `soakState`.
- Do not alter the `ready` or `loading` render branches.
- Do not remove or rename `panelError` or `setPanelError`.
- Do not introduce new state fields.

**Why this file is in scope:** It is the only file that renders the soak report UI and owns the fetch lifecycle. All reported gaps are in this file's error handling paths.

**Acceptance criterion:** When `fetchSoakReport()` rejects on initial page load, the shared panel message area displays the error and a retry button is visible in the soak report section. On retry success, both `panelError` and `soakState` return to their non-error states.

---

### File 2: `src/routes/admin.soak-report.tsx`

**Function/section:** `beforeLoad` redirect.

**Exact change required:** Add a code comment explicitly documenting that the redirect to `/admin` is intentional and that the soak report workspace lives in `admin.tsx`. No logic change.

**Guard rails — must not change:**

- The redirect itself must not be removed or modified.
- Do not add any rendering logic to this route.

**Why this file is in scope:** The research report flags it as suspicious. A one-line comment resolves the ambiguity and prevents a future agent from removing the redirect under the assumption it is a bug.

**Acceptance criterion:** File contains an inline comment clarifying the redirect intent. No behavior change.

---

## 3. Patch sequence

1. **`src/routes/admin.tsx` — initial load `useEffect` catch block**: Add `setPanelError(message)` call. No dependencies. Apply first.

2. **`src/routes/admin.tsx` — soak error JSX**: Replace raw error text with labelled message and retry button wired to `refreshSoakReport()`. Depends on step 1 being applied in the same file (same PR, sequential edit within the file).

3. **`src/routes/admin.tsx` — `refreshSoakReport()` consistency check**: Verify and if needed align so both `soakState` and `panelError` are always set together. Apply as part of the same file edit pass.

4. **`src/routes/admin.soak-report.tsx` — comment**: Apply last, independently. No sequencing dependency.

**Sequencing risk:** None of these changes touch state shape, API contracts, or routing logic. No migration or cache sequencing risk. All changes are local to the admin page component tree.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

- Manual smoke: load `/admin` with a mocked or real backend returning a non-200 on `/admin/soak-report`. Confirm `panelError` message appears and retry button is visible.
- Manual smoke: load `/admin` with a healthy backend. Confirm no regressions in the `ready` state rendering (data still displays, no phantom error messages).
- Manual smoke: trigger a refresh failure via `refreshSoakReport()`. Confirm both `panelError` and `soakState` are set to error state.
- Navigate to `/admin/soak-report` directly. Confirm redirect to `/admin` still fires without error.

**Existing protections that must still hold:**

- `AuthError` on `fetchSoakReport()` must still navigate to `/login` and must not set `panelError`.
- `AuthError` on `fetchAdminHealth()` must still produce the access-denied state.
- The `loading` spinner must still render while `soakState.kind === "loading"`.

**Parity re-validations:** None required. This patch touches only frontend error presentation; no Pine, MT5, or backend parity surface is affected.

**Logging/diagnostics after patch:** No new logging is required. The existing error message propagation from `call()` (which includes HTTP path and status) is sufficient. Do not add `console.error` calls.

---

## 5. Non-goals

- Fixing `fetchAdminHealth()` conflating auth denial with general backend failure. Identified as a related gap; excluded from this patch to contain scope. A separate issue should be filed.
- Adding a dedicated rendering route at `admin.soak-report.tsx`. The redirect is intentional; no new route component.
- Changing the `SoakReport` type shape or API contract.
- Adding optimistic UI, loading skeleton improvements, or any visual polish beyond the retry button and explicit error label.
- Modifying `sniperClient.ts` in any way.
- Adding global error boundaries or toast notification systems.
- Addressing malformed/empty API response handling in `call()` — theoretical risk, not observed failure, out of scope.
- Any changes to backend endpoints, MT5 feeds, or Pine scripts.

---

## 6. Risk assessment

**Worst-case failure if patched incorrectly:** `setPanelError` is called unconditionally inside the `AuthError` catch branch, which causes a stale error message to persist after redirect to `/login`. This is guarded against in the implementation contract (guard rails, step 1).

**User-visible failure mode:** If the retry button calls the wrong function or clears state incorrectly, the page could appear to recover while leaving `soakState` in an inconsistent intermediate state. Mitigation: the retry button must call the existing `refreshSoakReport()` exactly — no new function, no inline lambda that duplicates fetch logic.

**Backend authority risk:** None. This patch makes no API or data-flow changes. Backend remains the sole authority for soak report data.

**Stale-state risk:** Low. `setPanelError` is already used in `refreshSoakReport()`; adding it to the initial load path follows the existing pattern.

**Human approval before merge:** Recommended for review but not blocking. The change is small, additive, and limited to error presentation. A standard PR review is sufficient; no escalated approval needed.

---

## 7. Test requirements

**Tests to add:**

- `src/routes/admin.tsx` component test (new): simulate `fetchSoakReport()` rejecting with a non-auth error on initial mount. Assert:
  - `panelError` state contains the error message.
  - The soak report section renders the labelled failure message.
  - A retry button is rendered.
  - Clicking the retry button calls `refreshSoakReport()`.

- `src/routes/admin.tsx` component test (new): simulate `fetchSoakReport()` rejecting with `AuthError`. Assert:
  - Navigation to `/login` is triggered.
  - `panelError` is not set.

**Existing tests that must still pass:**

- All existing tests in `src/lib/api/sniperClient.test.ts` must pass unchanged. This patch does not touch `sniperClient.ts`.
- Any existing `admin.tsx` render or integration tests must pass unchanged.

**Soak/parity/live verification:** Not required for this patch. The change is presentation-only and does not affect signal generation, data flow, or cross-system contracts.

---

## 8. Implementation handoff

**Branch naming:** `fix/admin-soak-report-error-visibility`

**Suggested commit grouping:**

- Commit 1: `fix(admin): promote soak report initial load error to panelError and add retry affordance` — contains all changes to `src/routes/admin.tsx`.
- Commit 2: `chore(admin.soak-report): document intentional redirect` — contains the comment-only change to `src/routes/admin.soak-report.tsx`.

**Required artifacts after implementation:**

- PR body must include: summary of the silent failure issue, root cause (asymmetric `panelError` promotion), exact files changed, regression protections verified, parity impact (none), do-not-touch list (sniperClient.ts, AuthError branch, MT5, Pine, backend).

**State transition:** `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
