# Copilot Research: Harden admin.tsx error handling for /admin/soak-report

## Issue
Harden `src/routes/admin.tsx` error handling for `/admin/soak-report` so failures surface explicitly and the Phase 0 soak report UI does not fail silently.

## Relevant code paths

- `src/routes/admin.tsx`
  - Loads admin health and soak report data in separate effects.
  - `fetchSoakReport()` is called inside a `useEffect` and any non-auth error sets `soakState` to `{ kind: "error", message }`.
  - The soak report UI renders one of three states: `loading`, `error`, or `ready`.
  - There is also a shared `panelError` state used for submit/refresh failures.
- `src/lib/api/sniperClient.ts`
  - `fetchSoakReport()` calls `call<SoakReport>("/admin/soak-report", { cacheBust: true })`.
  - `call()` throws on HTTP non-ok responses and on missing response payloads.
  - `AuthError` is explicitly thrown for `401` and handled separately by navigation to `/login`.
- `src/routes/admin.soak-report.tsx`
  - This route currently redirects from `/admin/soak-report` back to `/admin` in `beforeLoad`, so direct navigation to `/admin/soak-report` never renders a dedicated route component.

## Findings

1. `soakState` error handling already exists in `admin.tsx` but may not be sufficiently explicit or consistent for direct failure visibility.
   - Initial load errors set `soakState.kind = "error"`.
   - The UI renders an error box when `soakState.kind === "error"`.
   - However, the error path is limited to the soak report section and may be easy to miss without a stronger banner or retry affordance.

2. `panelError` is only set for action/refresh failures, not for the initial soak report load error.
   - This means first-page load failures are shown in the soak report panel but not in the shared message area, reducing visibility.

3. There is a separate health page error handling gap.
   - `fetchAdminHealth()` failures set `state.kind = "denied"`, which displays an access-denied message even for non-auth failures.
   - That is a broader issue in the admin page and may compound confusion when soak report failures happen concurrently.

4. The `admin.soak-report.tsx` redirect is suspicious.
   - If the target issue is about `/admin/soak-report`, this route-level redirect may be preventing a direct dedicated soak report route from being used.
   - The real soak report workspace lives in `admin.tsx`, not in the redirected route.

## Risk areas

- `fetchSoakReport()` currently surfaces backend errors as thrown `Error` objects with API path and status, which is good.
- The UI may still look like a normal admin page with only the soak section failing, so a user could miss that backend retrieval failed.
- The admin page does not offer an explicit retry button for the soak report on initial load.
- If the server returns a malformed or empty response, `call()` throws a generic error and the page only shows the raw message.

## Recommended hardening changes

1. In `src/routes/admin.tsx`:
   - Set `panelError` for the initial soak report load failure and/or render a persistent failure banner in the soak report workspace.
   - Prefer a stronger error presentation for `soakState.kind === "error"`, including a visible retry control and explicit text like "Soak report loading failed.".
   - Ensure `refreshSoakReport()` always updates both `soakState` and `panelError` with the same message.

2. Improve admin health error semantics:
   - Distinguish auth denial from backend load failure when `fetchAdminHealth()` fails.
   - Avoid showing access-denied UI for non-auth failures.

3. Review `src/routes/admin.soak-report.tsx`:
   - Decide whether `/admin/soak-report` should still redirect to `/admin` or if it should render a dedicated route.
   - If the route is intentionally deprecated, keep it but document the behavior.

4. Add regression coverage:
   - A unit test for `fetchSoakReport()` error propagation already exists in `src/lib/api/sniperClient.test.ts`.
   - Add a component test for `admin.tsx` that verifies initial soak report load failure shows the error message and retry affordance.

## Summary

The main surface is `src/routes/admin.tsx` with separate admin health and soak report fetch flows. The soak report failure path is already present but can be hardened by making initial failures more visible, by promoting load errors into the shared panel, and by clarifying route-level behavior for `/admin/soak-report`.
