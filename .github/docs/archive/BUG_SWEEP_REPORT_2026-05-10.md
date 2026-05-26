# Executive Summary

- Overall health: stable in the audited scope after a confirmed frontend migration-authority bug was patched.
- Bugs found: 1 confirmed medium/high-impact dashboard settings defect on the backend switch path.
- Fixes applied: backend URL saves now persist to the current backend before live reads switch; backend URLs are trimmed and normalized consistently.
- Remaining risks: full workspace lint still fails on pre-existing formatting drift outside the touched files; Pine/MT5 fib, regime, and signal replay parity were not rerun end-to-end in this pass.
- Migration readiness: ready for continued phase-0 soak on the dashboard backend-switch path.

# Confirmed Problems

## Wiring And Data Authority

| Severity | Component | Root Cause | Impact |
| --- | --- | --- | --- |
| HIGH | `src/routes/account.tsx` settings save path | `saveSettings()` called `setBackendUrl()` before `postUserSettings()`, so a backend URL edit redirected the save request to the target backend instead of the current authority. | Backend migration settings could fail to persist, persist on the wrong host, or immediately refetch from an authority that did not own the just-saved config. |
| MEDIUM | `src/hooks/useSniperData.ts` / `src/lib/api/sniperClient.ts` backend URL normalization | Backend URLs were treated as truthy without trimming, and `useUserSettings()` only updated the in-memory client when the stored URL was non-empty. | Whitespace-only URLs could falsely mark the backend as ready, and empty stored URLs could leave the client pinned to a stale endpoint after reload. |

# Surgical Fixes Applied

| File | Exact hardening |
| --- | --- |
| `src/routes/account.tsx` | Normalized `backendUrl` on save, posted settings before switching live reads, cached the saved settings locally, skipped immediate `/user/settings` refetch when the backend authority changed, and only then switched the API client to the new backend. |
| `src/hooks/useSniperData.ts` | Normalized stored backend URLs, made `useBackendReady()` depend on trimmed values, and always synchronized the in-memory client from stored settings. |
| `src/lib/api/sniperClient.ts` | Added shared backend URL normalization and ensured `setBackendUrl()` trims input before falling back to the default backend. |

# Parity Verification Results

| Area | Result | Notes |
| --- | --- | --- |
| Fib parity | Unchanged | No fib logic changed in this pass. |
| Regime parity | Unchanged | No regime classification logic changed in this pass. |
| Signal parity | Unchanged | No signal generation or blocker rules changed in this pass. |
| Freshness/backend-authority parity | 100% on audited settings-switch path | Dashboard no longer changes write authority before persistence and no longer treats whitespace backend URLs as ready. |

# Remaining Risks

- Full-repo `npm run lint` remains red because of pre-existing formatting/line-ending drift in unrelated files.
- `npm run build` could not be executed in this sandbox because Vite/esbuild failed with `spawn EPERM`; runtime compile validation was limited to `npx tsc --noEmit`.
- No dedicated frontend test harness exists yet for the account settings migration path, so this run relies on typecheck plus code-path verification.

# Regression Checklist

- [x] Backend URL is trimmed before readiness checks and client switching.
- [x] Settings writes remain on the current backend authority during migration changes.
- [x] Immediate `/user/settings` refetch is suppressed when the backend URL changes, preventing wrong-authority overwrite.
- [x] `npx eslint src/lib/api/sniperClient.ts src/hooks/useSniperData.ts src/routes/account.tsx`
- [x] `npx tsc --noEmit`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`

# Safe Deployment Order

1. Deploy the frontend patch.
2. Open Account settings and save a backend URL change against a known current backend.
3. Confirm subsequent health/snapshot/signal reads switch to the target backend without losing the saved setting.
4. Continue normal MT5 phase-0 soak.

# Do Not Touch List

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` freshness and engine-blocker authority rules without a dedicated replay/parity run.
- `SMC_SuperFib_v13.1.3.pine` trading formulas without proof of parity corruption.
- MT5 freshness and candle timing modules without migration-specific regression coverage.
