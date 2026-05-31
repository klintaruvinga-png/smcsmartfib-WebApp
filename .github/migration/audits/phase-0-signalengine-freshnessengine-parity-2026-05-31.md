# Phase 0 SignalEngine / FreshnessEngine Parity Audit

Date: 2026-05-31

## Issue

SMC Intake - Remove PR 301's over-strict gate.

## Scope

- Backend pending blueprint visibility.
- SignalEngine structural fields: `engine.sweep`, `engine.mss`, `engine.displacement`, `engineBlocker`.
- Freshness protections: live MT5 price, fresh candles, closed-session and stale-data blockers.
- Pine formulas: not changed.
- MT5 execution authority: not changed.

## Result

Parity re-validation passed for backend/Pine fib calculations and synthetic SignalEngine parity. The patch does not alter fib anchors, entries, stops, targets, lot sizing, Pine formulas, `backendConfirmed` calculation, or `determine_engine_blocker()`.

## Validation Evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
  - Result: pass.
- `php scripts/parity-validator.php`
  - Result: pass.
  - Overall parity: 100%.
  - Total tuples: 384.
  - Exact matches: 384.
  - Critical mismatches: 0.
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - Result: pass.
  - Confirms pending blueprints remain non-executable snapshot payload data and are not persisted as executable trade plan rows.

## Backend Authority Check

- `backendConfirmed === true` still returns confirmed backend plans unchanged.
- `backendConfirmed === false` pending plans are tagged `source => 'pending-blueprint'`.
- `engineBlocker !== 'OK'` still prevents pending blueprint emission.
- `data_live !== true` still prevents pending blueprint emission.
- `WATCH` still prevents pending blueprint emission.
- `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` still hard-suppress to WATCH with `plan === null`.

## Notes

`npm run lint` remains blocked by unrelated pre-existing Prettier/style errors outside the PHP backend and test files changed for this patch. `npm run build` passed.
