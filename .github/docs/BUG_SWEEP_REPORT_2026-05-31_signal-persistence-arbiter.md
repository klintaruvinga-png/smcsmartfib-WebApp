# Bug Sweep Report: Signal Persistence Arbiter

Date: 2026-05-31
Issue: SMC Intake - Backend/UI Major Update - Signal Persistence Arbiter

## Runtime Integrity Finding

`/live-signals` previously returned `ensure_engine_snapshot()['signals']` directly. That made transient raw engine output, including `WATCH` candidates, visible to the dashboard as live display cards and bypassed durable backend display state.

## Patch Applied

- `get_live_signals()` still calls `ensure_engine_snapshot()` first, preserving freshness/watchlist/stale checks.
- Live signals are now read from `smc_sf_signals` through `read_live_signal_board()`.
- `reconcile_live_signal_board()` persists only backend `ARMED`/`READY` rows with `engineBlocker=OK`.
- Current blocker/stale diagnostics hide existing rows for affected watchlist symbols.
- Raw snapshot signals are not returned as an empty-board fallback.

## Regression Coverage

- PHP contract test seeds durable `smc_sf_signals` rows and asserts `/live-signals` reads those rows instead of snapshot-only `WATCH`.
- Repeated polls preserve durable `id`, `createdAt`, and `backendConfirmed`; only envelope `polledAt` changes.
- Persisted `READY` rows with current `PRICE_NOT_MT5_FRESH` diagnostics are rejected.
- Anti-cache headers remain asserted for `/live-signals`.

## Source-of-Truth Check

Backend remains the display arbiter. No frontend signal computation, Pine formulas, fib anchoring, stale thresholds, lifecycle helpers, or trade-plan confirmation rules were changed.

## Verification

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed.
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx` passed.
- `npm run build` passed.
- `npm run validate:impl` passed.

## Remaining Runtime Risk

Manual live polling and MT5 replay remain recommended before merge: confirm stable board identity across at least 10 polls, confirm `WATCH -> ARMED -> READY` displays only `ARMED`/`READY`, and confirm stale MT5 diagnostics hide existing rows.
