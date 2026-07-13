# SMC SuperFIB — Phase 2 Trade Telemetry Implementation Contract

## 1. Issue validation

**What is being validated:** Phase 2 is an additive feature scope, not a defect repair. The issue is the absence of backend-persisted MT5 trade telemetry (positions, pending orders, account metrics) and the absence of read-only dashboard surfaces for that telemetry. The EA bridge route exists but does not yet carry or persist Phase 2 payload fields.

---

**Confirmed**

- The EA bridge route `POST /wp-json/sniper/v1/ea/market-stream` exists and is the correct and only approved extension point for Phase 2 payload. The research report explicitly carries this through from Phase 1 and does not propose a new route.
- Phase 1 payload fields (`symbol`, `bid`, `ask`) are load-bearing and must survive the extension unchanged.
- Backend is the sole source of truth for live trade state. This is established Phase 0/1 architecture and the research report affirms it.
- The stale-position risk is real and critical: a fresh `positions[]` batch is the EA's current truth for that `account_id + terminal_id`, and any previously open position absent from the batch must be swept to `state = closed`. The same rule applies to `pending_orders[]`.
- `POST /user/trades` and `POST /user/account` remain audit-only and non-authoritative. The Phase 2 authority chain is strictly: EA → `/ea/market-stream` → backend persistence → dashboard `GET` reads.
- Direction normalization belongs in the backend at read time, not in the EA. EA emits MT5-native values; backend normalizes (`BUY`/`BUY_LIMIT`/`BUY_STOP` → `LONG`; `SELL`/`SELL_LIMIT`/`SELL_STOP` → `SHORT`).
- Deterministic composite keys are the correct duplicate-ticket strategy: `position:{user_id}:{account_id}:{terminal_id}:{position_id}` and `order:{user_id}:{account_id}:{terminal_id}:{order_id}`.

---

**Likely (assumed correct — implementation agent must verify before patching)**

- Backend does not currently persist `positions`, `pending_orders`, or `account_metrics` from EA payloads. Phase 2 is the first implementation of this persistence layer.
- No `GET` read endpoints for Phase 2 telemetry currently exist. They must be created.
- The existing route handler parses only market-stream fields and will need extension, not replacement.

---

**Unconfirmed (must be resolved by the implementation agent before touching any file)**

- Exact backend file paths for the route handler and persistence layer. The research report does not specify them. Implementation agent must locate by searching for `market-stream` or `ea/market-stream` in the backend codebase (likely a PHP REST API callback registered under the `sniper/v1` namespace).
- Whether any partial or legacy position-persistence code already exists that could conflict with deterministic key insertion.
- Exact dashboard component file paths for the account card, live positions panel, floating P/L display, hedge grouping, and sync health panels. Must be located before Track C changes are written.
- Whether the backend ORM/persistence layer supports upsert on deterministic string composite keys without a dedicated schema migration, or whether a migration file is required.

---

**Rejected hypotheses:** None. The research report contains no speculative hypotheses to reject. All proposals are bounded, additive, and consistent with the existing architecture. No thin-evidence expansions are present.

---

## 2. Implementation contract

### Track A — EA / MT5 payload extension

**File:** MT5 EA `.mq5` / `.mqh` source file — exact path to be confirmed by implementation agent by locating the file that constructs and sends the `POST /wp-json/sniper/v1/ea/market-stream` request.

**Section to modify:** The function that builds the JSON payload and the HTTP POST call.

**Exact change required:**

Extend the JSON payload construction to include all required Phase 2 fields alongside existing Phase 1 fields. The full payload must include:

