# SMC SuperFIB Full-Stack Codebase Cleanup & Bug Sweep Report (2026-04-29)

## 1. Problem Areas

### [RSE-01] Full test suite is not portable due to hardcoded local PHP CLI path

- File(s): `tests/php/php-cli-path.txt`, `tests/helpers/run-php-tests.js`
- Layer: Supporting config / test
- Severity: High
- Problem: `npm test` fails in non-Windows/XAMPP environments because the PHP binary path is pinned to `C:\xampp\php\php.exe`.
- Evidence: `npm test --silent` fails with `spawnSync C:\xampp\php\php.exe ENOENT` after all Node tests pass.
- Impact: CI and local validation can report false-negative build status; backend regressions may be missed because PHP tests never execute.
- Why this matters: This blocks reliable stale-data/signal-engine regression testing in shared environments.

### [RSE-02] Refresh throttling/state guard has split responsibilities across manual + auto paths

- File(s): `assets/js/sniper-dashboard-core.js`
- Layer: Dashboard JS
- Severity: Medium
- Problem: `fetchPrices` uses `_lastCall` throttling while `startAutoRefresh` forcibly nulls `_lastCall` before interval fetches.
- Evidence: Comments and logic around `_lastCall` and interval reset indicate a patch-on-patch guard model rather than single-source refresh gate.
- Impact: Future edits can easily reintroduce blocked refreshes or burst fetches; stale/live indicators can drift from actual backend update cadence.
- Why this matters: Refresh reliability is core to live signal truth and stale prevention.

### [WH-01] Silent catch blocks in template-local storage/theme helpers can hide runtime faults

- File(s): `templates/dashboard-ui.html`
- Layer: Template / UI bootstrap JS
- Severity: Medium
- Problem: Local helper functions swallow exceptions with empty `catch {}`.
- Evidence: `sfxLoad`/`sfxSave` and related handlers suppress storage/UI errors without telemetry.
- Impact: User-facing state issues (theme/density/prefs) can fail silently, making “false live” perception harder to debug.
- Why this matters: Hidden failures impede operational triage during stale-state incidents.

### [DC-01] Version contract drift risk between Pine source filename and platform runtime versioning

- File(s): `SMC_SuperFib_v10.16.1.pine`, `sniper-webhook.php`, `assets/js/sniper-dashboard-core.js`
- Layer: Pine / Backend / Dashboard JS / Data contract
- Severity: Medium
- Problem: Pine file is named `v10.16.1` while backend/frontend runtime declares `12.0.9.1` schema/engine.
- Evidence: Plugin constant and JS schema are `12.0.9.1`; Pine artifact naming suggests different release lineage.
- Impact: Operator confusion and parity drift risk when validating F1/F2/F3 behavior against backend/dashboard assumptions.
- Why this matters: Cross-layer parity depends on unambiguous version alignment.

### [DUP-01] Competing planner/rendering logic paths increase wiring fragility

- File(s): `assets/js/sniper-dashboard-core.js`, `assets/js/sniper-dashboard-planner.js`
- Layer: Dashboard JS
- Severity: Medium
- Problem: Both files contain overlapping plan output/DOM targeting responsibilities (plan verdict/ladders/checklist/risk/gates).
- Evidence: Repeated `document.getElementById('plan-*')` access patterns and planning flows across both modules.
- Impact: Future bug fixes can land in one path but not the other, causing inconsistent plan rendering and UI/backend mismatch.
- Why this matters: Duplicate logic is a common source of stale UI truth.

### [PAR-01] F1/F2/F3 Pine audit status is test-backed but tightly coupled to string-level source guards

- File(s): `tests/pine/pine-fib-parity.test.js`, `SMC_SuperFib_v10.16.1.pine`
- Layer: Pine / test
- Severity: Low
- Problem: Pine parity protection includes source-wiring checks that can be brittle to harmless rename/reformat changes.
- Evidence: Test includes explicit “retains audited timeframe and draw wiring” assertions.
- Impact: Legitimate maintenance edits may fail tests without functional regressions.
- Why this matters: Raises noise floor and can discourage safe cleanup around F1/F2/F3 plumbing.

### [UI-01] Debug/state instrumentation is production-adjacent and mixed into core runtime flow

