# SMC SuperFIB - Phase 1 MT5 Heartbeat / API Contract Plan

## 1. Issue validation

**Confirmed:**
- `POST /wp-json/sniper/v1/ea/market-stream` is the sole MT5-facing REST route registered in `smc-superfib-sniper.php`. No `POST /heartbeat`, `POST /account-sync`, `POST /symbol-sync`, or `GET /license-check` routes exist in the current plugin route table.
- The backend heartbeat/health contract is implemented as a side-effect of market-stream ingestion: successful EA pushes insert `engine_runs` rows with `status='heartbeat'` and `summary={"source":"ea_push","symbol":...}`. The `/health` endpoint reads these rows to derive `backendSync`. Source: `smc-superfib-sniper.php` + `test-ea-market-stream.php`.
- `.github/migration-status.md` explicitly lists `POST /heartbeat`, `POST /account-sync`, `POST /symbol-sync`, and `GET /license-check` as Phase 1 deliverables. None are implemented.

**Likely:**
- The Phase 1 deliverables list is the canonical contract and not a placeholder. The migration document names distinct routes with distinct semantics rather than extensions of the ingest path, indicating intentional API surface expansion rather than a documentation artifact.
- Account and symbol sync semantics are currently implicit in EA payload normalization performed in `SMC_MarketDataEA.mq5` before POST. No dedicated backend persistence for account state or broker symbol lists exists. This is a known gap between current code and the Phase 1 spec.
- The existing `engine_runs` heartbeat row is serving as an interim health contract while the Phase 1 API surface is being prepared, not as the permanent heartbeat contract.

**Unconfirmed:**
- Whether `GET /license-check` is a Phase 1 gate requirement or deferred to a later phase. The research report surfaces it as a Phase 1 deliverable but does not confirm implementation urgency.
- Whether MT5 EA clients, the dashboard, or any frontend code holds hardcoded references to upcoming Phase 1 route names that would constrain naming decisions.
- Whether dedicated Phase 1 routes are intentionally absent because a separate backend branch is already in flight. This must be verified before any file changes begin.
- Whether a new database table is required for account-sync and symbol-sync persistence, or whether existing schema can accommodate it. This is a sequencing risk that must be resolved before handler implementation.

**Decision gate — must be cleared before implementation begins:** Confirm with the project owner: (a) all three dedicated sync routes are required in this patch cycle; (b) `GET /license-check` is or is not in Phase 1 scope; (c) no parallel backend branch already defines these routes; (d) whether account-sync and symbol-sync state requires a new DB table or maps to existing schema. Record this decision in the PR description before any file changes are committed.

---

## 2. Implementation contract

Implementation target is **Path A** from the research report: add dedicated Phase 1 routes while preserving `POST /ea/market-stream` exactly as-is. Path B is rejected because the migration document explicitly names separate routes; folding semantics into the market-stream payload would contradict the canonical contract and make phase-gate validation ambiguous.

---

### File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Section to modify:** The `register_rest_route` block for the `sniper/v1` namespace. Add new route registrations after the existing `market-stream` registration. Do not touch the existing registration.

**Exact change required:**
1. Register `POST /wp-json/sniper/v1/ea/heartbeat`. Handler accepts `{ api_key, user_id, symbol, timestamp }`. On valid auth, inserts an `engine_runs` row with `status='heartbeat'` and `summary={"source":"explicit_heartbeat","symbol":...}`. Must reuse the existing `engine_runs` insert logic — do not duplicate it; extract to a private method only if the extraction is zero-risk (i.e., the existing market-stream handler calls the same method without behavioral change).
2. Register `POST /wp-json/sniper/v1/ea/account-sync`. Handler accepts `{ api_key, user_id, account_id, broker, account_info }`. On valid auth, persists account state to backend storage. Must not write to or read from `engine_runs`. Must not overwrite EA-normalized symbol data.
3. Register `POST /wp-json/sniper/v1/ea/symbol-sync`. Handler accepts `{ api_key, user_id, symbols[] }`. On valid auth, persists the broker symbol list. Must not discard or re-normalize symbols that the EA already normalized before POST.
4. Register `GET /wp-json/sniper/v1/ea/license-check`. Handler validates `api_key` and `user_id` and returns license validity. **Gated: implement only after the decision gate in Section 1 confirms this is Phase 1 scope.**

