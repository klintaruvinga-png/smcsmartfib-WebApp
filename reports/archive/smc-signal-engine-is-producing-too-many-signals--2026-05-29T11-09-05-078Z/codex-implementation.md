## Issue summary

Backend MT5 candidate ingest now suppresses duplicate same-range candidates while the prior candidate is still active by backend authority, so repeated timer-driven submissions do not keep generating fresh rows for a still-valid signal.

## Root cause implemented

Implemented the missing lifecycle gate in `post_ea_signal_candidates()` by checking the latest stored MT5 candidate for the same symbol, direction, fib family, fib ratio, and near-equal fib level, then resolving whether that prior candidate is still active from fresh backend authority only: live matching MT5 positions, live matching MT5 pending orders, or live pre-entry snapshot state. If lifecycle authority is stale or missing, ingest now fails open and preserves existing write behavior.

## Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_mt5-signal-lifecycle-suppression.md`
- `.github/migration/audits/phase-6-mt5-parity-2026-05-29.md`
- `reports/codex-implementation.md`

## Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — passed
- `npx vitest run scripts/mt5-signal-dispatch.test.mjs` — passed

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-29_mt5-signal-lifecycle-suppression.md`
- `.github/migration/audits/phase-6-mt5-parity-2026-05-29.md`
- `reports/codex-implementation.md`

## Remaining risks

The post-entry release path treats empty live-trade result sets from `read_trade_positions()` and `read_trade_orders()` as "no matching open/order exists" because the contract constrained lifecycle authority readers to those existing helpers. That preserves the required release path without widening authority surfaces, but it still depends on upstream telemetry freshness discipline to avoid silent stale empties.

## Any contract ambiguities resolved during implementation

- The runtime branch name ended with a trailing hyphen. Applied the safest literal interpretation and created `codex/smc-signal-engine-is-producing-too-many-signals-` exactly as provided.
- The contract did not specify how to distinguish "no matching live trade exists" from "telemetry absent" using only `read_trade_positions()` and `read_trade_orders()`. Resolved this narrowly by treating empty result sets as no authoritative match and failing open only when matching stale authority is explicitly present or the snapshot is not live.