- Top-level scalars: `schema_version` (value `"phase2.trade_telemetry.v1"`), `user_id`, `account_id`, `terminal_id`, `ea_version`, `terminal_build`, `broker`, `broker_server`, `timestamp` (ISO-8601 UTC), `spread`, `freshness`, `session`, `normalized_symbol`.
- Existing Phase 1 top-level scalars `symbol`, `bid`, `ask` must remain at top level, unchanged in key name, type, and position.
- Array `positions[]` — emitted every telemetry cycle, each object containing: `position_id`, `symbol`, `direction`, `entry_price`, `sl`, `tp`, `volume`, `opened_at`, `state`. An empty array `[]` is valid and signals no open positions.
- Array `pending_orders[]` — emitted every telemetry cycle, each object containing: `order_id`, `symbol`, `order_type`, `direction`, `entry_price`, `sl`, `tp`, `volume`, `placed_at`, `state`. An empty array `[]` is valid.
- Object `account_metrics` — emitted every telemetry cycle, containing: `balance`, `equity`, `margin`, `free_margin`, `floating_pl`.
- Direction values must be emitted as MT5-native strings (`BUY`, `SELL`, `BUY_LIMIT`, `SELL_LIMIT`, `BUY_STOP`, `SELL_STOP`, `BUY_STOP_LIMIT`, `SELL_STOP_LIMIT`). Do not normalize in the EA.

**Guard rails:**
- Must not remove or rename `symbol`, `bid`, `ask` from the payload.
- Must not alter existing EA auth headers.
- Must not alter heartbeat, account-sync, or symbol-sync behavior.
- Must not change the route URL or HTTP method.
- Must not add any client-side trade mutation logic.
- Must not perform direction normalization in the EA.

**Why in scope:** The EA is the upstream data origin. Without correct Phase 2 emission, backend has nothing to persist and dashboard has nothing to read.

**Acceptance criterion:** A single EA POST with full Phase 2 payload is accepted by the backend without error. A backend test fixture receiving this payload must deserialize all Phase 2 fields without schema or parse errors. All 15 Track A sign-off checklist items pass.

---

### Track B — Backend route extension and persistence

#### File 1: Backend EA market-stream route handler

**Location:** Implementation agent must locate by searching for `market-stream` or `sniper/v1` registration in the backend PHP codebase. Expected to be a WordPress REST API callback.

**Section to modify:** The route callback function that processes the POST body.

**Exact change required:**

1. Before any Phase 2 processing, confirm `schema_version` field is present in the payload. If absent, reject the payload, write an audit log entry with the rejection reason, and return an error response. Do not run sweep logic on a payload that fails this gate.
2. Parse `positions[]`, `pending_orders[]`, and `account_metrics` from the incoming payload. Continue to parse and process all existing Phase 1 fields.
3. Extract `account_id`, `terminal_id`, `ea_version` from the payload.
4. Upsert account metrics into `smc_account_telemetry` keyed on `user_id + account_id + terminal_id`. Set `last_seen_at = now()`, `updated_at = now()`, `raw_json` = serialized source object.
5. For each position in `positions[]`: upsert into `smc_trade_positions` using deterministic key `position:{user_id}:{account_id}:{terminal_id}:{position_id}`. Set `state = open`, `last_seen_at = now()`, `updated_at = now()`, `raw_json` = serialized source object.
6. For each pending order in `pending_orders[]`: upsert into `smc_trade_orders` using deterministic key `order:{user_id}:{account_id}:{terminal_id}:{order_id}`. Set `state = active`, `last_seen_at = now()`, `updated_at = now()`, `raw_json` = serialized source object.
7. After upserting positions: sweep — mark `state = closed` on any `smc_trade_positions` row for this `user_id + account_id + terminal_id` where `state = open` and `position_id` does not appear in the current `positions[]` array. This sweep must only run when `schema_version` has passed its gate (step 1).
8. After upserting orders: sweep — mark `state = inactive` on any `smc_trade_orders` row for this `user_id + account_id + terminal_id` where `state = active` and `order_id` does not appear in the current `pending_orders[]` array. Same gate condition.
9. Log each sweep event (position/order IDs swept, reason: absent from fresh batch) to the audit log.
10. Return a success response that does not expose internal persistence IDs or `raw_json`.

**Guard rails:**
- Must not remove or alter existing Phase 1 market-stream parsing.
- Must not bypass existing API-key auth enforcement.
- Must not bypass existing `user_id` validation.
- Must not bypass existing staleness validation.
- Must not allow `POST /user/trades` or `POST /user/account` to become authoritative.
- Sweep logic must be gated strictly behind `schema_version` presence. A payload missing `schema_version` must not trigger any sweep.
- Must not expose `raw_json` to any external response.

