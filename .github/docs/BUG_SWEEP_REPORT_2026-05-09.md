# Executive Summary

- Overall health: stable on the audited charts route after patch; one confirmed high-severity dashboard migration blocker and one medium-severity backend-authority drift were found on the charts path.
- Bugs found: 2 confirmed issues on `src/routes/charts.tsx`, both remediated in this run.
- Fixes applied: completed the chart-route merge back onto the `lightweight-charts` implementation, restored a resolvable lockfile/install state for the declared dependency, and kept chart polling gated on configured backend readiness.
- Remaining risks: full-workspace lint still fails on pre-existing CRLF/Prettier drift outside the audited scope; fib/regime/signal replay parity was not rerun end-to-end in this pass.
- Migration readiness: ready for continued phase-0 soak on the chart rendering and refresh path.

# Confirmed Problems

## Runtime And Stability

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| HIGH | `src/routes/charts.tsx` production chart route | The merge-resolved route depended on `lightweight-charts`, but the local workspace lockfile/install state did not contain a resolvable package entry, causing `vite build` to fail. | Production build blocked; migration packaging could not complete. | Blocks deployment until patched. |

## Wiring And Freshness Authority

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| MEDIUM | `src/routes/charts.tsx` chart query wiring | The chart query used `pollMs !== null` as its only gate and bypassed shared `backendReady` authority checks. | Charts could call the default backend before the user-configured backend was ready, creating backend-authority drift and misleading refresh behavior. | Does not block phase transition after patch, but undermines migration trust if left unpatched. |

## Runtime / Tooling Observations

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| LOW | Workspace lint surface | Pre-existing mixed line endings and formatting drift across unrelated files. | `npm run lint` remains noisy and is not yet a reliable global regression gate. | Not caused by this patch. |

# Surgical Fixes Applied

| File | Change | Hardening Added |
|---|---|---|
| `src/routes/charts.tsx` | Resolved the merge back onto the `lightweight-charts` render path while preserving backend-readiness gating and the backend-provided fib overlay behavior. | Keeps the shipping chart implementation, restores pan/zoom/axis-scale behavior, and avoids frontend fib recalculation drift. |
| `src/routes/charts.tsx` | Added a backend-readiness gate and disabled polling until the configured backend URL exists. | Prevents early requests against the default backend and keeps chart refresh behavior aligned with shared backend-authority rules. |
| `package-lock.json` | Synced the lockfile to include the already-declared `lightweight-charts` dependency and its transitive `fancy-canvas` package. | Makes the resolved chart route installable/buildable in a clean workspace instead of relying on undeclared local state. |

# Parity Verification Results

| Dimension | Scope | Result | Drift |
|---|---|---|---|
| Fib parity | Dashboard chart fib overlay rendering | Backend fib levels render unchanged; no fib-calculation logic changed | No new drift introduced |
| Regime parity | Out of scope for this pass | No regime logic change | Unchanged / pending broader replay |
| Signal parity | Out of scope for this pass | No signal logic change | Unchanged / pending broader replay |
| Freshness parity | Chart polling/readiness path | 100% backend-authoritative on the audited path after patch | Improved from drifting to aligned |

# Remaining Risks

- Full repository lint still fails on unrelated formatting drift and should be normalized separately.
- The restored `lightweight-charts` path now builds cleanly, but chart-route bundle/runtime weight should still be watched during soak.
- Pine to backend to MT5 replay parity for fib anchors, regime classification, and signal generation remains a separate follow-up outside this route-level fix.

# Regression Checklist

- Refresh tests: chart polling remains disabled until `backendUrl` is configured.
- Stale detection tests: chart state still renders from backend freshness without client-side freshness overrides.
- Signal readiness tests: no signal-engine behavior or gating was changed.
- Backend sync tests: the chart query now follows the same readiness contract as the rest of the dashboard data hooks.
- Parity verification tests: targeted route lint passed and full production build passed.

# Safe Deployment Order

1. Deploy the frontend patch for `src/routes/charts.tsx` together with the synced `package-lock.json`.
2. Validate the Charts page with a configured backend and confirm candle/fib data loads only after settings are available.
3. Run a separate formatting cleanup before restoring `npm run lint` as a deployment gate.

# Do Not Touch List

- `wordpress` freshness and signal-authority rules without a dedicated parity replay.
- Pine fib/signal formulas without proof of backend or MT5 parity corruption.
- Existing stale protections that intentionally block non-fresh quotes/candles.

# Verification Evidence

- `npx eslint src/routes/charts.tsx`
- `npm run build`
- Pre-patch failure reproduced: unresolved `lightweight-charts` import caused by missing local lockfile/install state
