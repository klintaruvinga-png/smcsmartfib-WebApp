# Phase 0 Backend Parity Audit

Date: 2026-05-12
Surface: Admin soak-report dashboard parity
Engine: backend

## Parity objective

Re-validate that the `/admin` soak workspace continues to reflect backend-owned soak-report truth without adding frontend-only signal semantics.

## Findings

- Backend authority preserved: soak-report data still comes exclusively from `fetchSoakReport()` with `cacheBust: true`.
- Contract preserved: no changes were made to `src/lib/api/sniperClient.ts`, `/admin/soak-report`, or `SoakReport`.
- Stale-data protection improved: a failed refresh now promotes the route back to `soakState.kind = "error"` instead of leaving a second request in flight.
- Age semantics remain truthful: `Baseline age` and `Checkpoint age` are both derived from `baseline_checkpoint.created_at` because the current backend schema does not expose a distinct checkpoint-age field.
- Print/export remains report-scoped: only `.soak-report-print-section` is printable, with added heading/block formatting for operator readability.

## Evidence

- `src/routes/admin.tsx` computes both age cards from the existing baseline checkpoint timestamp.
- `src/routes/-admin.test.tsx` covers the new labels and refresh-failure behavior.
- `npx vitest run --environment jsdom src/routes/-admin.test.tsx` passed on 2026-05-12.
- `npm run build` passed on 2026-05-12.

## Conclusion

No backend/dashboard parity corruption was introduced by this patch. The only ambiguity in the current contract is the absence of separate checkpoint-age semantics in the backend response, which this patch surfaces explicitly instead of fabricating client-side truth.
