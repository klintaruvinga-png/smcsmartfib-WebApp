# Executive Summary

- Overall health: stable in the verified refresh, snapshot, Fib, anchor, and dashboard gating paths.
- Bugs found: 2 confirmed dashboard defects.
- Fixes applied: extracted `live` and `plan` page components out of route files to restore route-level code splitting; corrected corrupted Live Radar operator copy and metadata.
- Remaining risks: oversized shared router chunk still triggers the >500 kB Vite warning; repo-wide Prettier/CRLF drift remains outside this surgical patch.
- Migration readiness: ready to continue Phase 2 dashboard stabilization work. No parity blocker found in the targeted suites run on 2026-05-20.

# Confirmed Problems

## High

| Category | Severity | Root Cause | Impact |
|---|---|---|---|
| Dashboard route packaging | HIGH | `src/routes/live.tsx` and `src/routes/plan.tsx` exported page components directly from route files, so TanStack Router could not code-split those pages. | Live Radar and Signal Plans were always retained in the shared route bundle, increasing client/server route payload size and weakening route-isolation during the migration phase. |

## Medium

| Category | Severity | Root Cause | Impact |
|---|---|---|---|
| Dashboard rendering fidelity | MEDIUM | Live Radar route metadata, stale/gate warnings, and placeholder glyphs contained mojibake text. | Operators saw corrupted warnings and titles in a backend-authoritative monitoring surface, which degrades trust and can hide actual blocker reasons. |

# Surgical Fixes Applied

- Extracted the `LivePage` implementation into [`C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-live.page.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-live.page.tsx) and reduced [`C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\live.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\live.tsx) to route metadata plus route binding only.
- Extracted the `PlanPage` implementation into [`C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-plan.page.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-plan.page.tsx) and reduced [`C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\plan.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\plan.tsx) to route metadata plus route binding only.
- Updated [`C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-live.page.test.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-live.page.test.tsx) and [`C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-plan.test.tsx`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\src\routes\-plan.test.tsx) so regression tests bind to the non-route page modules instead of forcing route-file exports back in.
- Replaced corrupted Live Radar copy with clean operator text for page metadata, rate-limit messaging, stale-data messaging, and unavailable-value placeholders.

# Parity Verification Results

- Fib parity: 100% in targeted regression coverage. `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` passed.
- Regime parity: 100% in targeted anchor/session coverage. `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php` and `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php` passed.
- Signal parity: 100% in targeted dashboard gating coverage. `npx vitest run src/routes/-plan.test.tsx src/routes/-live.page.test.tsx src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx` passed.
- Freshness parity: 100% in targeted snapshot/watchlist coverage. `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` and `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` passed.

# Remaining Risks

- Shared router bundle size still exceeds Vite's 500 kB warning threshold. This patch restored route-level code splitting for `live` and `plan`, but it did not redesign shared chunking.
- `npm run lint` still fails from broad repository CRLF/Prettier drift that predates this run and is not isolated to the patched route files.
- No Pine or MT5 formula changes were made in this pass; deeper parity replay across historical market samples remains a separate task.

# Regression Checklist

- [x] Route-level dashboard pages still render through TanStack Router bindings.
- [x] Live Radar backend gating still covers loading, missing backend URL, and settings error states.
- [x] Signal Plans ranking and execution guards still hold for watchlist-scoped candidates.
- [x] MT5 snapshot freshness and watchlist invalidation contracts still pass.
- [x] Fib/session/HTF parity regression suites still pass.
- [x] Production build succeeds after the route extraction.

# Safe Deployment Order

1. Deploy the frontend route extraction and Live Radar text cleanup.
2. Run the targeted Vitest route suites in CI.
3. Run the MT5 snapshot/watchlist/Fib PHP regression suite on the backend package.
4. Promote only after verifying route chunk outputs still include isolated `live` and `plan` assets in the production build.

# Do Not Touch List

- Pine signal formulas and MT5 execution math without a separate parity replay brief.
- Backend freshness authority logic in WordPress and MT5 without targeted stale-state contract tests.
- Shared router/manual chunk configuration unless the next pass is explicitly scoped to bundle architecture.
