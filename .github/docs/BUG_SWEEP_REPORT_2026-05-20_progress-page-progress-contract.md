# Executive Summary

- Overall health: Improved. The Progress page now reads backend-owned progress state instead of hardcoded unavailable placeholders.
- Bugs found: 2 confirmed contract gaps resolved in this patch.
- Fixes applied: Added `GET /user/progress`, wired the frontend client/hook/page to it, and preserved the existing equity/drawdown authority boundaries.
- Remaining risks: Streak remains intentionally conservative until the active-day definition is approved.
- Migration readiness: Phase 2 blocker removed for `/user/progress` wiring; manual staging verification is still recommended before production deploy.

**Report Date**: 2026-05-20  
**Phase**: 2 (Progress contract / backend-dashboard wiring)  
**Scanner**: Codex implementation sweep

---

## Summary

- **Total Issues Found**: 2
- **Critical Issues**: 0
- **High Priority Issues**: 1
- **Medium Priority Issues**: 1
- **Low Priority Issues**: 0
- **Validation Surface**: PHP contract test, targeted Vitest route/client/hook tests, TypeScript compile

---

## Confirmed Issues

| Issue | Component | Root Cause | Impact | Corrective Action |
|-------|-----------|-----------|--------|-------------------|
| Missing authenticated progress read contract | `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | `/user/progress` route and handler never existed after Phase 2 telemetry work | Progress page streak and milestone panels had no backend-owned source of truth | Registered `GET /user/progress`, returned backend-owned equity pulse + milestone state, and degraded streak to `UNAVAILABLE` until the business rule is signed off |
| Frontend progress panels were hard-gated | `src/routes/progress.tsx`, `src/lib/api/sniperClient.ts`, `src/hooks/useSniperData.ts` | No typed client/hook existed, so the page stayed on `PROGRESS_NOT_IMPLEMENTED` placeholders | Users could not see backend milestone state even after telemetry persistence existed | Added typed `UserProgress` contract, API normalizer, React Query hook, and loading/error/unavailable/live rendering states |

---

## Surgical Fixes Applied

- Added `/user/progress` under the existing authenticated `sniper/v1` namespace without changing any existing route auth or write paths.
- Sourced `equity_pulse.equity_usc` from the same account telemetry table as `/account-telemetry`, and logged the timestamp used for stale-data investigations.
- Derived milestone booleans only from confirmed persisted backend evidence:
  - `first_heartbeat` from `engine_runs` rows with `summary.source=explicit_heartbeat`
  - `first_market_stream` from `engine_runs` rows with `summary.source=ea_push`
  - `first_trade_telemetry` from persisted `account_telemetry` rows
- Left streak conservative by contract: `current_streak_days=0`, `state=UNAVAILABLE`, with `last_active_date` sourced from the latest persisted engine activity.
- Removed `PROGRESS_NOT_IMPLEMENTED` from the Progress page and rendered loading, error, unavailable, and live states for Streak and Milestones only.
- Preserved the existing Equity and Drawdown cards exactly on `useUserAccount()` and `useUserRiskProfile()`.

---

## Validation

- [x] `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- [x] `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-progress.page.test.tsx`
- [x] `npx tsc --noEmit`
- [x] `npm run validate:impl`

---

## Remaining Risks

- The active-day definition is still unresolved, so streak truth is intentionally degraded rather than inferred.
- `equity_pulse.today_pnl_usc` is not present in the Phase 2 telemetry table; the backend uses the persisted account snapshot value when available and otherwise falls back to `0`.
- Route-level browser parity on a live staging backend still needs manual confirmation before production deployment.

---

## Regression Checklist

- [x] Equity card still reads from `useUserAccount()`
- [x] Drawdown remaining card still reads from `useUserRiskProfile()`
- [x] Equity card `FreshnessBadge` still uses `account.state`
- [x] `/user/progress` auth stays behind `permission_user`
- [x] Stale account telemetry propagates to `equity_pulse.state`
- [x] `streak.state=UNAVAILABLE` renders a truthful unavailable message instead of crashing
- [x] `PROGRESS_NOT_IMPLEMENTED` removed with no dead references

---

## Do Not Touch List

- Phase 2 trade telemetry write path on `/ea/market-stream`
- Existing account equity and drawdown cards on `/progress`
- Any Pine or MT5 signal calculation logic
