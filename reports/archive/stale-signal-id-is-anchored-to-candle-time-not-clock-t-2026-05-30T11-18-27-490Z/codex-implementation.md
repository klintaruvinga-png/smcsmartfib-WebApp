# Codex Implementation Summary

## Issue summary

`/live-signals` returned signal objects that could stay structurally identical across repeated poll cycles when backend signal identity remained candle-anchored and unchanged. That blocked downstream frontend updates even though the route was being polled successfully.

## Root cause implemented

Added a response-only `polledAt` timestamp inside `get_live_signals()` so each returned signal changes per poll response without altering stable backend signal identity, `createdAt`, engine computation, persistence, cache keys, or execution deduplication semantics.

## Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `src/types/sniper.ts`
- `sdk/src/types/index.ts`

## Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - Expected failing TDD run completed before the route fix.
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - PASS
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx`
  - PASS
- `npx tsc --noEmit`
  - FAIL: existing unrelated `vite.config.ts` type mismatch (`test` is not a known property of `LovableViteTanstackOptions`)
- `npm run validate:impl`
  - PASS

## Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `reports/implementation-verification.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-30_live-signals-polled-at-contract.md`
- `.github/migration/audits/phase-2-dashboard-live-signals-polled-at-parity-2026-05-30.md`

## Remaining risks

- Manual authenticated verification against a live dashboard session is still required to confirm repeated `/live-signals` polls now trigger the expected frontend updates without any consumer path depending on object identity beyond the transport contract.
- Repository-wide TypeScript validation remains blocked by the unrelated `vite.config.ts` config typing error.

## Any contract ambiguities resolved during implementation

- The local PHP test harness previously treated `rest_ensure_response()` as a raw pass-through for arrays. Wrapping every array globally would have widened scope and broken unrelated contract tests, so the harness now uses an opt-in response wrapper only for the new `/live-signals` header regression.
