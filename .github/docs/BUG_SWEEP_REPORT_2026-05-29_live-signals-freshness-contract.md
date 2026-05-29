# Executive Summary

- Overall health: improved for the targeted live-signals freshness path.
- Bugs found: 1 confirmed HIGH stale-data contract defect across the origin response, client transport, and query cache layers.
- Fixes applied: `/live-signals` now emits anti-cache headers, the dashboard client now uses cache-busting `no-store` GETs, and the live-signals query no longer inherits the global 10 second stale window.
- Remaining risks: no authenticated runtime network capture was executed from this workspace, so deployed header behavior and one-poll UI freshness still require manual verification.
- Migration readiness: CONDITIONAL PASS for the targeted backend/dashboard freshness path.

# Confirmed Problems

| Severity | Component | Root cause | Impact | Status |
| --- | --- | --- | --- | --- |
| HIGH | Live-signals freshness contract | `/live-signals` returned a cacheable-looking success response, `apiClient.getLiveSignals()` did not opt into the existing `cacheBust` + `no-store` GET path, and `useLiveSignals()` inherited the global 10 second React Query stale window. | The dashboard could show stale backend-authoritative signals after the backend had already produced newer truth, especially across remounts, poll re-enable, browser cache, or intermediary cache layers. | Patched |

# Surgical Fixes Applied

- [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/smc-superfib-sniper.php:4758)
  - Preserved `ensure_engine_snapshot($user_id)` as the source of truth.
  - Added `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` to the successful live-signals response only.
- [`src/lib/api/sniperClient.ts`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/lib/api/sniperClient.ts:422)
  - Changed `apiClient.getLiveSignals()` to call `/live-signals` with `cacheBust: true`, which reuses the existing unique `_=` token and fetch `cache: "no-store"` behavior.
- [`src/hooks/useSniperData.ts`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/hooks/useSniperData.ts:106)
  - Set `staleTime: 0` on `useLiveSignals()` only, preserving the current query key and poll cadence.
- [`src/lib/api/sniperClient.test.ts`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/lib/api/sniperClient.test.ts:217)
  - Added regression coverage for the live-signals cache-bust token and `cache: "no-store"` fetch options.
- [`src/hooks/useSniperData.test.tsx`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/hooks/useSniperData.test.tsx:150)
  - Added regression coverage for `useLiveSignals()` query key, `enabled`, `staleTime: 0`, and preserved poll cadence.

# Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | PASS | Route-local header patch is syntactically valid. |
| `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx` | PASS | 2 files passed, 16 tests passed. |
| `npm run validate:impl` | PASS | Implementation report and workflow metadata validated successfully. |
| Authenticated live `/live-signals` network inspection | NOT RUN | Still required outside this workspace. |

# Remaining Risks

- A previously cached intermediary response may still persist until deploy propagation, cache expiry, or an operational purge.
- No authenticated browser verification was executed here, so origin headers and per-poll cache-bust tokens were not observed on deployed traffic.
- `/snapshot` versus `/live-signals` parity after a real backend update cycle remains a manual follow-up item.

# Regression Checklist

- [x] `get_live_signals()` still reads through `ensure_engine_snapshot($user_id)` and does not force recomputation.
- [x] `/live-signals` response body shape remained the same signal-array contract.
- [x] React Query global defaults in `src/router.tsx` were not changed.
- [x] Existing `useEngineHealth()` and `useUserProgress()` stale-time coverage stayed green.
- [x] Live-signals transport now has direct regression coverage.
- [ ] Authenticated deployed network verification completed.
- [ ] Real backend update-cycle parity between `/snapshot` and `/live-signals` confirmed.

# Do Not Touch List

- `ensure_engine_snapshot()`, `is_engine_snapshot_current()`, and `save_engine_snapshot()`.
- Backend signal math, Pine formulas, regime logic, and stale-threshold calculations.
- Global React Query defaults in `src/router.tsx`.
- Infrastructure cache configuration outside the codebase.