**Why in scope:** Backend is the single source of truth. This handler is the only ingestion point for Phase 2 telemetry.

**Acceptance criterion:**
- POST with full Phase 2 payload → positions, orders, account metrics persisted.
- Second POST with same `position_id` → exactly one row exists (upsert, not insert).
- POST with empty `positions[]` (and valid `schema_version`) → previously open positions for that account/terminal marked `state = closed` and excluded from `GET /positions` response.
- POST with no `schema_version` → rejected, audit log entry written, no sweep runs.
- POST with Phase 1-only payload (no Phase 2 fields) → 200 response, no persistence error, Phase 1 behavior unchanged.

---

#### File 2: Backend persistence schema / migration

**Location:** Implementation agent must locate existing schema migration pattern (search for `CREATE TABLE`, `dbDelta`, or equivalent in the backend codebase). A new migration file or migration hook must be added following the existing pattern.

**Section to modify:** Schema migration / table registration.

**Exact change required:**

Add three new tables (do not modify or drop existing tables):

`smc_trade_positions` — columns: `id` (auto PK), `deterministic_key` (unique string), `user_id`, `account_id`, `terminal_id`, `position_id`, `symbol`, `normalized_symbol`, `direction`, `entry_price`, `current_price`, `sl`, `tp`, `volume`, `profit`, `swap`, `commission`, `magic`, `comment`, `opened_at`, `state`, `ea_version`, `last_seen_at`, `updated_at`, `raw_json`.

`smc_trade_orders` — columns: `id` (auto PK), `deterministic_key` (unique string), `user_id`, `account_id`, `terminal_id`, `order_id`, `symbol`, `normalized_symbol`, `order_type`, `direction`, `entry_price`, `sl`, `tp`, `volume`, `magic`, `comment`, `placed_at`, `state`, `ea_version`, `last_seen_at`, `updated_at`, `raw_json`.

`smc_account_telemetry` — columns: `id` (auto PK), `user_id`, `account_id`, `terminal_id`, `balance`, `equity`, `margin`, `free_margin`, `margin_level`, `floating_pl`, `currency`, `leverage`, `ea_version`, `last_seen_at`, `updated_at`, `raw_json`. Unique index on `(user_id, account_id, terminal_id)`.

Each table must have a unique index on its deterministic key or composite natural key as specified above.

**Guard rails:**
- Must not drop, alter, or rename any existing Phase 1 table.
- Must not migrate or backfill any existing Phase 1 data.
- Must not remove existing indexes or constraints.

**Why in scope:** Persistence layer cannot upsert without schema.

**Acceptance criterion:** Migration runs cleanly on a fresh install and on an instance with existing Phase 1 data. No error on re-run (idempotent migration pattern consistent with existing backend practice).

---

#### File 3: Backend GET read endpoints

**Location:** Implementation agent must locate the existing `GET` route registrations under `sniper/v1` and add Phase 2 read routes following the same registration pattern.

**Section to modify:** REST API route registration and corresponding handler callbacks.

**Exact change required:**

Register and implement three new GET endpoints:

- `GET /wp-json/sniper/v1/account-telemetry` — returns current account metrics for the authenticated user. Query `smc_account_telemetry` by `user_id`. Return all fields except `raw_json`.
- `GET /wp-json/sniper/v1/positions` — returns active open positions for the authenticated user. Query `smc_trade_positions` where `user_id = {auth_user_id}` and `state = open`. Apply direction normalization at response serialization: `BUY`/`BUY_LIMIT`/`BUY_STOP` → `LONG`; `SELL`/`SELL_LIMIT`/`SELL_STOP` → `SHORT`. Do not expose `raw_json`.
- `GET /wp-json/sniper/v1/orders` — returns active pending orders for the authenticated user. Query `smc_trade_orders` where `user_id = {auth_user_id}` and `state = active`. Apply direction normalization. Do not expose `raw_json`.

Each endpoint must enforce existing WordPress authentication and `user_id` gating. An unauthenticated request must return 401 or 403.

