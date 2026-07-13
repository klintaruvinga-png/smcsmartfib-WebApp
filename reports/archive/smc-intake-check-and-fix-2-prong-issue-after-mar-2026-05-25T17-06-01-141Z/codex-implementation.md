# Issue summary

Patched the post-weekend signal-gate failure at the MT5 session boundary, added a backend stale-CLOSED read override so Monday-open state does not stay stuck offline behind the transient cache, and hardened frontend watchlist comparisons against broker symbol suffix variants so the watchlist toggle does not miss valid backend candidates.

# Root cause implemented

Implemented the contract’s two-layer fix path: `mt5/SessionManager.mqh` now reopens the FX weekend session at Sunday 21:00 UTC instead of leaving non-crypto symbols CLOSED through Monday until a fresh tick arrives, and `class-market-data-service.php` now reinterprets stale `CLOSED -> offline` snapshots as `stale` on read once broker-time indicates the market should be open. On the frontend, watchlist comparisons now normalize broker suffix variants locally before `watchlistSet.has(...)`, without changing stored watchlist values or API payloads.

# Exact files changed

- `mt5/SessionManager.mqh`
- `mt5/SessionManagerWeekendClassificationTest.mq5`
- `mt5/SessionManager_test.mq5`
- `wordpress/smc-superfib-sniper/class-market-data-service.php`
- `wordpress/smc-superfib-sniper/tests/php/test-ea-bridge-bootstrap.php`
- `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- `src/hooks/useSniperData.ts`
- `src/hooks/useSniperData.test.ts`
- `src/routes/signals.tsx`
- `src/routes/signals.test.tsx`
- `reports/codex-implementation.md`

# Tests run

- `npm run check:mql`
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- `npx vitest run src/hooks/useSniperData.test.ts src/routes/signals.test.tsx src/routes/-admin.test.tsx src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx`
- `npx vitest run`
- `npm run build`
- `rg -n "\[SignalsPage\] watchlist filter" dist` (no matches in production bundle)
- `npm run validate:impl` (initial run failed because `reports/codex-implementation.meta.json` was missing; fixed in this patch and rerun after artifact write)

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-25_post-weekend-watchlist-signal-gate.md`
- `.github/migration/audits/phase-0-mt5-backend-dashboard-parity-2026-05-25.md`

# Remaining risks

- The MT5/PHP reopen logic still relies on narrow symbol-name classification rather than a full market-hours abstraction, per contract scope limits.
- The frontend normalization list is intentionally comparison-only and limited to documented broker suffix variants plus the contract-mandated `.r`, `.m`, trailing `+`, and `-ECN` style forms.
- Manual Monday-open live verification is still required to confirm non-crypto symbols appear within the expected post-open window.
- TanStack Router emits a non-blocking discovery warning because `src/routes/signals.test.tsx` lives under the route tree without exporting a route; runtime and test results are unaffected.

# Any contract ambiguities resolved during implementation

- The plan artifact suggested branch `fix/post-weekend-watchlist-signal-gate`, but runtime context required `codex/smc-intake-check-and-fix-2-prong-issue-after-mar`; runtime context was treated as authoritative.
- The contract targeted `normalizeWatchlist()` and `watchlistSet.has(...)` while also forbidding canonical watchlist storage changes. I resolved this by keeping persisted watchlist normalization unchanged and applying the shared suffix normalization only when building the comparison set and when filtering signal symbols.
