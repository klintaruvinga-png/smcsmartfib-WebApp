# Phase 2 Engine Parity Audit - 2026-05-20

## Objective

Record the parity surfaces that must stay aligned before Phase 2 source-code implementation begins.

## Audited Surfaces

- MT5 transport path: `POST /wp-json/sniper/v1/ea/market-stream`
- Backend read-only authority path: `GET /wp-json/sniper/v1/market-data-authority`
- Dashboard account/trade read paths referenced by `src/lib/api/sniperClient.ts`

## Findings

1. The existing EA transport path is confirmed and must remain the only EA-owned write path for Phase 2 telemetry.
2. The backend already exposes a market-data-authority read route, but the repository did not previously define a canonical Phase 2 trade-telemetry acceptance contract.
3. The dashboard client already reads account and trade data from backend GET endpoints, which is compatible with the required read-only authority model.

## Parity Status

- MT5 -> Backend transport parity: PASS for the existing market-stream route and auth boundary.
- Backend -> Dashboard read-only authority parity: PARTIAL. Read paths exist, but the trade-telemetry field set still requires Track A / Track B / Track C sign-off.
- Phase 2 contract parity: PLANNING-IN-PROGRESS.

## Required Pre-Implementation Checks

- Confirm the approved trade payload fields match what the EA will emit on the existing market-stream path.
- Confirm the backend persistence layer stores the approved position, pending-order, and account-metric fields without duplicate ticket creation.
- Confirm dashboard panels for account, positions, floating P/L, hedge grouping, and sync health consume backend-owned read paths only.