**Guard rails — must not change:**
- `POST /wp-json/sniper/v1/ea/market-stream` route registration, handler, payload contract, auth logic, and `engine_runs` heartbeat side-effect must remain unchanged.
- The existing `ApiKey` + `UserId` auth validation pattern must be reused verbatim on all new routes. Auth must not be weakened, skipped, or replaced with a new mechanism.
- The `engine_runs` table schema must not be altered.
- `backendSync` derivation logic in the `/health` route must not be changed.
- No new global state, plugin options, or `wp_options` keys may be introduced without explicit confirmation that they do not conflict with existing keys.

**Why this file is in scope:** It is the sole PHP file registering MT5-facing REST routes in the WordPress plugin. Phase 1 routes must be registered here to be visible to the WordPress REST infrastructure.

**Acceptance criterion:** `WP_REST_Server::get_routes()` returns all new route paths. Each new route returns HTTP 401 on missing or invalid `api_key`/`user_id`. A valid `POST /ea/heartbeat` call inserts an `engine_runs` row that does not interfere with a simultaneous `POST /ea/market-stream` row. A valid `POST /ea/account-sync` call does not produce any `engine_runs` row.

---

### File: `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`

**Section to modify:** Append new test methods after the last existing test method. Do not modify any existing test method, assertion, or helper.

**Exact change required:**
1. `test_heartbeat_route_inserts_engine_runs_row()` — sends valid auth to `POST /ea/heartbeat`, asserts an `engine_runs` row exists with `status='heartbeat'` and `summary.source='explicit_heartbeat'`.
2. `test_heartbeat_route_rejects_invalid_auth()` — sends missing or wrong `api_key` to `POST /ea/heartbeat`, asserts HTTP 401 and no `engine_runs` row written.
3. `test_account_sync_persists_state_without_engine_runs_corruption()` — sends valid auth to `POST /ea/account-sync`, asserts account state is persisted and the `engine_runs` row count is unchanged.
4. `test_symbol_sync_persists_symbol_list()` — sends valid auth to `POST /ea/symbol-sync` with a pre-normalized symbol list, asserts symbols are persisted and EA-provided normalization is not overwritten.
5. `test_license_check_validates_auth()` — gated: add only if `GET /license-check` is confirmed in Phase 1 scope.

**Guard rails — must not change:**
- All existing test assertions must remain byte-for-byte identical and must continue to pass.
- Do not extract, refactor, or rename existing test helpers or setup methods.

**Why this file is in scope:** It is the established coverage file for the EA ingestion surface. New Phase 1 route coverage belongs here to preserve test locality and avoid orphaned test files.

**Acceptance criterion:** `vendor/bin/phpunit` against this file produces zero failures. All pre-existing assertions pass. At minimum four new test cases pass.

---

### File: `.github/migration-status.md`

**Section to modify:** Phase 1 checklist items for `POST /heartbeat`, `POST /account-sync`, `POST /symbol-sync`, and `GET /license-check`.

**Exact change required:** Mark each implemented route's checklist item as complete (`[x]`) only after its acceptance criterion is met and CI passes. Do not add new checklist items. Do not modify any Phase 0 or Phase 2+ entries.

**Guard rails — must not change:**
- Phase 0 soak status, checklist entries, and soak tracker references must remain intact.
- Phase 2+ items must not be pre-marked or altered.
- No editorial changes to section structure or surrounding prose.

**Why this file is in scope:** It is the authoritative migration governance document. Phase-gate checks read this file. Unchecked items that are actually implemented produce false-negative gate reads; prematurely checked items produce false-positive gate reads.

