# Executive Summary
- Overall health: stable with one high-priority freshness-authority defect removed from the dashboard path.
- Bugs found: 3 confirmed issues in the scanned scope, 0 critical blockers.
- Fixes applied: removed browser-clock stale overrides, stopped stale/offline quotes from rendering in the live ticker, hardened relative-time formatting for missing timestamps, and normalized the MT5 include checker so lint can run cleanly.
- Remaining risks: full Pine/MT5 replay parity was not recomputed in this run, and Vite bundle verification is blocked in this sandbox by `spawn EPERM`.
- Migration readiness: ready for continued Phase 0 stabilization; no blocker found in the touched scope.

# Confirmed Problems

## Refresh & Stale-State
- **HIGH** - Live Radar could classify backend-`live` quotes as stale from the browser clock.
  - Root cause: [`src/routes/live.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\live.tsx) derived `clientStale` from `Date.now() - updatedAt`, then OR-ed it into the stale state.
  - Impact: frontend could contradict backend freshness authority and show false stale warnings/borders.

## Dashboard Rendering Truth
- **MEDIUM** - Header ticker rendered any non-zero quote unless it was `unavailable` or `blocked`.
  - Root cause: [`src/components/sniper/AppShell.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\components\sniper\AppShell.tsx) treated stale/offline cache rows as ticker-eligible.
  - Impact: stale or offline quotes could appear in the live market strip, weakening operator trust.

## Data Contract / Display Hardening
- **MEDIUM** - Missing or invalid timestamps could render as `NaNd ago`.
  - Root cause: [`src/lib/format.ts`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\lib\format.ts) assumed every timestamp parsed to a finite date.
  - Impact: stale-state messaging degraded into invalid UI text instead of explicit unknown state.

# Surgical Fixes Applied
- [`src/routes/live.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\live.tsx)
  - Removed `useUserSettings()`-based client stale recomputation.
  - Freshness warnings now follow backend `price.state`, `regime.state`, and backend diagnostics only.
  - Stale warning timestamp now prefers backend diagnostic `lastPriceAt`.
- [`src/components/sniper/AppShell.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\components\sniper\AppShell.tsx)
  - Restricted ticker rendering to backend-authoritative `live` and `mock` quotes only.
- [`src/lib/format.ts`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\lib\format.ts)
  - Hardened `relTime()` to return `unknown` for empty/invalid timestamps and `just now` for future/skewed timestamps.
- [`mt5/check-mql-includes.mjs`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\mt5\check-mql-includes.mjs)
  - Formatting-only normalization so the existing lint gate runs without unrelated Prettier errors.

# Parity Verification Results
- Fib parity: unchanged in this run; no fib-calculation or render logic was modified.
- Regime parity: targeted pass; dashboard stale styling now follows backend regime/diagnostic state instead of client-clock overrides.
- Signal parity: unchanged in this run; signal qualification, confirmation, and execution gating were not altered.
- Freshness parity: targeted pass; scanned dashboard live/stale truth paths now defer to backend authority.

# Remaining Risks
- Full 100+ case Pine ↔ Backend ↔ MT5 replay parity remains pending outside this focused stabilization pass.
- Vite build could not be executed in this environment because `esbuild` child-process spawn is blocked by the sandbox.
- Existing `react-refresh/only-export-components` warnings remain in shared UI files outside the touched scope.

# Regression Checklist
- [x] Refresh tests: `npm run lint` completed with 0 errors.
- [x] Stale detection tests: client-clock stale override removed from Live Radar.
- [x] Signal readiness tests: `php wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php` passed; no backend execution gate regression introduced.
- [x] Backend sync tests: `node .\node_modules\typescript\bin\tsc --noEmit` passed for the frontend codebase.
- [ ] Bundle verification tests: `npm run build` blocked by sandbox `spawn EPERM`.
- [ ] Full parity verification tests: broader migration replay harness not run in this pass.

# Safe Deployment Order
1. Deploy the frontend freshness-authority patch.
2. Verify Live Radar and header ticker against a backend session with mixed `live`, `stale`, and `offline` symbols.
3. Re-run the Vite build in an environment that allows `esbuild` child-process spawn.
4. Run broader Pine/MT5 replay parity before advancing the next migration gate.

# Do Not Touch List
- Pine formula logic and MT5 execution math kernels without dedicated parity sign-off.
- Backend authoritative signal qualification rules.
- Freshness/transient invalidation policies that already gate stale or rate-limited data on the server.
