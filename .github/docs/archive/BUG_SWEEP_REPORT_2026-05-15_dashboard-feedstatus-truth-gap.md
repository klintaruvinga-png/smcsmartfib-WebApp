# Bug Sweep Report — Dashboard FeedStatus Truth Gap — 2026-05-15

**Workflow ID:** dashboard-feedstatus-truth-gap-2026-05-15
**Branch:** `codex/close-the-frontend-backend-truth-gap-dashboard-s`
**Final Commit:** [PENDING at commit time]
**Prior Commit:** [PENDING at commit time]

---

## Executive Summary

| Item | Status |
|---|---|
| Overall system health | PARTIAL |
| Bugs found | 1 confirmed frontend cache-integrity defect |
| Bugs fixed | 1 |
| Remaining risks | Live soak confirmation still pending |
| Migration readiness | Phase 0 remains BLOCKED pending live UI/backend convergence evidence |
| Rollback command | `git revert <implementation-commit>` |

This sweep covered the documented frontend/backend truth gap where backend health could report
`feedStatus=live` while the dashboard continued to render a stale chip. The backend remained
authoritative and correct. The confirmed defect was a frontend cache-policy mismatch: the
`engine-health` query inherited a 10 second stale window that is incompatible with the Phase 0
freshness contract.

---

## Confirmed Problems

### BUG-001 — `engine-health` inherited a stale window that masked live backend transitions (HIGH)

**Root cause:** `src/router.tsx` sets a global React Query `staleTime: 10_000`. The
`["engine-health"]` query in `src/hooks/useSniperData.ts` did not override that default, so the
dashboard could keep serving cached health state even though backend soak evidence showed
`feedStatus` had already transitioned.

**Impact:** The admin/dashboard feed-status chips could show `stale` for up to 10 seconds after
the backend had already moved to `live`, creating a frontend/backend truth gap on a Phase 0
gate item.

**Files affected:**
- `src/hooks/useSniperData.ts`

---

## Validation Findings

- The watchlist invalidation cascade already included `["engine-health"]` for cancel, invalidate,
  and active refetch. No secondary invalidation fix was required.
- The targeted frontend hook regression test passes.
- The backend PHP health contract test passes, preserving admin/public health parity.
- `tsc --noEmit` currently fails on pre-existing unrelated issues in:
  - `src/components/PlanCard.tsx`
  - `src/routes/-plan.test.tsx`
  - `src/routes/charts.tsx`

---

## Surgical Fixes Applied

### PATCH-1 — Disabled caching on the backend-owned health query

- Added `staleTime: 0` to `useEngineHealth()` so backend health transitions propagate on the next
  poll cycle without changing the established 2 second polling interval.
- Added an operational comment documenting the Phase 0 reason for the override.

### PATCH-2 — Added a hook-level regression test

- Added `src/hooks/useSniperData.test.tsx` to assert that `["engine-health"]` explicitly uses
  `staleTime: 0` while preserving the polling contract derived from user settings.

---

## Remaining Risks

- Live market-hours soak evidence is still required to prove the admin/dashboard chips converge
  with backend `feedStatus` within <=2 seconds after a transition.
- Full repository typecheck is still blocked by unrelated existing TypeScript errors outside this
  patch.
