# Issue summary

SMC intake blueprint gating exposed no plan for lifecycle-throttled `ACTIVE_PRE_ENTRY` signals because `build_symbol_state()` returned `plan: null` whenever `backendConfirmed` was false, even when live data and deterministic candle structure were available.

# Root cause implemented

Implemented a backend-only pending blueprint path for live, unblocked, ARMED lifecycle-throttled setups. Confirmed READY signals still return unchanged `backend-blueprint` plans, pending plans differ only by `source: pending-blueprint`, and execution authority remains tied to `backendConfirmed`.

# Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — added `build_pending_or_confirmed_plan()` and guarded `trade_plans` persistence to confirmed backend blueprints only.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — updated `ACTIVE_PRE_ENTRY` assertions for pending blueprint visibility and no pending-plan persistence, while preserving hard-blocked null-plan checks.
- `src/types/sniper.ts` — extended `TradePlan.source` with `pending-blueprint`.
- `src/components/PlanCard.tsx` — added pending blueprint label, lock icon, warning, and non-executable chip styling while preserving backend-confirmed execution disabling.
- `src/routes/-plan.test.tsx` — added pending blueprint rendering/disabled-execution coverage and aligned the local hook mock/current awaiting-blueprint expectations.

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — passed.
- `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php` — passed.
- `npx vitest run src/routes/-plan.test.tsx` — passed.
- `npm run build` — passed.
- `npm run validate:impl` — passed.
- `npm run lint` — failed on unrelated pre-existing Prettier errors outside the changed files.

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `reports/implementation-verification.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_blueprint-gating-throttle.md`
- `.github/migration/audits/phase-0-sniper-parity-2026-05-31.md`

# Remaining risks

Manual replay against a live `ACTIVE_PRE_ENTRY` setup is still required to confirm the operator-facing snapshot payload and `/user/execute-signals` rejection path in an integrated environment. Repo-wide lint remains blocked by unrelated existing Prettier issues in files outside this patch scope.

# Any contract ambiguities resolved during implementation

For repeated prior MT5 candidate throttling, pending blueprint eligibility was interpreted narrowly as lifecycle state `OK`, `LIFECYCLE_UNRESOLVED`, or empty with `priorCandidateStatus === READY`, plus live data, `engineBlocker === OK`, and final signal status `ARMED`.