**Acceptance criterion:** Each Phase 1 route checklist item is marked complete exactly when, and only when, its corresponding route acceptance criterion above is satisfied and tests pass. This file is the last artifact updated in the patch sequence.

---

### File: `mt5/SMC_MarketDataEA.mq5`

**No change in this patch.** The EA currently sends to `POST /ea/market-stream` with broker-normalized symbols and auth credentials. The backend is the authority for new route semantics. The EA must not be patched until the backend Phase 1 routes are live and validated. Changing the EA prematurely risks breaking the live MT5 ingest path. A separate deferred task may update `WebhookURL` or add explicit heartbeat/account-sync calls from the EA after Phase 1 routes are production-verified.

---

## 3. Patch sequence

1. **Clear decision gate** (no code). Confirm Phase 1 scope, `license-check` gating, absence of parallel backend branch, and DB schema sufficiency for account-sync and symbol-sync. Record decision in the PR description. Implementation must not proceed past this point without a recorded decision.

2. **Add route registrations (stubs, no handler bodies) to `smc-superfib-sniper.php`**. Each new route returns HTTP 501 from a stub handler. This step confirms the routes are visible to WordPress REST infrastructure before any handler logic is written. CI must pass.

3. **Verify existing `POST /ea/market-stream` is unaffected**. Run the full existing `test-ea-market-stream.php` suite immediately after step 2. If any existing test fails, stop. Do not proceed to step 4 until all existing tests pass against the modified file.

4. **Implement `POST /ea/heartbeat` handler**. Reuse the `engine_runs` insert logic. Run full test suite again.

5. **Confirm DB schema for account-sync and symbol-sync**. If the existing schema is sufficient, proceed. If a new table is required, halt and raise a separate migration task. Do not proceed with handler implementation until the schema question is resolved.

6. **Implement `POST /ea/account-sync` and `POST /ea/symbol-sync` handlers**. Run full test suite.

7. **Implement `GET /ea/license-check` handler** (gated — only if confirmed in Phase 1 scope by the decision gate).

8. **Add new test cases to `test-ea-market-stream.php`**. Run full suite to zero failures.

9. **Update `.github/migration-status.md` checklist**. This is the final commit. Must not be made until all new route tests pass and CI is green.

**Sequencing risks:**
- If the `engine_runs` insert logic is inlined in the market-stream handler (not in a shared private method), step 4 requires careful extraction. Extraction must not change the existing handler's behavior. If the risk of extraction is judged too high, the heartbeat handler may duplicate the minimal insert call rather than extract — but this must be a deliberate decision, not an accident.
- If a new DB table is required for account-sync or symbol-sync (step 5 gate), this patch cannot be completed without a migration. The migration is a blocking dependency with its own sequencing risk and must be tracked separately.
- Step 9 (migration status update) is strictly last. Marking checklist items complete before tests pass is a governance violation.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**
- `vendor/bin/phpunit` against `test-ea-market-stream.php` must produce zero failures.
- Send a valid EA payload to `POST /wp-json/sniper/v1/ea/market-stream` and confirm an `engine_runs` row is written with `status='heartbeat'` and `summary.source='ea_push'`. This must work identically to pre-patch behavior.
- Query the `/health` endpoint and confirm `backendSync` reflects live EA activity based on `engine_runs` rows from `market-stream`, not from the new `explicit_heartbeat` path alone.
- Send requests with missing `api_key` to each new route and confirm HTTP 401 on all of them.
- Confirm no new route shares a handler code path with `market-stream` in a way that could corrupt market data ingestion.

**Existing protections that must still hold:**
- Auth gate (ApiKey + UserId) on `market-stream` must not be weakened or reachable via any new route.
- `engine_runs` row insertion is the sole authoritative signal for `backendSync` health. No new health signal source may be introduced.
- Symbol normalization performed by the EA before POST must be accepted as-is by all new backend handlers.

