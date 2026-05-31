# Issue summary

Implemented the watch-blueprint PATCH so live, unblocked natural WATCH candidates can expose backend-authored read-only plans without changing backend confirmation or execution authority.

# Root cause implemented

Split the backend shared rejection gate that previously returned `null` for every non-confirmed WATCH signal. The new branch keeps confirmed plans unchanged, emits `watch-blueprint` only for live unblocked non-lifecycle-suppressed WATCH signals, and preserves the pending-blueprint structural requirements for non-WATCH ARMED/READY candidates.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `src/types/sniper.ts`
- `sdk/src/types/index.ts`
- `src/components/sniper/Warnings.tsx`
- `src/components/PlanCard.tsx`
- `src/routes/-plan.page.tsx`
- `src/routes/-plan.test.tsx`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — passed.
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` — passed.
- `npx vitest run src/routes/-plan.test.tsx` — passed, 24 tests.
- `npx eslint src/types/sniper.ts sdk/src/types/index.ts src/components/sniper/Warnings.tsx src/components/PlanCard.tsx src/routes/-plan.page.tsx src/routes/-plan.test.tsx` — passed after scoped formatter fix.
- `npm run build` — passed. Vite emitted existing large chunk warnings only.

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_watch-blueprint.md`
- `.github/migration/audits/phase-0-sniper-parity-2026-05-31.md`
- `reports/codex-implementation.md`

# Remaining risks

Manual live verification is still required for a real watchlist symbol with live MT5 price/fresh candles and for active open-position/pending-order lifecycle states.

# Any contract ambiguities resolved during implementation

The local brainstorming skill normally requires approval before implementation, but the authoritative user contract already provided an approved implementation plan and required execution. I treated `reports/codex-plan.md` as the approved design and did not ask additional clarification.
