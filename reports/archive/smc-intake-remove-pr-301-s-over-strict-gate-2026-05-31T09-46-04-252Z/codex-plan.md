# SMC SuperFIB - Codex Plan Hardening Request

### 1. Issue validation

**Confirmed**
- The active failure path is in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, method `build_pending_or_confirmed_plan()`.
- The current pending-plan gate still requires `is_array($lifecycle_diagnostic)`, `($signal['status'] ?? null) === 'ARMED'`, and `strtoupper((string) $pre_lifecycle_status) === 'READY'` before emitting `source => 'pending-blueprint'`.
- That gate can suppress structurally valid ARMED pending blueprints when lifecycle diagnostics are absent, unresolved, delayed, or not READY at the exact synchronous evaluation point.
- Backend authority is still separated from pending visibility: `backendConfirmed === true` returns a normal executable backend plan, while pending blueprints are tagged with `source => 'pending-blueprint'`.
- `src/types/sniper.ts` already accepts `TradePlan.source === "pending-blueprint"`.
- `src/components/PlanCard.tsx` already renders pending blueprints distinctly and does not need to be changed for this issue.
- Existing PHP contract tests already assert pending blueprints are not persisted as executable trade plan rows.

**Likely**
- PR 301 over-corrected a swarm-prevention gate by treating lifecycle readiness as a prerequisite for pending blueprint construction instead of as one possible diagnostic input.
- The safest fix is to keep live-data and engine-blocker protections, reject `WATCH`, and require structural confirmation from engine fields before building a non-executable pending blueprint.
- `test-mt5-snapshot-contract.php` is the right regression target because it already exercises `build_symbol_state()`, pending blueprints, lifecycle states, stale/closed-session blockers, and persistence boundaries.

**Unconfirmed**
- The report does not prove lifecycle diagnostics are always asynchronous in production; the plan must not depend on that being true.
- The report does not prove any dashboard, MT5 bridge, or DB schema change is required.
- The report does not prove Pine formula corruption; Pine trading formulas must remain unchanged.
- The report does not fully enumerate valid `engine.displacement` values beyond observed values such as `weak`, `clean`, and `strong`; implementation must use a conservative allowlist.

### 2. Implementation contract

**File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`**
- Exact function to modify: `SMC_SuperFib_Sniper_REST::build_pending_or_confirmed_plan()`.
- Exact change required:
  - Preserve the first branch: if `$backend_confirmed === true`, return `$this->build_trade_plan(...)` unchanged.
  - Replace the current non-confirmed early-return condition that depends on `is_array($lifecycle_diagnostic)` and `$pre_lifecycle_status === 'READY'`.
  - For non-confirmed plans, require all of:
    - `$backend_confirmed === false`
    - `$data_live === true`
    - `$engine_blocker === 'OK'`
    - `($signal['status'] ?? null) !== 'WATCH'`
    - structural sweep is present
    - structural MSS is present or displacement is one of the explicitly approved strong/clean displacement values
  - Build `$has_sweep`, `$has_mss`, and `$has_displacement` from `$signal['engine'] ?? array()` inside the function before the pending-plan decision.
  - Use conservative structural truth checks:
    - `$has_sweep` should only pass if `engine.sweep` is present and not a negative/empty value.
    - `$has_mss` should only pass if `engine.mss` is present and not a negative/empty value.
    - `$has_displacement` should only pass for known strong/clean displacement strings; do not treat `weak`, empty, `false`, `0`, `none`, `null`, or missing as valid.
  - Keep lifecycle diagnostics visible in the response through the existing `diagnostic.lifecycle` path, but stop making pending blueprint construction depend on lifecycle diagnostic array membership or `pre_lifecycle_status === 'READY'`.
  - Before tagging, guard plan shape: only set `$plan['source'] = 'pending-blueprint'` if `$plan` is an array; otherwise return `null`.
- Guard rails:
  - Do not modify `build_trade_plan()` formulas, entries, stops, targets, risk, lots, ladder, source for confirmed plans, or Pine parity formulas.
  - Do not change `backendConfirmed` calculation in `build_symbol_state()`.
  - Do not change `determine_engine_blocker()`.
  - Do not bypass stale data, closed-session, AOV equilibrium, anchor chop, price-not-MT5-fresh, quote-unavailable, or rate-limit blockers.
  - Do not persist pending blueprints into executable trade plan rows.
  - Do not change API field names, IDs, selectors, hook names, REST route names, or MT5 bridge contracts.
- Why this file is in scope:
  - It contains the confirmed over-strict gate that converts structurally valid pending setups into `plan: null`.
- Acceptance criterion tied to failure path:
  - A live, non-confirmed, non-WATCH ARMED signal with `engineBlocker === 'OK'`, sweep, and MSS or clean/strong displacement returns a non-persisted plan tagged `source => 'pending-blueprint'` even when `lifecycle_diagnostic` is missing or unresolved.

**File: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`**
- Exact section to modify: the existing `build_symbol_state()` lifecycle/pending-blueprint regression block beginning around the existing no-prior, `ACTIVE_PRE_ENTRY`, weak-displacement, open-position, and pending-order assertions.
- Exact change required:
  - Add a regression case proving a structurally valid ARMED pending blueprint is emitted without requiring lifecycle diagnostic membership or `pre_lifecycle_status === 'READY'`.
  - Keep the existing assertions that:
    - READY live setups still backend-confirm and produce normal plans.
    - `ACTIVE_PRE_ENTRY` ARMED setups expose pending blueprints.
    - weak-displacement ARMED setups do not expose pending blueprints.
    - `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` remain `WATCH`, not backend-confirmed, and have `plan === null`.
    - pending blueprints are not persisted as executable trade plan rows.
  - If an existing assertion explicitly requires pending blueprints to depend on pre-lifecycle READY rather than structural confirmation, update that assertion to the new structural contract only when the fixture remains structurally invalid.
