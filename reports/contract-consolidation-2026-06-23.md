# Contract Consolidation Refactor - 2026-06-23

## Purpose

This run implements the lowest-risk production refactor slice from the existing architecture review:

- preserve all current runtime behavior
- preserve API shapes
- reduce contract drift between the dashboard and the SDK
- reduce duplicate response normalization logic

It does not change signal logic, plan logic, regime logic, license logic, or backend authority.

## Scope implemented

### Shared contract module

Added a repo-level shared contract module:

- `packages/contracts/src/index.ts`
- `packages/contracts/src/normalizers.ts`

This module now owns:

- TypeScript domain contracts used by both the dashboard and the SDK
- pure wire-to-domain normalization helpers for:
  - live signals envelopes
  - market snapshots
  - account telemetry
  - positions
  - pending orders
  - user progress

### Dashboard changes

- `src/types/sniper.ts` now re-exports the shared contracts
- `src/lib/api/sniperClient.ts` now uses the shared normalizers

### SDK changes

- `sdk/src/types/index.ts` now re-exports the shared contracts
- `sdk/src/client/SniperClient.ts` now uses the shared normalizers
- SDK fixtures and freshness helpers were aligned to the shared truth vocabulary

## Architectural effect

This establishes one authoritative TypeScript contract surface for the frontend and SDK without changing any backend route, payload, or business decision.

Debt removed in this run:

- duplicate domain type ownership in:
  - `src/types/sniper.ts`
  - `sdk/src/types/index.ts`
- duplicate normalization logic in:
  - `src/lib/api/sniperClient.ts`
  - `sdk/src/client/SniperClient.ts`

Debt intentionally left unchanged:

- backend monolith ownership in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- frontend plan policy duplication in `src/routes/-plan.utils.ts` and `src/components/PlanCard.tsx`
- MT5/backend truth duplication
- projection ownership for signal, plan, regime, and license domains

## Why this was the correct incremental slice

- It is behavior-preserving.
- It has a narrow blast radius.
- It removes a proven drift vector already identified in the architecture review.
- It prepares later bounded-context extraction without forcing any active truth-domain migration early.

## Validation

- App TypeScript:
  - `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
- SDK TypeScript:
  - `node sdk/node_modules/typescript/bin/tsc --noEmit -p sdk/tsconfig.json`
- App lint on touched files:
  - `node node_modules/eslint/bin/eslint.js --config eslint.config.js ...`
- App production build:
  - `node node_modules/vite/bin/vite.js build`

## Residual risks

- Shared contracts are still a repo-local module, not yet a separately versioned package.
- The backend remains the runtime authority host; this run only consolidates TypeScript consumers.
- Frontend execution gating and plan completeness logic are still duplicated and should remain deferred until the governed plan-truth phase.
