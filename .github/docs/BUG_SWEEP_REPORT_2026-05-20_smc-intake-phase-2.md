## Bug Sweep Report

Date: 2026-05-20  
Issue: SMC Intake - Begin Phase 2 Implementation

### Scope reviewed

- EA market-stream payload authority chain
- backend Phase 2 persistence and stale-row sweep logic
- dashboard trade/account read wiring and degraded-state behavior

### Findings addressed

| ID | Severity | Area | Finding | Fix |
| --- | --- | --- | --- | --- |
| P2-001 | High | Backend truth | No authoritative storage existed for MT5 account metrics, positions, or pending orders. | Added `smc_sf_account_telemetry`, `smc_sf_trade_positions`, and `smc_sf_trade_orders` with deterministic upserts. |
| P2-002 | High | Stale data | Missing fresh-batch positions/orders would have remained visible indefinitely. | Added schema-gated sweep logic that closes/inactivates rows absent from a valid fresh batch. |
| P2-003 | High | Authority boundary | Dashboard trade/account panels were still reading `/user/trades` and `/user/account`. | Rewired telemetry surfaces to `/account-telemetry`, `/positions`, and `/orders`; audit endpoints remain non-authoritative. |
| P2-004 | Medium | Safety gate | The contract was internally ambiguous on `schema_version` for Phase 1 compatibility. | Preserved Phase 1-only payload acceptance; reject only Phase 2 telemetry payloads missing `schema_version`. |
| P2-005 | Medium | UX integrity | Book/orders/analytics surfaces could previously render empty states on backend failure. | Added explicit unavailable/degraded states for telemetry fetch failures. |

### Residual risks

- Live MT5 compile/runtime confirmation is still pending outside this repo.
- Sweep logic must receive the required human review before production deployment.
- Manual staging/browser verification is still recommended for final UI parity confirmation.

### Evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/components/sniper/WalletOverview.test.tsx src/routes/-book.page.test.tsx src/routes/-orders.page.test.tsx src/routes/-analytics.page.test.tsx`
- `npm run build`
