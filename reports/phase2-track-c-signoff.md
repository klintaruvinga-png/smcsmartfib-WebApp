## Phase 2 Track C Signoff

Scope: dashboard read-only consumers for account telemetry, positions, floating P/L, hedge grouping, and sync health.

### Checklist

- PASS — account card now reads backend account telemetry through `useAccountTelemetry()` and `/account-telemetry`.
- PASS — live positions now read backend trade telemetry through `/positions`.
- PASS — floating P/L now derives from backend trade telemetry, not frontend state.
- PASS — hedge grouping now derives client-side from backend positions grouped by `symbol + direction`.
- PASS — sync health remains backend-owned through the existing `/health` read surface.
- PASS — no dashboard POST path was introduced for live trade state.
- PASS — `/user/trades` remains audit-only and is no longer used by the updated trade panels.
- PASS — `/user/account` remains non-authoritative for the updated telemetry panels.
- PASS — degraded/unavailable states render when trade/account telemetry reads fail.
- PASS — dashboard tests cover read-only endpoint usage and unavailable-state behavior.

### Evidence

- Code paths:
  - `src/lib/api/sniperClient.ts`
  - `src/hooks/useSniperData.ts`
  - `src/components/sniper/WalletOverview.tsx`
  - `src/routes/book.tsx`
  - `src/routes/orders.tsx`
  - `src/routes/analytics.tsx`
- Validation:
  - `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/components/sniper/WalletOverview.test.tsx src/routes/-book.page.test.tsx src/routes/-orders.page.test.tsx src/routes/-analytics.page.test.tsx`
  - `npm run build`

### Remaining Track C Risk

- Manual browser validation against a live backend is still recommended for final UI parity confirmation.
