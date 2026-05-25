# Parity Audit Report - Phase 0

**Report Date**: 2026-05-25  
**Phase**: Phase 0 stabilization  
**Auditor**: Codex implementation validation  
**Status**: PASS WITH MANUAL FOLLOW-UP

---

## Executive Summary

- **Overall Parity**: Restored across the audited MT5 -> WordPress -> dashboard watchlist signal gate path.
- **Patch Focus**: Post-weekend reopen behavior for non-crypto symbols plus comparison-only watchlist normalization hardening.
- **Pass/Fail**: PASS with required live Monday-open follow-up.
- **Trend**: Improved; the stale post-weekend dead zone is now covered at both the EA session layer and the backend transient-read layer.

This audit re-validated the parity path that matters for the reported defect: MT5 session state drives backend freshness persistence, backend snapshot reads gate dashboard visibility, and the dashboard watchlist filter must match backend-emitted symbols even when broker suffix variants are present. The repo-level tests now cover the stale `CLOSED` reopen override, preserve `DISCONNECTED -> offline`, and prove the dashboard watchlist toggle behaves correctly when `signal.symbol` differs only by known suffix variants.

---

## Component Parity Matrix

| Surface | Evidence | Result | Notes |
|---|---|---|---|
| MT5 session reopen logic | `mt5/SessionManager.mqh`, `mt5/SessionManagerWeekendClassificationTest.mq5`, `mt5/SessionManager_test.mq5` | PASS | Sunday 21:00 UTC reopen path added for the shared FX session gate; crypto path unchanged. |
| Backend stale/offline interpretation | `wordpress/smc-superfib-sniper/class-market-data-service.php`, `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` | PASS | `CLOSED` stale snapshots now read as `stale` after reopen; `DISCONNECTED` stays `offline`. |
| Dashboard watchlist signal filter | `src/hooks/useSniperData.ts`, `src/routes/signals.tsx`, `src/routes/signals.test.tsx`, `src/hooks/useSniperData.test.ts` | PASS | Suffix-normalized comparison closes `.r` / `.m` / `.pro` / compact-suffix / `+` / `-ECN` mismatch cases without changing stored watchlist values. |
| Frontend regression suite | `npx vitest run` | PASS | 19 files / 89 tests passed. |
| Production bundle parity | `npm run build`, `rg -n "\\[SignalsPage\\] watchlist filter" dist` | PASS | DEV diagnostic string is absent from the production bundle. |

---

## Critical Findings

| Finding | Severity | Result | Notes |
|---|---|---|---|
| Non-crypto symbols remained weekend-closed past market reopen | HIGH | FIXED | Covered at the MT5 session gate and backend read-override layer. |
| Watchlist filter could miss broker-suffixed backend symbols | HIGH | FIXED | Covered by comparison-only normalization and route tests. |
| `DISCONNECTED` path accidentally weakened by reopen override | HIGH | NOT REGRESSED | Explicit PHP regression assertion added. |

---

## Residual Risks

- Live broker/exchange holiday edge cases remain outside this patch because the contract explicitly forbids widening into a full schedule abstraction.
- Manual Monday-open verification is still required in the live environment to confirm real post-open signal arrival timing and watchlist counts.
- TanStack Router warns that `src/routes/signals.test.tsx` is not a route file during test/build discovery; this is non-blocking and does not affect shipped code.

---

## Verification Checklist

- [x] `npm run check:mql`
- [x] `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- [x] Targeted Vitest regression run for watchlist and signal-route paths
- [x] Full Vitest suite
- [x] Production build
- [x] Production bundle grep confirming DEV diagnostic string is absent
- [ ] Live Monday-open broker verification after deploy

---

## Artifacts

- Implementation summary: `reports/codex-implementation.md`
- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-25_post-weekend-watchlist-signal-gate.md`
- PHP parity regression: `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
- Frontend parity regressions: `src/hooks/useSniperData.test.ts`, `src/routes/signals.test.tsx`