**Guard rails:**
- Must not return data for a different `user_id` than the authenticated request user.
- Must not allow unauthenticated reads.
- Must not expose `raw_json` in any response.
- Must not perform any write, update, or state mutation.
- Direction normalization must be applied at read/serialize time only, not stored back to the database.

**Why in scope:** Dashboard read-only surfaces require backend GET endpoints. Without them, Track C cannot be implemented correctly.

**Acceptance criterion:** Authenticated GET returns current persisted telemetry with correct direction normalization. Unauthenticated GET returns 401/403. Data returned is scoped to the authenticated user only.

---

### Track C — Dashboard read-only surfaces

**Files:** Dashboard component files for the account card, live positions panel, floating P/L display, hedge grouping component, and sync health panel. Implementation agent must locate exact file paths by searching the dashboard `src/` for these UI panel identifiers before making any changes.

**Section to modify:** Data-fetching logic, hooks, or state selectors within each component.

**Exact change required:**

For each of the five Phase 2 dashboard panels, replace any existing local/mock/manual trade state source with a `GET` fetch to the corresponding backend Phase 2 endpoint:

- Account card → `GET /wp-json/sniper/v1/account-telemetry`
- Live positions panel → `GET /wp-json/sniper/v1/positions`
- Floating P/L display → `floating_pl` from `GET /wp-json/sniper/v1/account-telemetry` or derived from `GET /wp-json/sniper/v1/positions`; do not compute from frontend state
- Hedge grouping → derived client-side from the `GET /wp-json/sniper/v1/positions` response (group by symbol + direction); no separate endpoint required
- Sync health → `GET /wp-json/sniper/v1/health` or equivalent backend health/authority endpoint consistent with existing Phase 1 health surface

Each panel must display a loading or unavailable state when the backend endpoint is unreachable, rather than falling back to local or mock data.

**Guard rails:**
- Must not add any POST from the dashboard that writes or mutates live trade state.
- Must not use `POST /user/trades` or `POST /user/account` as Phase 2 data sources.
- Must not introduce frontend local state that can override or outlive a backend sync response.
- Must not hardcode mock positions, orders, or account values.
- Dashboard changes must be gated: if a backend GET endpoint returns a non-200 or empty response, the panel must display a degraded/unavailable state, not fabricate data.

**Why in scope:** Dashboard is the read-only consumer. Wiring it to the wrong source or allowing any mutation path breaks the Phase 2 authority contract.

**Acceptance criterion:** All five dashboard panels fetch exclusively from backend GET endpoints. No POST to trade mutation endpoints occurs during normal panel render. Dashboard values match the current state persisted by the backend for at least one open position and one pending order scenario.

---

## 3. Patch sequence

**Step 1 — Schema migration (Track B, File 2) — prerequisite, no dependencies**
Add `smc_trade_positions`, `smc_trade_orders`, `smc_account_telemetry` tables with correct unique indexes and column sets.
Must deploy and run before any persistence code is activated.

**Step 2 — Backend route extension: parse + persist + sweep (Track B, File 1)**
Extend `/ea/market-stream` handler to parse Phase 2 payload fields and upsert into the new tables. Implement the missing-position and missing-order sweeps with `schema_version` gate.
Depends on Step 1. Must preserve all Phase 1 parsing.

**Step 3 — Backend GET endpoints (Track B, File 3)**
Register and implement `GET account-telemetry`, `GET positions`, `GET orders` with auth enforcement and direction normalization.
Depends on Step 1 (tables must exist) and Step 2 (data must be writable). Can be developed against Step 1 in parallel with Step 2 if the implementation agent stubs GET responses, but must be integration-tested against Step 2 data before sign-off.

**Step 4 — EA payload extension (Track A)**
Update EA `.mq5` source to emit full Phase 2 payload. Can be developed in parallel with Steps 1–3. Must not be deployed to a live MT5 instance until Step 2 is confirmed deployed and accepting Phase 2 payloads. An EA emitting Phase 2 fields against a Phase 1-only backend is additive and safe (new fields silently ignored), but the reverse (backend expecting Phase 2 before EA emits it) is also safe given the `schema_version` gate.

