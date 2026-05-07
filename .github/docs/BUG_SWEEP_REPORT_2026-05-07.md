# Executive Summary

- Overall health: stable on the audited Live Radar freshness path; one confirmed frontend/backend authority regression was found and patched.
- Bugs found: 1 confirmed medium-severity regression in `src/routes/live.tsx`.
- Fixes applied: removed client-side stale/live reclassification from Live Radar and simplified blocker warning severity selection.
- Remaining risks: repository-wide lint still fails on pre-existing mixed-line-ending/Prettier drift outside the patched file; broader fib/regime/signal replay was not rerun end-to-end in this pass.
- Migration readiness: ready for continued MT5-native phase-0 soak on the audited dashboard freshness path.

# Confirmed Problems

## Refresh And Stale-State

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| MEDIUM | `src/routes/live.tsx` Live Radar | The page locally recomputed staleness from `updatedAt`/browser time and filtered MT5 cards on the client even after the backend had already classified freshness. | Frontend could diverge from backend authority, hide backend-live MT5 cards, or mark cards stale locally when `age_sec` was absent or timestamp parsing drifted. | Does not block current phase, but degrades migration parity confidence. |

## Runtime / Tooling Observations

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| LOW | Workspace lint surface | Pre-existing CRLF/Prettier drift across multiple frontend files. | Full `npm run lint` remains noisy and unsuitable as a clean regression gate until formatting drift is normalized. | Not caused by this patch. |

# Surgical Fixes Applied

| File | Change | Hardening Added |
|---|---|---|
| `src/routes/live.tsx` | Removed `useUserSettings()`-driven stale-threshold math, removed timestamp parsing fallback, removed client-side MT5 card filtering based on browser-calculated age, and reduced inline blocker severity JSX into a single derived `diagLevel`. | Live Radar now trusts backend `price.state` and `regime.state` as the source of truth and cannot silently reclassify cards from local clock math. |

# Parity Verification Results

| Dimension | Scope | Result | Drift |
|---|---|---|---|
| Fib parity | Not replayed end-to-end in this run | No new fib logic changes applied | Unchanged / pending broader replay |
| Regime parity | Live Radar rendering path | Backend regime state is now rendered without extra client stale override | Drift removed on audited path |
| Signal parity | Live Radar blocker-warning severity path | Engine-blocker severity still passes through backend diagnostics; JSX logic simplified only | No new drift introduced |
| Freshness parity | Live Radar MT5 card inclusion + stale warning path | 100% backend-authoritative on the audited path after patch | Improved from drifting to aligned |

# Remaining Risks

- Full repository lint is still failing on pre-existing formatting drift in files outside the audited patch scope.
- The TanStack/Vite syntax errors seen in historical dev logs were not reproducible against the current `live.tsx`; they appear to have come from earlier transient file states.
- Broader Pine ↔ Backend ↔ MT5 signal/fib replay remains a separate follow-up and was not re-executed in this run.

# Regression Checklist

- Refresh tests: `src/routes/live.tsx` no longer derives freshness from client-side timestamp math.
- Stale detection tests: backend snapshot contract still passes and continues to expose MT5 freshness/engine blocker authority.
- Signal readiness tests: blocker severity rendering remains tied to backend diagnostics only.
- Backend sync tests: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- Parity verification tests: targeted Babel parse, targeted ESLint, and TypeScript compile passed for the patched path.

# Safe Deployment Order

1. Deploy the frontend patch in `src/routes/live.tsx`.
2. Re-run the dashboard against a live MT5 snapshot feed and confirm Live Radar card inclusion matches backend `price.state`.
3. Normalize existing formatting drift in a separate cleanup pass before restoring full-workspace lint as a release gate.

# Do Not Touch List

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` freshness/engine-blocker authority rules without a dedicated parity replay.
- Pine fib and signal formulas without proof of backend/MT5 parity corruption.
- Stale-data protections that currently gate non-fresh MT5 quotes and candles.

# Verification Evidence

- `npx eslint src/routes/live.tsx`
- `node .\node_modules\typescript\bin\tsc --noEmit`
- `php wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php`
