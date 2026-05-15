# Bug Scan Report - Phase 0

**Report Date**: 2026-05-15  
**Phase**: Phase 0 - Dashboard stale-data integrity  
**Scanner**: Codex implementation sweep  
**Scan Duration**: 2026-05-15 implementation window

---

## Summary

- **Total Issues Found**: 1
- **Critical Issues**: 0
- **High Priority Issues**: 0
- **Medium Priority Issues**: 1
- **Low Priority Issues**: 0
- **Test Coverage**: Targeted hook and backend regression coverage only

---

## Medium Priority Issues

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| Removed watchlist symbols could reappear after mutation success | `src/hooks/useSniperData.ts`, `src/routes/account.tsx` | `["user-settings"]` cache was updated with the mutation result but not invalidated for a confirming background refetch; the account draft sync also read raw cache state while refetch could be in flight | Account watchlist UI could show ghost symbols after removal/remount, breaking dashboard/backend truth | No | Invalidate `["user-settings"]` immediately after `writeCanonicalWatchlist`, keep existing downstream invalidations, and defer account draft sync until `useUserSettings` is settled |

---

## Test Failure Summary

| Test | Status | Notes |
|------|--------|-------|
| `npx vitest run src/hooks/useSniperData.test.tsx src/hooks/useSniperData.watchlist.test.tsx` | PASS | Confirms `["user-settings"]` invalidation and remount persistence path |
| `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` | PASS | Backend watchlist regression unaffected |
| `npx vitest run` | FAIL | Pre-existing unrelated suite/config failures in `src/routes/-admin.test.tsx` and files with no test suite; not caused by this patch |
| `npx tsc --noEmit` | FAIL | Pre-existing unrelated errors in `src/components/PlanCard.tsx`, `src/routes/-plan.test.tsx`, and `src/routes/charts.tsx` |

---

## Blocker Assessment

**Blocks Current Phase**: No  
**Blocks Phase N+1 Transition**: No  
**Timeline Impact**: None after patch  
**Risk Level**: MEDIUM

---

## Verification Criteria For Fix

- [x] `["user-settings"]` is invalidated after watchlist add success
- [x] `["user-settings"]` is invalidated after watchlist remove success
- [x] Hook-level remount test keeps removed symbol absent while refetch lags
- [x] Backend regression remains green
- [ ] Manual browser verification on a live/staging backend with route navigation and throttled network
- [ ] Manual mutation failure verification for add/remove rollback paths

---

## Attachments

- Implementation summary: `reports/codex-implementation.md`
- Targeted hook tests: `src/hooks/useSniperData.test.tsx`, `src/hooks/useSniperData.watchlist.test.tsx`
