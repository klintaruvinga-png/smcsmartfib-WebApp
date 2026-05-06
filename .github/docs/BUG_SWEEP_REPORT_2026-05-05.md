# Executive Summary
- Overall health: stable in the touched scope after removing two refresh-authority defects that could leave chart truth behind backend truth.
- Bugs found: 2 confirmed issues in active code paths, 0 critical blockers.
- Fixes applied: chart snapshots now expose the last authoritative candle timestamp instead of response time, and forced engine refresh now invalidates chart queries alongside snapshot/signal/health caches.
- Remaining risks: broader Pine/Backend/MT5 replay parity was not recomputed in this run, Vite bundle verification remains blocked in this sandbox, and the standalone market-data service still contains an inactive receipt-time timestamp path that should stay under watch if that service becomes a write path.
- Migration readiness: ready for continued Phase 0 stabilization; no blocker found in the patched scope.

# Confirmed Problems

## Refresh & Stale-State
- **HIGH** - `/charts` could report fetch time as `updatedAt` even when the newest candle was older.
  - Root cause: [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\smc-superfib-sniper.php) returned `gmdate('c')` from `get_chart_snapshot()` instead of the last candle timestamp.
  - Impact: chart consumers could display fake freshness or misleading "last updated" metadata while the backend correctly considered the candle set stale.

## Refresh Wiring
- **MEDIUM** - forced engine refresh did not invalidate active chart queries.
  - Root cause: [`src/hooks/useSniperData.ts`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\hooks\useSniperData.ts) invalidated snapshot, signals, health, and ladders, but omitted the `["chart"]` cache family.
  - Impact: after a manual backend refresh, the charts page could lag behind newly recomputed candles/fibs until the next polling cycle or explicit chart-page refetch.

# Surgical Fixes Applied
- [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\smc-superfib-sniper.php)
  - Hardened `get_chart_snapshot()` so `updatedAt` reflects the newest candle time and stays `null` when no candles exist.
  - Preserved existing `state` logic so the patch only fixes timestamp truth, not freshness classification rules.
- [`src/hooks/useSniperData.ts`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\hooks\useSniperData.ts)
  - Added `["chart"]` invalidation to the forced engine batch mutation so chart consumers refetch after a backend recomputation.
- [`wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php)
  - Added a regression assertion that chart `updatedAt` matches the last returned candle time.

# Parity Verification Results
- Fib parity: unchanged mathematically; forced refresh now refreshes chart fib overlays in step with backend recomputation.
- Regime parity: unchanged mathematically; no regime classification rules were touched.
- Signal parity: unchanged mathematically; signal generation logic was not modified.
- Freshness parity: improved to backend-authoritative in the chart contract path; `updatedAt` no longer drifts to browser/server fetch time.

# Remaining Risks
- The broader replay matrix across Pine, MT5, backend engine state, and dashboard rendering still needs a dedicated post-patch parity pass.
- `npm run build` was not runnable in this sandbox because `esbuild` child-process spawn remains blocked (`spawn EPERM` on prior runs).
- [`wordpress/smc-superfib-sniper/class-market-data-service.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\class-market-data-service.php) still writes receipt time in `store_tick_snapshot()`, but that function is not the confirmed live ingest path in this run.

# Regression Checklist
- [x] Refresh tests: forced engine batch now invalidates chart queries.
- [x] Stale detection tests: chart contract now returns last candle time instead of response time.
- [x] Signal readiness tests: `php wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php` passed.
- [x] Backend sync tests: `php wordpress\smc-superfib-sniper\tests\php\test-ea-market-stream.php` passed.
- [x] Frontend contract tests: `node .\node_modules\typescript\bin\tsc --noEmit` passed.
- [x] Lint gate: `npm run lint` passed with 0 errors and 6 pre-existing `react-refresh/only-export-components` warnings.
- [ ] Bundle verification: `npm run build` not rerun here because this sandbox blocks `esbuild` process spawn.
- [ ] Full parity replay: not executed in this focused stabilization pass.

# Safe Deployment Order
1. Deploy the WordPress chart contract patch.
2. Deploy the frontend query invalidation patch.
3. Manually force refresh from Live Radar, then open Charts and verify the returned candle timestamp changes with the recomputed backend state.
4. Re-run bundle/build verification outside the sandbox.
5. Fold this patch into the next multi-engine replay parity gate.

# Do Not Touch List
- Pine fib formulas and MT5 signal math without a dedicated replay/parity sign-off.
- Backend stale-protection rules that distinguish quote-time from fetch-time.
- Engine-run cache/transient invalidation policies beyond the targeted chart invalidation added here.