**Step 5 — Dashboard read wiring (Track C)**
Update the five dashboard panels to fetch from backend GET endpoints. Remove existing local/mock trade state sources.
Depends on Step 3. Must not be merged to main until Step 3 endpoints are confirmed live or available in the target test environment.

**Step 6 — End-to-end verification**
Run full Track A/B/C sign-off checklists. Verify stale-position clearing scenario, broker-reconnect scenario, and direction normalization end-to-end.
Depends on all prior steps.

---

**Sequencing risks:**

- If Step 2 is deployed before Step 1, persistence calls will fail. Schema migration must be confirmed applied before the route extension goes live.
- If Step 5 is merged before Step 3 endpoints are available, the dashboard will attempt to fetch from non-existent endpoints. Gate Track C changes behind endpoint availability.
- EA Phase 2 payload (Step 4) must not be tested against a production MT5 account until Step 2 is confirmed stable in a test or staging environment.
- The sweep logic in Step 2 is the highest-risk atomic unit. It must be deployed as a single atomic change with the upsert logic, not as a separate patch. A partial deployment where upsert lands but sweep does not would leave the system unable to clear stale positions.

---

## 4. Regression guards

**After Step 1 — schema migration:**
- Confirm no existing table is dropped, altered, or renamed.
- Confirm migration is idempotent (re-running does not error).

**After Step 2 — backend route extension:**
- `POST /ea/market-stream` with a Phase 1-only payload (symbol/bid/ask only, no Phase 2 fields, no `schema_version`) returns 200 and does not error.
- Phase 1 market-stream broadcast/distribution behavior is unaffected.
- Existing staleness validation still rejects stale timestamps.
- Existing API-key auth still rejects unauthenticated POSTs.
- A payload missing `schema_version` is rejected with an audit log entry and does not trigger sweep logic.
- Sweep scenario: POST two positions → POST zero positions → GET returns zero open positions.
- Duplicate-ticket scenario: POST same `position_id` twice → exactly one row in `smc_trade_positions`.

**After Step 3 — GET endpoints:**
- Unauthenticated GET returns 401 or 403 on all three endpoints.
- Authenticated GET for user A returns only user A's data.
- Direction normalization is correct on all returned values.
- `raw_json` is not present in any GET response.

**After Step 4 — EA payload:**
- EA still emits Phase 1 fields (`symbol`, `bid`, `ask`) correctly.
- EA heartbeat, account-sync, and symbol-sync behavior unchanged.

**After Step 5 — dashboard:**
- No dashboard panel writes trade state to any backend endpoint.
- Phase 1 dashboard panels (market price, symbol display, connection health) do not regress.
- Panel shows degraded/unavailable state when backend endpoint is unreachable, not mock data.

**Protections that must hold throughout:**
- `POST /user/trades` behavior unchanged (audit-only, non-authoritative).
- `POST /user/account` behavior unchanged (non-authoritative).
- No frontend mutation of live trade state at any point.

**Logging and diagnostics that must exist after the patch:**
- Backend logs every rejected telemetry payload with the reason (missing `schema_version`, auth failure, staleness, malformed field).
- Backend logs `last_seen_at` updates for each accepted account/terminal batch.
- Backend logs each position/order swept to `closed`/`inactive`, recording the `position_id`/`order_id` and the trigger reason (absent from fresh batch).

---

## 5. Non-goals

**Explicitly out of scope for this patch:**

