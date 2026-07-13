# SMC SuperFIB - Codex Plan Hardening Request

### 1. Issue validation

- Confirmed:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` currently returns `null` from `build_pending_or_confirmed_plan()` for every non-confirmed `WATCH` signal because `($signal['status'] ?? null) === 'WATCH'` is included in the shared rejection gate.
  - Confirmed backend plans still flow through `build_trade_plan()` first when `$backend_confirmed === true`, so READY/backend-confirmed behavior should not be changed.
  - `src/types/sniper.ts` currently limits `TradePlan.source` to `"frontend-preview" | "backend-blueprint" | "pending-blueprint"`, so a backend `watch-blueprint` source would be a frontend type contract drift.
  - `src/components/PlanCard.tsx` only detects `pending-blueprint` as a non-executable blueprint source and has no dedicated `watch-blueprint` chip or message.
  - `src/routes/-plan.page.tsx` ranking currently uses verdict, `backendConfirmed`, READY status, and plan existence; it does not rank plan source quality within unconfirmed same-verdict candidates.
  - Existing PHP regression coverage asserts `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` lifecycle states remain `WATCH`, `backendConfirmed=false`, and `plan=null`.
- Likely:
  - The intended patch is a Phase 0 stabilization patch for visibility, not a signal-authority change.
  - A watch blueprint should be emitted only as a read-only backend-authored plan in the live `/ladders` payload and must not be persisted into executable `smc_sf_trade_plans` rows.
  - `sdk/src/types/index.ts` is also a public `TradePlan.source` contract surface and should be kept in sync if this repo builds or publishes the SDK.
- Unconfirmed:
  - The research report does not prove that all `WATCH` statuses are safe to blueprint. In particular, lifecycle-suppressed `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` WATCH signals must stay planless.
  - The research report does not prove any Pine formula corruption, MT5 parity corruption, stale-data bypass, or frontend-source-of-truth defect.
  - The report does not identify an existing backend diagnostic log gap; add only targeted assertions/tests, not broad new logging.

### 2. Implementation contract

- Exact file path: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Exact function, class, hook, selector, or section to modify: `SMC_SuperFib_Sniper_REST::build_pending_or_confirmed_plan()`.
  - Exact change required: split the current shared rejection gate into three explicit paths:
    - Keep `$backend_confirmed === true` returning `$this->build_trade_plan(...)` unchanged.
    - Add a `WATCH` path only when `$backend_confirmed === false`, `$data_live === true`, `$engine_blocker === 'OK'`, and `($lifecycle_diagnostic['state'] ?? null)` is not `ACTIVE_OPEN_POSITION` or `ACTIVE_PENDING_ORDER`. Build the plan via `build_trade_plan()`, require the result to be an array, set `$plan['source'] = 'watch-blueprint'`, and return it.
    - Keep the ARMED/READY pending path requiring `$backend_confirmed === false`, `$data_live === true`, `$engine_blocker === 'OK'`, non-WATCH status, sweep confirmation, and MSS or clean/strong displacement, then set `$plan['source'] = 'pending-blueprint'`.
  - Guard rails: do not change `build_trade_plan()` formulas, entry/stop/target ratios, lot sizing, `backendConfirmed` semantics, `determine_engine_blocker()`, stale threshold logic, `post_execute_signals()`, or trade-plan persistence. Do not let `ACTIVE_OPEN_POSITION` or `ACTIVE_PENDING_ORDER` produce a plan. Do not persist `watch-blueprint` rows because current persistence already accepts only `backend-blueprint` with `backendConfirmed=true`.
  - Why this file is in scope: it is the confirmed source of the backend plan suppression and the only place that can emit a backend-authored `watch-blueprint` without making the frontend synthesize plans.
  - Acceptance criterion tied to the failure path: a live, unblocked natural `WATCH` candidate returns a `TradePlan` with `source === 'watch-blueprint'`, `backendConfirmed === false`, and no executable persistence row; confirmed READY and pending ARMED paths keep their current sources; lifecycle-suppressed open-position/pending-order WATCH signals still return `plan === null`.

- Exact file path: `src/types/sniper.ts`
  - Exact function, class, hook, selector, or section to modify: `TradePlan.source`.
  - Exact change required: extend the union to include `"watch-blueprint"`.
  - Guard rails: do not rename existing source literals, do not widen `source` to `string`, and do not change `SignalCandidate.backendConfirmed`, `SignalStatus`, `TradePlan` field names, or execution-related fields.
  - Why this file is in scope: the React app consumes `/ladders` as `TradePlan[]` and must accept the new backend source without type drift.
  - Acceptance criterion tied to the failure path: TypeScript accepts a backend ladder with `source: "watch-blueprint"` while preserving exhaustiveness for existing source literals.

- Exact file path: `sdk/src/types/index.ts`
  - Exact function, class, hook, selector, or section to modify: `TradePlan.source`.
  - Exact change required: extend the union to include `"pending-blueprint"` if still missing and `"watch-blueprint"`.
  - Guard rails: do not change SDK client methods, request payloads, response parsing, mocks, or any non-source `TradePlan` field.
  - Why this file is in scope: confirmed search shows the SDK has a separate public `TradePlan` interface and is already behind the app source union; adding `watch-blueprint` only to the app would leave the public ladder contract stale.
  - Acceptance criterion tied to the failure path: SDK TypeScript consumers can receive `pending-blueprint` and `watch-blueprint` ladder sources without casting.

- Exact file path: `src/components/sniper/Warnings.tsx`
  - Exact function, class, hook, selector, or section to modify: `WarningLine` prop type and tone rendering.
  - Exact change required: add a non-blocking watch/info tone, for example `level?: "warn" | "block" | "watch"`, with visually distinct but non-error styling. Keep `warn` and `block` output unchanged. If using icons, use an existing `lucide-react` icon rather than adding custom SVG.
  - Guard rails: do not change `DivergenceBanner` copy or semantics. Do not make watch warnings look like execution-blocking sell/error states.
  - Why this file is in scope: `PlanCard` needs a distinct watch-only informational warning without overloading execution warnings.
  - Acceptance criterion tied to the failure path: `WarningLine level="watch"` renders without breaking existing warning/block callers and is visually distinct from pending/execution-blocked warnings.

- Exact file path: `src/components/PlanCard.tsx`
  - Exact function, class, hook, selector, or section to modify: `PlanCandidateCard`, source chip rendering, non-executable warnings, and `MetaChip` tone union.
  - Exact change required:
    - Add `const watchBlueprint = plan?.source === "watch-blueprint";`.
    - Render a dedicated chip label `WATCH BLUEPRINT` for `watchBlueprint`, with a distinct neutral/info tone.
    - Render a `WarningLine level="watch"` stating that the watch blueprint is indicative/read-only and will be replaced when a higher-quality ARMED/READY or backend-confirmed blueprint is available.
    - Keep execution disabled through the existing `disabled={!signal.backendConfirmed || !planComplete || !executableStageLots}` guard.
  - Guard rails: do not change the `/user/execute-signals` payload, CTA enablement rule, `planComplete` rules, stage lot formatting, backend lot authority, pending blueprint warning, or divergence warning. Do not hide the `UNCONFIRMED` chip for watch blueprints.
  - Why this file is in scope: it is the card that renders backend ladder plans and currently has no watch-specific source presentation.
  - Acceptance criterion tied to the failure path: a `WATCH` signal with a `watch-blueprint` plan shows plan details, `WATCH BLUEPRINT`, an informational watch warning, `UNCONFIRMED`, and a disabled execution button.

- Exact file path: `src/routes/-plan.page.tsx`
  - Exact function, class, hook, selector, or section to modify: `compareRankedCandidates()` and nearby ranking helpers.
  - Exact change required: add a local plan-quality helper that ranks source quality after backend confirmation and READY status but before generic `hasPlan`: `backendConfirmed/confirmed backend plan > backend-blueprint > pending-blueprint > watch-blueprint > no plan`. Use this helper in `compareRankedCandidates()` so same-verdict candidates prefer stronger plan quality while watch blueprints still outrank no-plan cards.
  - Guard rails: do not remove watchlist filtering, top-3 slicing, exact `signal.id` to `TradePlan.signalId` matching, diagnostic empty states, or verdict-first ordering. Do not sort watch candidates above higher-verdict candidates solely because they have a watch blueprint.
  - Why this file is in scope: watch blueprints must be visible but must not displace stronger same-verdict candidates incorrectly.
  - Acceptance criterion tied to the failure path: for same-verdict watchlist candidates, `backend-blueprint` renders before `pending-blueprint`, `pending-blueprint` before `watch-blueprint`, and `watch-blueprint` before no-plan.

- Exact file path: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - Exact function, class, hook, selector, or section to modify: existing `build_symbol_state` regression block around pending blueprints and lifecycle suppressions.
  - Exact change required: add assertions for a live, unblocked natural WATCH fixture that returns `plan.source === 'watch-blueprint'`, `backendConfirmed === false`, and `engineBlocker === 'OK'`. Keep or strengthen existing assertions that `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` return `plan === null`. Add an `ensure_engine_snapshot()` assertion that `watch-blueprint` is exposed in `plans` but not persisted to `smc_sf_trade_plans`.
  - Guard rails: do not delete existing pending blueprint, ACTIVE_PRE_ENTRY, open-position, pending-order, stale-data, or backend-confirmed assertions.
  - Why this file is in scope: it covers the backend failure path and the critical lifecycle/stale-data regressions for this patch.
  - Acceptance criterion tied to the failure path: the PHP regression proves watch blueprint visibility without weakening lifecycle hard suppressions or executable persistence.

- Exact file path: `src/routes/-plan.test.tsx`
  - Exact function, class, hook, selector, or section to modify: `buildPlan()` fixtures and `PlanPage` ranking/card rendering tests.
  - Exact change required:
    - Add a test that a `WATCH`, `backendConfirmed=false` signal with a `watch-blueprint` ladder renders `WATCH BLUEPRINT`, the informational watch warning, and a disabled execution button.
    - Add a ranking test for same-verdict candidates proving `backend-blueprint > pending-blueprint > watch-blueprint > no plan`.
  - Guard rails: do not weaken existing pending blueprint, no-plan, top-3, watchlist scope, incomplete-plan, or stage-lot execution tests.
  - Why this file is in scope: it verifies the frontend source rendering and ranking behavior introduced by the new backend source.
  - Acceptance criterion tied to the failure path: Vitest fails before implementation for missing `watch-blueprint` UI/ranking and passes after the targeted frontend patch.

### 3. Patch sequence

1. Update backend tests in `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` to capture the expected `watch-blueprint` behavior and the hard lifecycle non-goals.
2. Patch `SMC_SuperFib_Sniper_REST::build_pending_or_confirmed_plan()` with the explicit confirmed, watch, and pending branches.
3. Run the PHP contract test and fix only failures directly tied to the new branch.
4. Update `src/types/sniper.ts` and `sdk/src/types/index.ts` source unions.
5. Update `WarningLine` to support the watch/info tone.
6. Update `PlanCandidateCard` to render `WATCH BLUEPRINT` and the watch-only informational warning while preserving execution gating.
7. Add plan-quality ranking in `src/routes/-plan.page.tsx`.
8. Add/update `src/routes/-plan.test.tsx` coverage for watch rendering and source-quality ordering.
9. Run targeted frontend tests, lint/type/build checks, and backend execution-regression checks.

- Dependencies between changes:
  - Backend test should be red before the PHP implementation branch.
  - Type union changes should precede frontend rendering code that references `"watch-blueprint"`.
  - `WarningLine` watch tone should precede `PlanCard` use of `level="watch"`.
  - Ranking tests should be added before or alongside the ranking helper.
- State, cache, migration, or contract sequencing risk:
  - No database migration is required because non-confirmed plans are response payloads only.
  - Do not change cached/persisted trade plan semantics; `watch-blueprint` must not enter `smc_sf_trade_plans`.
  - Existing frontend caches may briefly show old ladders until polling refreshes; no cache invalidation is required beyond normal query polling.
  - Public SDK source union drift must be addressed in the same patch if SDK artifacts are part of release validation.

### 4. Regression guards

- Specific checks the implementation agent must run after patching:
  - `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php`
  - `npx vitest run src/routes/-plan.test.tsx`
  - `npx eslint src/types/sniper.ts sdk/src/types/index.ts src/components/sniper/Warnings.tsx src/components/PlanCard.tsx src/routes/-plan.page.tsx src/routes/-plan.test.tsx`
  - `npm run build`
- Existing protections that must still hold:
  - `post_execute_signals()` rejects any signal where `backend_confirmed != 1` or `status !== 'READY'`.
  - Stale price/candle data still prevents backend confirmation and must not produce watch blueprints when `engineBlocker !== 'OK'`.
  - `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` remain planless.
  - `ACTIVE_PRE_ENTRY` structurally valid setups remain `pending-blueprint`, not `watch-blueprint`.
  - `smc_sf_trade_plans` persistence remains restricted to `backend-blueprint` and `backendConfirmed=true`.
- Parity re-validations required, if any:
  - Revalidate that `build_trade_plan()` formulas are unchanged by diff inspection.
  - Revalidate backend-to-frontend `TradePlan.source` literals across `src/types/sniper.ts`, `sdk/src/types/index.ts`, `PlanCard`, and plan tests.
  - No Pine trading formula revalidation is required because Pine code is out of scope and must remain unchanged.
- Logging or diagnostics that should exist after the patch:
  - Existing `engineBlocker`, `priceState`, `candleState`, and lifecycle diagnostics must remain present.
  - No new broad logging is required. If a diagnostic is added, it must be limited to tests or existing debug/audit patterns and must not create noisy production logs.

### 5. Non-goals

- Do not make `WATCH` executable.
- Do not change `backendConfirmed` semantics.
- Do not change `post_execute_signals()` except to run existing regression checks.
- Do not change Pine formulas, MT5 formulas, entry ratios, stop ratios, TP ratios, lot-sizing math, or risk conversion.
- Do not synthesize frontend plans when the backend does not return a `TradePlan`.
- Do not loosen stale-data gates, MT5 authority gates, closed-session handling, rate-limit handling, key-status handling, AOV equilibrium handling, anchor chop handling, or fundamental HTF opposition blockers.
- Do not persist `pending-blueprint` or `watch-blueprint` rows as executable trade plans.
- Do not alter API endpoint paths, payload field names, signal IDs, ladder IDs, selectors, data test IDs, hook names, or watchlist matching rules.
- Avoid attractive but unsafe follow-on changes:
  - broad lifecycle refactors;
  - changing top-N selection beyond same-verdict plan-quality ranking;
  - converting `TradePlan.source` to an unconstrained string;
  - adding frontend fallback ladders;
  - changing card layout density beyond the required chip/warning;
  - attempting to fix unrelated SDK mock drift beyond the source union required here.

### 6. Risk assessment

- Worst-case failure mode if patched incorrectly:
  - A lifecycle-suppressed open position or pending order receives a visible ladder that looks actionable, creating duplicate-trade risk if later execution gates are weakened.
- User-visible failure mode:
  - Watchlist cards may show low-confidence watch blueprints above stronger candidates, or the UI may imply execution readiness despite `backendConfirmed=false`.
- Backend authority or stale-state risks:
  - Backend authority risk is high if the frontend starts creating plans or if `backendConfirmed` is changed.
  - Stale-state risk is high if the watch path does not require `$data_live === true` and `$engine_blocker === 'OK'`.
  - Persistence risk is high if `watch-blueprint` is written to `smc_sf_trade_plans`.
- Whether human approval should be required before merge:
  - Yes. Human review should be required before merge because the patch touches signal-plan visibility and must preserve execution authority, lifecycle suppression, and stale-data protections.

### 7. Test requirements

- Tests to add or update, with exact target area:
  - `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`: add natural live WATCH `watch-blueprint` coverage in the existing `build_symbol_state` regression area; assert no persistence; keep lifecycle hard-suppression assertions.
  - `src/routes/-plan.test.tsx`: add watch blueprint rendering test and same-verdict plan-quality ranking test.
  - `sdk/src/types/index.ts`: no runtime test required unless the SDK has a dedicated type/build command; validate through build or TypeScript checks available in the repo.
- Existing tests or manual checks that must still pass:
  - `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-execute-signals-stage-lots.php`
  - `npx vitest run src/routes/-plan.test.tsx`
  - `npm run build`
- Any soak, replay, parity, or live-environment verification needed:
  - Manual live check on a watchlist symbol with live MT5 price and fresh candles: `/ladders` includes a `watch-blueprint` only when `engineBlocker` is `OK`, card renders as non-executable, and no trade queue rows are created.
  - Manual lifecycle check with an active open position or pending order: signal remains `WATCH`, `backendConfirmed=false`, and no plan is shown.
  - No Pine replay is required for this patch.

### 8. Implementation handoff

- Branch naming recommendation:
  - `codex/watch-blueprint-contract`
- Suggested commit grouping:
  - Commit 1: backend watch blueprint branch and PHP regression coverage.
  - Commit 2: frontend/SDK source contracts, watch warning UI, plan card rendering, ranking, and Vitest coverage.
- Required reports or artifacts to generate after implementation:
  - `reports/codex-implementation.md` containing changed files, verification commands, exact pass/fail results, and any residual risk.
  - Include before/after notes for `watch-blueprint` visibility, lifecycle hard suppressions, and executable persistence.
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