**Parity re-validations required:**
- MT5 EA ↔ backend REST: confirm `POST /ea/market-stream` payload shape and auth fields are byte-for-byte unchanged after the PHP file is modified. Any accidental whitespace or encoding change to the existing route registration is a regression.
- Backend health ↔ dashboard: confirm the dashboard health panel still shows `backendSync: live` status based on `market-stream` pushes after new routes are added. The new `explicit_heartbeat` source must not suppress or replace `ea_push` rows in the health query.

**Logging and diagnostics that must exist after the patch:**
- Each new route handler must emit a debug log entry (using the plugin's existing logging mechanism, or `error_log` if none exists) on success, on auth failure, and on any DB error. This is required to provide an audit trail during Phase 1 soak and to distinguish `explicit_heartbeat` from `ea_push` sources in operational monitoring.

---

## 5. Non-goals

**Out of scope for this patch:**
- Any modification to `mt5/SMC_MarketDataEA.mq5`.
- Any modification to the `POST /wp-json/sniper/v1/ea/market-stream` route, handler, payload contract, or auth model.
- Any change to the `engine_runs` table schema.
- Any change to `backendSync` derivation logic in the `/health` route.
- Frontend or dashboard components for Phase 1 routes.
- Any Phase 2 or Phase 3 deliverables.
- Broker symbol normalization logic — the EA is the authority for normalization before POST.
- Multi-account or multi-broker orchestration beyond what a single account-sync payload requires.
- Any Pine Script formula, signal generation, or SuperFIB calculation changes.
- DB schema migration tasks — if a new table is required, that is a separate task with its own governance.

**Attractive but unsafe follow-on changes to avoid in this patch:**
- Refactoring the existing `market-stream` handler to share code with new handlers. This risks introducing regressions in the live MT5 ingest path. Defer to a dedicated refactor task after Phase 1 is validated.
- Replacing the `engine_runs` interim heartbeat mechanism with a more structured dedicated heartbeat table. That is a schema migration requiring its own governance and is not part of this contract patch.
- Updating the EA's `WebhookURL` to point at new Phase 1 endpoints. The EA must remain on `market-stream` until Phase 1 routes are validated in production.
- Merging `GET /license-check` before the decision gate confirms it is a Phase 1 requirement.
- Adding rate limiting, IP allowlisting, or other auth hardening to new routes. Auth must reuse the existing pattern exactly; hardening is a separate security task.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
A poorly isolated new route handler modifies the `engine_runs` insert path shared with `market-stream`, causing heartbeat rows to be written with wrong `summary` metadata, or causing the existing insert to be called twice per `market-stream` push. The `/health` endpoint reads these rows and reports `backendSync` as live when the MT5 EA has actually stopped sending data. This is a silent stale-state failure: the dashboard displays healthy while the EA bridge is dead and no live tick data is flowing.

**User-visible failure mode:**
The dashboard health panel shows `backendSync: live` with no actual MT5 tick data flowing. Trading signals on the dashboard appear current but are derived from stale market data. This is high-severity because it misleads the trader into acting on a signal derived from a dead feed.

**Backend authority and stale-state risks:**
- If `POST /ea/account-sync` or `POST /ea/symbol-sync` handlers overwrite EA-normalized symbol state, subsequent `market-stream` ingestion may fail symbol lookups or produce incorrect parity between MT5 broker symbols and backend symbol records.
- If auth validation is accidentally omitted or weakened on any new route, unauthorized agents could inject fake heartbeats, fake account state, or fake symbol lists, corrupting the backend's view of live trading state.
- If the `engine_runs` schema is silently altered (e.g., by a handler that adds an unexpected column via `$wpdb->insert()`), the health query may break.

**Human approval required before merge:** Yes. The Phase 1 API contract names, auth model, and whether heartbeat/account/symbol sync should be implicit or explicit are architectural decisions that affect migration governance, MT5 bridge integrity, and dashboard health semantics. The decision gate in Section 3 Step 1 must be documented in the PR before merge. A human reviewer must confirm the gate was cleared and the decision recorded before approving.

---

## 7. Test requirements

**Tests to add, with exact target area:**
In `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`:
- `test_heartbeat_route_inserts_engine_runs_row()` — target: `POST /ea/heartbeat` handler, `engine_runs` insert path, `summary.source` field value.
- `test_heartbeat_route_rejects_invalid_auth()` — target: auth guard on `POST /ea/heartbeat`, HTTP 401 response, absence of any DB write.
- `test_account_sync_persists_state_without_engine_runs_corruption()` — target: `POST /ea/account-sync` handler, account persistence path, `engine_runs` row count invariance.
- `test_symbol_sync_persists_symbol_list()` — target: `POST /ea/symbol-sync` handler, symbol persistence path, EA-normalized symbol preservation.
- `test_license_check_validates_auth()` — gated: add only if `GET /license-check` enters Phase 1 scope per the decision gate.

**Existing tests that must still pass:**
- All pre-existing assertions in `test-ea-market-stream.php`, including the test that asserts an EA push to `market-stream` writes a `backendSync` heartbeat row, auth rejection tests, and payload validation tests.
- Any CI workflow in `.github/workflows/` that runs the PHP test suite must remain green.

**Soak and live-environment verification needed:**
- After deployment to staging: send a valid `POST /ea/heartbeat` from a test MT5 EA instance and confirm an `engine_runs` row is created with `summary.source='explicit_heartbeat'`.
- Confirm the dashboard health panel continues to show `backendSync: live` when `market-stream` pushes are the only source of `engine_runs` rows (i.e., the new `explicit_heartbeat` source is not required for health).
- Run a minimum 30-minute soak with the live MT5 EA sending only `market-stream` pushes and confirm `backendSync` does not drop during the soak period. This validates that the new code does not interfere with the existing health contract.

---

## 8. Implementation handoff

**Branch naming recommendation:** `codex/phase1-mt5-api-contract`

**Suggested commit grouping:**
1. `feat(backend): register Phase 1 REST route stubs with auth guard` — route registrations only, stub handlers returning HTTP 501, no business logic. Allows CI to confirm route visibility before handlers are written.
2. `feat(backend): implement POST /ea/heartbeat handler` — heartbeat handler with `engine_runs` insert. Existing tests must still pass after this commit.
3. `feat(backend): implement POST /ea/account-sync handler` — account state persistence, no `engine_runs` interaction.
4. `feat(backend): implement POST /ea/symbol-sync handler` — symbol list persistence, EA-normalized symbols preserved.
5. `feat(backend): implement GET /ea/license-check handler` — gated; commit only if confirmed in Phase 1 scope.
6. `test(backend): add Phase 1 route coverage to test-ea-market-stream` — new test cases only, no existing test modifications.
7. `chore(migration): mark Phase 1 API contract checklist items complete` — `.github/migration-status.md` update only; this is the final commit and must not be made until all prior commits are CI-green.

**Required reports and artifacts after implementation:**
- This document (`reports/codex-plan.md`) with any deviation notes appended by the implementation agent if scope changed during execution.
- CI run output showing all existing and new PHP tests passing with zero failures.
- Staging soak evidence: `engine_runs` row dumps from both `ea_push` (market-stream) and `explicit_heartbeat` (heartbeat route) sources confirming no schema corruption and correct `summary.source` values.
- PR body must include: one paragraph summarising the Phase 1 API contract gap; root cause (no dedicated routes, heartbeat implicit via market-stream side-effect); exact files changed and what changed in each; regression protections confirmed (auth guard, engine_runs integrity, backendSync derivation, market-stream handler unchanged); parity impact (MT5 EA bridge ↔ backend REST ↔ dashboard health panel); Do Not Touch list (mt5/SMC_MarketDataEA.mq5, market-stream handler, engine_runs schema, Pine Script, backendSync health query).

**State transition:** `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
