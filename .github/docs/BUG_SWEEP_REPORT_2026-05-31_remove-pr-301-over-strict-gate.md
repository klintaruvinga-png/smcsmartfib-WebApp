# Bug Sweep Report - Remove PR 301 Over-Strict Gate

Date: 2026-05-31

## Scope

- Runtime integrity path: backend pending blueprint construction.
- Primary file: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
- Regression target: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`.

## Confirmed Issue

`build_pending_or_confirmed_plan()` still required lifecycle diagnostic membership and `pre_lifecycle_status === 'READY'` before returning `source => 'pending-blueprint'`. That caused live, engine-unblocked, structurally valid ARMED setups to expose `plan: null` when lifecycle diagnostics were missing or not READY at the synchronous evaluation point.

## Patch Applied

- Preserved confirmed plan behavior: `backendConfirmed === true` still returns the normal `build_trade_plan()` result unchanged.
- Replaced lifecycle-dependent pending-plan eligibility with structural checks:
  - backend not confirmed;
  - live data;
  - `engineBlocker === 'OK'`;
  - non-WATCH status;
  - sweep present;
  - MSS present or displacement is `clean` / `strong`.
- Added array-shape guard before tagging pending plans.

## Regression Coverage

- Added a `build_symbol_state()` regression for a live ARMED setup with no lifecycle diagnostic, sweep present, MSS absent, and clean/strong displacement.
- Kept READY control setup backend-confirmed.
- Kept `ACTIVE_PRE_ENTRY` pending blueprint exposure.
- Kept weak-displacement-without-MSS setup planless.
- Kept `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` hard-suppressed as WATCH with `plan === null`.
- Kept pending blueprints out of executable trade plan persistence rows.

## Validation Evidence

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` - pass.
- `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` - pass.
- `php scripts/parity-validator.php` - pass, 100% synthetic parity, 384/384 exact matches.
- `npm run build` - pass.
- `npm run validate:impl` - pass after recreating `reports/codex-implementation.meta.json` with the current plan hash.
- `npm run lint` - failed on unrelated existing Prettier/style errors outside this patch scope.

## Residual Risk

Existing cached snapshots may continue to show old `plan: null` payloads until recomputed. Human review should confirm operations semantics for displaying non-executable pending blueprints remain acceptable.
