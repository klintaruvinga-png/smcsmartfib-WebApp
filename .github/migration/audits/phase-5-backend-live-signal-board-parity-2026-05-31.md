# Phase 5 Backend Live Signal Board Parity Audit

Date: 2026-05-31
Issue: SMC Intake - Backend/UI Major Update - Signal Persistence Arbiter

## Scope

Re-validated backend/dashboard signal truth for `/live-signals` after moving display output from raw engine snapshot signals to a durable backend board backed by `smc_sf_signals`.

## Parity Result

Backend remains the source of truth. `/live-signals` now exposes durable backend rows only, while the engine snapshot can continue carrying raw diagnostic/candidate output for internal use.

## Backend Checks

- Eligible display rows require `status IN ('ARMED', 'READY')`.
- Eligible display rows require `computedBy=backend`.
- Eligible display rows require `engineBlocker=OK`.
- Current watchlist filtering is enforced at read time.
- Current blocker/stale diagnostics hide matching persisted rows before read.
- Backend-confirmed state is mapped from `smc_sf_signals.backend_confirmed`.

## Dashboard Contract Checks

- Response envelope remains `{ signals, polledAt }`.
- `polledAt` stays on the envelope only.
- `SignalCandidate`-shaped rows keep `id`, `symbol`, `direction`, `status`, `confluence`, `verdict`, `computedBy`, `backendConfirmed`, `engineBlocker`, `createdAt`, and `engine`.
- Frontend normalization and route tests passed without frontend contract changes.

## Formula And Guard Review

No Pine formulas, fib formulas, anchor calculations, `build_symbol_state()`, `determine_engine_blocker()`, `backendConfirmed` gating, MT5 lifecycle helpers, or trade-plan execution guards were intentionally changed.

## Verification

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx` passed.
- `npm run build` passed.

## Residual Risk

Live-environment replay is still required for full market-path parity: replay `WATCH -> ARMED -> READY`, active open position, pending order, and stale price/candle cases against live MT5 bridge data.