- Guard rails:
  - Do not weaken stale-data, MT5 authority, cache invalidation, lifecycle hard-suppression, or executable persistence assertions.
  - Do not delete coverage for `ACTIVE_OPEN_POSITION`, `ACTIVE_PENDING_ORDER`, AOV equilibrium, closed session, or MT5 freshness.
  - Do not convert tests into mocked success states that bypass `build_symbol_state()`.
- Why this file is in scope:
  - It already exercises the affected private method through the real `build_symbol_state()` path and verifies downstream snapshot and persistence behavior.
- Acceptance criterion tied to failure path:
  - The test suite fails before the PHP gate change for the missing/unresolved lifecycle pending-blueprint case and passes after the gate is changed to structural confirmation.

### 3. Patch sequence

1. Add or adjust the PHP regression test in `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` for a live ARMED structural setup whose pending blueprint must not depend on lifecycle diagnostic readiness.
2. Run the targeted PHP contract test and confirm the new assertion fails on the current gate.
3. Modify only `build_pending_or_confirmed_plan()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
4. Re-run the targeted PHP contract test and confirm the new and existing pending-blueprint, stale-state, lifecycle suppression, and persistence assertions pass.
5. Run frontend type/build checks only to confirm existing `pending-blueprint` UI/type contracts remain intact; do not edit frontend files unless a real type failure is produced.
6. Run parity and workflow checks listed in Section 4.

Dependencies:
- The test update must precede the implementation change so the failure path is proven.
- The PHP gate change depends on the existing `signal.engine` payload produced by `build_symbol_state()`.
- Frontend changes are not a dependency because `pending-blueprint` is already typed and rendered.

State, cache, migration, and contract sequencing risks:
- No DB migration is allowed.
- Existing engine snapshot caches may continue to serve old `plan: null` results until recomputed; implementation must not add cache invalidation unless current cache tests prove it is necessary.
- API response shape must remain stable: `signal`, `plan`, `diagnostic`, `gate`, and `engineBlocker` fields must not be renamed or moved.

### 4. Regression guards

- Run `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`.
- Run `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`.
- Run `php scripts/parity-validator.php`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run validate:impl`.

Existing protections that must still hold:
- `backendConfirmed` remains the only backend execution confirmation flag.
- `engineBlocker !== 'OK'` still blocks pending and confirmed plan emission.
- `$data_live !== true` still blocks pending blueprint emission.
- `WATCH` status still blocks pending blueprint emission.
- `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` hard-suppression remains `WATCH` with `plan === null`.
- Stale MT5 data remains stale and cannot emit pending blueprints.
- Pending blueprints are never inserted into executable trade plan persistence rows.
- Dashboard may display `pending-blueprint`, but frontend remains non-authoritative for signal truth.

