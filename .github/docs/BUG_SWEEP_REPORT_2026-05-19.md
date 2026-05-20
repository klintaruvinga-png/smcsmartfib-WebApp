# Executive Summary

| Item | Value |
|---|---|
| Report Date | 2026-05-19 |
| Phase | Phase 1 - MT5 Bridge Infrastructure |
| Scanner | Codex automation - `code-bug-fix-and-cleanup` |
| Scan Duration | 2026-05-19 06:29-06:44 SAST |
| Branch | `codex/smc-intake-chart-ticker-and-live-polling-is-brok` |
| Overall Health | STABLE |
| Bugs Found | 2 |
| Fixes Applied | 2 surgical fixes |
| Remaining Risks | Warning-only lint debt and route export test warnings |
| Migration Readiness | Phase 1 dashboard polling surface hardened; backend/MT5 parity unchanged |

Summary:
- Confirmed and patched a backend-authority UI defect where disabled polling queries could leave the dashboard in misleading states during settings resolution or when no backend URL was configured.
- Hardened backend-dependent routes so `live`, `signals`, `plan`, and `book` now distinguish between `settings pending`, `backend not configured`, and `awaiting first backend payload`.
- Normalized the active prettier drift that had pushed `npm run lint` into error state; lint is now warning-only again.

# Confirmed Problems

| Severity | Category | Issue | Root Cause | Impact |
|---|---|---|---|---|
| HIGH | Refresh / stale-state UI truth | Disabled polling queries rendered false loading or empty/offline states on backend-dependent routes | `useSnapshot`/`useLiveSignals`/`useLadders` are intentionally disabled until user settings resolve and a backend URL exists, but route rendering treated `data === undefined` as if a fetch was actively loading or genuinely empty | Operators could misread backend-disabled state as a live refresh stall or "no data" condition during migration validation |
| MEDIUM | Tooling / regression visibility | Prettier drift across active source files caused `npm run lint` to fail hard | Recent edits introduced line-wrap and EOL drift in active frontend/script files | CI/local verification lost signal by failing on formatting noise before real logic regressions |

# Root Cause / Analysis

1. `src/hooks/useSniperData.ts` already enforces the correct runtime rule: polling must not start until settings are loaded and a canonical backend URL exists.
2. Several routes consumed disabled queries without consuming that gating state.
3. On cold load or missing backend configuration:
   - [`src/routes/live.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/live.tsx) could sit on a permanent `Loading radar...` branch.
   - [`src/routes/signals.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/signals.tsx), [`src/routes/plan.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/plan.tsx), and [`src/routes/book.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/book.tsx) could render misleading empty/offline states even though no backend fetch had been attempted.
4. This was a frontend truth defect, not a backend/MT5 contract defect. No Pine, MT5, PHP, or REST formulas changed.

# Surgical Fixes Applied

| File | Change |
|---|---|
| [`src/hooks/useSniperData.ts`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/hooks/useSniperData.ts) | Exported `usePollingUiState()` so route layers can consume the same backend/pending/poll cadence gate already used by polling hooks |
| [`src/routes/live.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/live.tsx) | Added explicit branches for `pending settings`, `backend missing`, and `awaiting first snapshot` |
| [`src/routes/signals.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/signals.tsx) | Added backend configuration guard without weakening hook ordering |
| [`src/routes/plan.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/plan.tsx) | Added backend configuration guard before plan-empty diagnostics render |
| [`src/routes/book.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/book.tsx) | Added backend configuration and pending-settings guard so "No open positions" is not shown for an unfetched backend |
| [`src/hooks/useSniperData.test.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/hooks/useSniperData.test.tsx) | Added regression tests for pending-settings and backend-missing polling state |
| [`src/routes/-live.page.test.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/-live.page.test.tsx) | Added route-level regression coverage for live radar gating |
| [`scripts/pipeline-watcher.js`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/scripts/pipeline-watcher.js), [`scripts/reset-pipeline.js`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/scripts/reset-pipeline.js), [`src/components/PlanCard.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/components/PlanCard.tsx), [`src/hooks/useTickFlash.ts`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/hooks/useTickFlash.ts), [`src/routes/charts.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/charts.tsx), [`src/types/sniper.ts`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/types/sniper.ts) | Prettier normalization only; no logic changes |

Regression protections added:
- Hook-level state contract tests verify polling stays disabled while settings are unresolved and reports backend-not-ready after settings resolve without a URL.
- Route-level test verifies live radar shows the configuration guard instead of false loading.
- Existing plan/watchlist/chart tests still pass after the route-guard change.

# Parity Verification Results

| Surface | Result | Notes |
|---|---|---|
| Freshness authority parity | PASS - 100% on audited route gating | Routes now mirror the same backend-ready and pending-settings truth already enforced by polling hooks |
| Signal parity | PASS - carry-forward | No backend signal generation logic changed |
| Regime parity | PASS - carry-forward | No regime or chop formulas changed |
| Fib parity | PASS - carry-forward | No fib anchors/levels changed |
| REST payload integrity | PASS - carry-forward | No REST schema changes |

# Acceptance Criteria

- `live` must not show a permanent loading state when no backend URL is configured.
- `signals`, `plan`, and `book` must not show misleading empty/offline states before backend polling is eligible to start.
- Backend authority rules in `useSniperData` must remain unchanged.
- `npm run lint` must complete without errors.
- Targeted regression tests for polling UI state must pass.

# Regression Checklist

- [x] `npx vitest run src/hooks/useSniperData.test.tsx src/routes/-live.page.test.tsx src/routes/-live.test.ts src/routes/-plan.test.tsx src/hooks/useSniperData.watchlist.test.tsx src/routes/-charts.test.ts`
- [x] `npm run lint` -> warnings only, 0 errors
- [x] `npm run build`
- [x] Backend authority preserved; no Pine/MT5/PHP signal math changed
- [x] Dashboard route gating aligned with disabled-query contract

# Remaining Risks

- `react-refresh/only-export-components` warnings remain in shared UI route/component files; these are pre-existing and non-blocking.
- `react-hooks/exhaustive-deps` warnings remain in [`src/hooks/useAnimatedNumber.ts`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/hooks/useAnimatedNumber.ts) and [`src/routes/__root.tsx`](C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/routes/__root.tsx).
- Test-only route export warnings remain for `LivePage` and `PlanPage`; this does not affect production build output.

# Safe Deployment Order

1. Deploy frontend/dashboard bundle only.
2. Smoke test `/live`, `/signals`, `/plan`, and `/book` with:
   - no backend URL configured
   - backend URL configured but cold-start settings load
   - backend configured with valid data
3. Confirm no change in MT5/PHP payloads or signal calculations.

# Do Not Touch List

- MT5 quote timestamp authority
- PHP stale-data rejection thresholds
- Backend signal confirmation rules
- Pine/MT5 fib and regime formulas