- Any frontend mutation of live trade state.
- Any Pine Script formula changes.
- Any change to the existing `POST /user/trades` or `POST /user/account` endpoint contracts or behavior.
- Trade history, closed-trade archiving, or historical P/L reporting.
- P/L calculations or analytics beyond what is present in EA-supplied fields (`profit`, `swap`, `commission`, `floating_pl`).
- Multi-account or multi-terminal aggregation views.
- Real-time push or WebSocket delivery of Phase 2 telemetry.
- Automated position close execution or any order management from the dashboard.
- Broker-side direct API integration. EA bridge is the only approved ingestion path.
- Mobile or app dashboard surfaces.
- Alert or notification systems triggered by position events.
- Any backend changes unrelated to the three new Phase 2 tables and the route extension.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not add a manual override UI for positions or account metrics — this would break the backend authority contract.
- Do not consolidate `POST /user/trades` into the Phase 2 persistence flow — audit endpoints must remain isolated.
- Do not add frontend caching of trade state with a TTL that could outlive a backend sync — this introduces stale-data risk.
- Do not move direction normalization into the EA — normalize at backend read time only; EA-native values must be preserved in `raw_json`.
- Do not add WebSocket or real-time push in this patch — polling is the correct Phase 2 delivery mechanism given stale-state risk profile.
- Do not add cross-user or admin views of trade telemetry — per-user auth scoping must not be loosened.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

The missing-position sweep logic fires on a partial payload — for example, a network truncation or serialization error causes `positions[]` to arrive empty when trades are actually open in MT5. The sweep marks all open positions as `closed`. The dashboard shows no open positions. The user believes they have no open trades. The condition persists until the next successful full-payload POST.

**User-visible failure mode:**

- Ghost positions: trades closed in MT5 remain visible in the dashboard as open (sweep missing or not running).
- Missing positions: trades open in MT5 do not appear in the dashboard (wrong `state` filter on GET, or incorrect upsert key).
- Incorrect P/L: account metrics show stale `equity`, `floating_pl`, or `balance` because `last_seen_at` is not being updated or the upsert is not firing.
- Direction display errors: `BUY_LIMIT` displayed as `BUY_LIMIT` instead of `LONG` if normalization is not applied.

**Backend authority and stale-state risks:**

- If upsert degrades to insert (key collision handling absent), duplicate position rows accumulate. GET reads return phantom duplicates, inflating position count and P/L display.
- If the `schema_version` gate is absent or bypassed, a malformed or partial payload can incorrectly sweep all active positions/orders to closed state.
- If the sweep query filters on the wrong composite key scope (e.g., sweeps across all users rather than scoping to `user_id + account_id + terminal_id`), a single EA batch can corrupt another user's position state.

**Human approval requirement:**

Yes — the missing-position and missing-order sweep logic (Step 2, points 7–8 in the route handler change) must be reviewed and explicitly approved by a human before the backend extension is merged to main and deployed. This logic is irreversible within a session: once rows are swept to `closed`, the dashboard state reflects that until the next EA batch. Incorrect sweep scope or incorrect gate behavior is user-facing and constitutes a data-display corruption. This specific function requires human review sign-off before production deployment.

---

## 7. Test requirements

**New tests to add:**

1. **Backend — duplicate-ticket upsert (positions)**
   Target: persistence upsert function for `smc_trade_positions`.
   Scenario: POST position with `position_id = X` → POST same `position_id = X` again with updated `entry_price` → assert exactly one row exists, `entry_price` reflects the second value.

2. **Backend — duplicate-ticket upsert (orders)**
   Target: persistence upsert function for `smc_trade_orders`.
   Same pattern as above for `order_id`.

3. **Backend — missing-position sweep (full clear)**
   Target: sweep logic in route handler.
   Scenario: establish two open positions for account/terminal → POST new batch with empty `positions[]` and valid `schema_version` → assert both positions are `state = closed` → assert `GET /positions` returns empty array.

4. **Backend — missing-position sweep (partial)**
   Target: sweep logic in route handler.
   Scenario: establish two open positions → POST new batch with only one of them in `positions[]` → assert the absent position is `state = closed` → assert the present position remains `state = open`.

5. **Backend — missing-order sweep**
   Same pattern as tests 3 and 4 applied to `smc_trade_orders`.

6. **Backend — sweep gate: no schema_version**
   Target: `schema_version` gate in route handler.
   Scenario: establish open positions → POST payload with no `schema_version` field → assert payload is rejected → assert positions remain `state = open` (no sweep ran) → assert audit log entry written.

7. **Backend — Phase 1 backward compatibility**
   Target: `/ea/market-stream` route handler.
   Scenario: POST a Phase 1-only payload (only `symbol`, `bid`, `ask`, valid auth, valid user_id) → assert 200 response → assert no persistence error → assert Phase 1 behavior unchanged.