Parity re-validations required:
- Pine formulas must not change.
- Confirm parity output shows no formula drift in fib anchors, entries, stops, targets, and lot sizing.
- Confirm MT5 snapshot contract still exposes pending blueprint plans only as non-executable snapshot payload data.

Logging or diagnostics that should exist after the patch:
- Existing `diagnostic.lifecycle` remains visible when lifecycle data exists.
- Existing `signal.engineBlocker` remains visible and authoritative.
- No new logging is required unless an existing test or production diagnostic path already records pending-plan suppression reasons.

### 5. Non-goals

- Do not edit `src/types/sniper.ts`; `pending-blueprint` is already present.
- Do not edit `src/components/PlanCard.tsx`; pending blueprint rendering already exists.
- Do not change `build_trade_plan()` formulas or risk calculations.
- Do not change Pine script formulas.
- Do not change MT5 execution authority.
- Do not add a persisted plan lifecycle state machine.
- Do not introduce DB migrations or new columns.
- Do not change REST route contracts or response field names.
- Do not relax stale-data, closed-session, AOV equilibrium, anchor chop, quote authority, or engine-blocker protections.
- Do not convert lifecycle diagnostics into the source of execution truth.
- Avoid the attractive but unsafe follow-on of making all ARMED signals produce plans; only structurally confirmed, live, engine-unblocked, non-WATCH signals may produce pending blueprints.
- Avoid the broader lifecycle synchronization redesign in this patch.

### 6. Risk assessment

- Worst-case failure mode if patched incorrectly:
  - The backend emits pending blueprints for weak or transient setups, increasing false-positive dashboard visibility and possibly confusing operators.
- User-visible failure mode:
  - Dashboard shows `PENDING BLUEPRINT` for setups that should remain `NO BLUEPRINT`, or continues to show `NO BLUEPRINT` for structurally valid ARMED setups.
- Backend authority or stale-state risks:
  - The critical risk is accidentally weakening `backendConfirmed`, `$data_live`, or `$engine_blocker` gates. Those gates must remain authoritative.
  - Pending blueprint visibility must not become execution permission.
  - Stale MT5 quotes or stale candles must never produce pending blueprints.
- Human approval before merge:
  - Required. Reviewer must confirm engine field semantics for `sweep`, `mss`, and `displacement`, verify pending blueprints remain non-executable, and confirm no operations workflow treats pending blueprint display as execution approval.

### 7. Test requirements

- Add or update test coverage in `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` for:
  - live ARMED structural setup with missing/unresolved lifecycle diagnostic still emits `source => 'pending-blueprint'`;
  - weak displacement or missing structural confirmation still returns `plan === null`;
  - stale data still returns `plan === null`;
  - `ACTIVE_OPEN_POSITION` and `ACTIVE_PENDING_ORDER` still return `WATCH` and `plan === null`;
  - pending blueprints are not persisted as executable trade plan rows.
- Existing tests or manual checks that must still pass:
  - `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
  - `php scripts/parity-validator.php`
  - `npm run lint`
  - `npm run build`
  - `npm run validate:impl`
- Soak, replay, parity, or live-environment verification needed:
  - Run one snapshot replay or local engine snapshot refresh with at least one live ARMED structural setup and confirm `plans[]` includes `source: pending-blueprint` while trade plan persistence remains unchanged.
  - Confirm stale or closed-session replay does not emit pending blueprints.
  - Human reviewer should inspect parity artifacts after implementation and verify no Pine/backend formula drift is reported.

### 8. Implementation handoff

- Branch naming recommendation:
  - `codex/remove-pr301-overstrict-pending-gate`
- Suggested commit grouping:
  - Commit 1: PHP contract test proving pending blueprint construction no longer depends on lifecycle diagnostic readiness.
  - Commit 2: Minimal PHP gate change in `build_pending_or_confirmed_plan()`.
  - Commit 3: Verification artifact updates only if the implementation workflow requires generated reports to be committed.
- Required reports or artifacts after implementation:
  - Update or attach `reports/fib-parity-validation.md` if `scripts/parity-validator.php` regenerates it.
  - Include command outputs for targeted PHP test, parity validator, lint, build, and implementation validation in the implementation handoff.
  - If a draft PR is opened, include this plan path and the verification results in the PR body.
- State transition required after plan handoff:
  - `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