- File(s): `assets/js/sniper-dashboard-core.js`, `sniper-webhook.php`
- Layer: Dashboard JS / Backend
- Severity: Low
- Problem: Debug traces/state capture are heavily interleaved with runtime logic.
- Evidence: Numerous `DEBUG_TRACE` blocks and persisted `sniper_last_tv_alert*` debug options.
- Impact: Increased cognitive load; higher chance of accidental behavior coupling during bug fixes.
- Why this matters: Cleanup should separate must-keep observability from obsolete debug noise.

## 2. Proposed Minimal Fixes

### [FIX-RSE-01] Make PHP test runner path-resilient

- Fixes problem(s): RSE-01
- Files to touch: `tests/helpers/run-php-tests.js`, optional `tests/php/php-cli-path.txt`
- Minimal change: Resolve PHP binary via env var (`PHP_BIN`), fallback to `php` on PATH, then optional local path file.
- What not to change: Actual PHP test assertions/fixtures.
- Risk level: Low
- Regression test: `npm run test:php` on both Windows and Linux.
- Acceptance criteria: PHP tests execute instead of ENOENT in this environment.

### [FIX-RSE-02] Consolidate refresh guard semantics into one helper

- Fixes problem(s): RSE-02
- Files to touch: `assets/js/sniper-dashboard-core.js`
- Minimal change: Extract `_lastCall` and interval reset policy into a named helper used by both manual and auto refresh paths.
- What not to change: Refresh interval values and backend endpoint contract.
- Risk level: Medium
- Regression test: `tests/browser/dashboard-core.test.js` + manual click/auto-refresh timing verification.
- Acceptance criteria: No blocked manual refresh after background refresh; no duplicate burst calls.

### [FIX-WH-01] Replace silent catches with bounded warnings

- Fixes problem(s): WH-01
- Files to touch: `templates/dashboard-ui.html`
- Minimal change: Add non-fatal `console.warn` (or shared toast-safe logger) in currently empty catches.
- What not to change: Theme/density UX behavior and stored keys.
- Risk level: Low
- Regression test: Simulate localStorage quota/security error and verify UI still loads.
- Acceptance criteria: Failures are observable without breaking page boot.

### [FIX-DC-01] Add explicit cross-layer version mapping note

- Fixes problem(s): DC-01
- Files to touch: `README.md` and/or `Indicator Update Log.md`
- Minimal change: Document Pine artifact lineage vs platform runtime version equivalence.
- What not to change: Trading logic and alert payload schema.
- Risk level: Low
- Regression test: N/A (doc-only)
- Acceptance criteria: Operators can reconcile Pine/backend/dashboard versions unambiguously.

### [FIX-DUP-01] Designate one planner render authority, keep thin bridge in the other file

- Fixes problem(s): DUP-01
- Files to touch: `assets/js/sniper-dashboard-core.js`, `assets/js/sniper-dashboard-planner.js`
- Minimal change: Keep existing public API names, route duplicate rendering calls through one module, deprecate duplicate path with comments.
- What not to change: DOM IDs, plan layout, or backend authority model.
- Risk level: Medium
- Regression test: `tests/browser/dashboard-planner.test.js` and full plan generation smoke.
- Acceptance criteria: Same UI output with a single maintained render path.

### [FIX-PAR-01] Relax brittle Pine wiring assertions to intent-based checks

- Fixes problem(s): PAR-01
- Files to touch: `tests/pine/pine-fib-parity.test.js`
- Minimal change: Prefer functional/parity checks over exact string-shape guards where possible.
- What not to change: F1/F2/F3 math parity assertions.
- Risk level: Low
- Regression test: `npm run test:pine`
- Acceptance criteria: Tests still catch true F1/F2/F3 regressions while tolerating harmless refactors.

## 3. Recommended Patch Order

1. **FIX-RSE-01** (critical validation blocker: PHP tests not executing).
2. **FIX-RSE-02** (refresh/stale truth reliability).
3. **FIX-DUP-01** (wiring stability for plan rendering).
4. **FIX-WH-01** (failure observability for UI state helpers).
5. **FIX-DC-01** (cross-layer version parity clarity).
6. **FIX-PAR-01** (test brittleness cleanup).

## 4. Do Not Touch List (without separate approval)

- `sniper-execution-engine.php` order sizing/entry/SL/TP calculations (high trading-risk surface).
- Backend REST handlers that persist live signal truth and regime state in `sniper-webhook.php`.
- Pine fib formulas and anchor-direction logic for F1/F2/F3 unless parity test + fixture evidence shows concrete defect.
- Dashboard-to-backend posting contract (`postEngineToBackend` and server batch routes) except for narrowly scoped bug fixes.