8. **Backend — GET endpoint auth enforcement**
   Target: all three new GET endpoints.
   Scenario: unauthenticated GET → assert 401 or 403.
   Scenario: authenticated GET for user A → assert response contains only user A's records.
   Scenario: user A's data must not appear in user B's authenticated response.

9. **Backend — direction normalization at GET**
   Target: GET positions and GET orders response serializer.
   Scenario: persisted position with `direction = BUY_LIMIT` → `GET /positions` returns `direction = LONG`.
   Scenario: persisted position with `direction = SELL_STOP` → `GET /positions` returns `direction = SHORT`.
   Scenario: persisted position with `direction = BUY` → `GET /positions` returns `direction = LONG`.
   Scenario: persisted order with `direction = SELL` → `GET /orders` returns `direction = SHORT`.

10. **Backend — raw_json not exposed**
    Target: GET endpoint response serializers.
    Scenario: any GET to account-telemetry, positions, or orders → assert `raw_json` key is absent from response body.

11. **Dashboard — read-only source verification**
    Target: each of the five Phase 2 dashboard components.
    Scenario: render each panel → assert no HTTP POST to trade mutation endpoints occurs.
    Scenario: mock backend GET to return empty → assert panel renders degraded/unavailable state, not fabricated data.
    Scenario: mock backend GET to return one open position → assert panel displays that position using the normalized `LONG`/`SHORT` direction value.

**Existing tests that must still pass:**

- All Phase 1 market-stream tests (symbol broadcast, bid/ask delivery, staleness rejection, auth rejection).
- All existing `POST /user/trades` audit endpoint tests.
- All existing `POST /user/account` tests.
- All existing dashboard Phase 1 panel render tests.

**Soak and live-environment verification:**

- After deployment to a test/staging environment, run the EA against a demo MT5 account for a minimum of one full trading session.
- Verify: position opened in MT5 → appears in dashboard live positions panel.
- Verify: position closed in MT5 → no longer appears in dashboard after next EA batch (sweep confirmed).
- Verify: MT5 terminal restart (broker reconnect) → no ghost positions remain in dashboard after first post-reconnect batch.
- Verify: EA sends a batch with empty `positions[]` deliberately → dashboard confirms all previously open positions are cleared.
- Verify: dashboard account card displays `balance`, `equity`, `floating_pl` values matching MT5 terminal display within one polling interval.

---

## 8. Implementation handoff

**Branch naming recommendation:**
`codex/phase2-trade-telemetry-implementation`

**Suggested commit grouping:**

1. `feat(schema): add Phase 2 trade telemetry tables — positions, orders, account_telemetry`
2. `feat(backend): extend /ea/market-stream to parse and persist Phase 2 trade telemetry with sweep logic`
3. `feat(backend): add GET read endpoints for account-telemetry, positions, and orders`
4. `feat(ea): extend market-stream payload with Phase 2 trade telemetry fields`
5. `feat(dashboard): wire Phase 2 read-only panels to backend GET telemetry endpoints`
6. `test: add Phase 2 upsert, sweep, gate, auth, normalization, and read-only surface tests`

Each commit must be independently deployable in sequence. Commits 1–3 must deploy before commit 4 is activated against a live backend. Commit 5 must deploy after commit 3 is confirmed live.

**Required reports and artifacts after implementation:**

- `reports/phase2-track-a-signoff.md` — completed Track A checklist with evidence for each item
- `reports/phase2-track-b-signoff.md` — completed Track B checklist with evidence for each item
- `reports/phase2-track-c-signoff.md` — completed Track C checklist with evidence for each item
- `reports/phase2-implementation-closeout.md` — implementation closeout report covering: files changed, tests added, regression results, soak verification results, known risks at time of merge, and any deferred items

**Human review gate:**

The backend route extension commit (commit 2) must receive explicit human review and approval before merge to main. The sweep logic contained in this commit is the highest-risk unit in this patch. This review requirement is not waivable.

**State transition:**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
