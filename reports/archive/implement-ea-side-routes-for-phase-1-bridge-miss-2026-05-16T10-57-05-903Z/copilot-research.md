# EA Side Routes Phase 1 Bridge Implementation — Research Report

## 1. Issue classification
- **Severity:** CRITICAL
- **Category:** wiring, data-contract, migration-governance
- **Layer(s) affected:** MT5 EA (MQL5), PHP-backend REST-API, workflow
- **Phase impact:** Phase 1 (blocks phase progression to live validation)

---

## 2. Confirmed evidence

### Backend Routes — All Implemented and Tested
- **Route implementations confirmed in:** [smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L478-L498)
  - `POST /ea/heartbeat` — Appends `engine_runs` row, stores account telemetry
  - `POST /ea/account-sync` — Stores EA bridge state under `smc_sf_account_snapshots` JSON blob
  - `POST /ea/symbol-sync` — Persists to dedicated `smc_sf_symbol_sync` table with upsert semantics
  - `GET /ea/license-check` — Operational auth gate using EA API-key + user_id

- **Test coverage:** All backend routes have PHP unit tests at `wordpress/smc-superfib-sniper/tests/php/`:
  - [test-ea-heartbeat.php](wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php) — PASS
  - [test-ea-account-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php) — PASS
  - [test-ea-symbol-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php) — PASS
  - [test-ea-license-check.php](wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php) — PASS

- **Auth contract confirmed:** All routes use `permission_ea_bridge` permission callback, expecting:
  - Header: `X-EA-API-Key` matching `SMC_SF_EA_API_KEY` env var
  - Payload field: `user_id` (WordPress user ID)

- **Baseline route working:** `POST /ea/market-stream` already implemented and called from EA at:
  - [MarketDataEngine.mqh line 357](mt5/MarketDataEngine.mqh#L357) inside `SendToBackend()` function
  - Current httpStatus: 422 (payload validation — freshness gate rejecting old candles, route is reachable)

### MT5 EA Side — Critical Gaps

**Confirmed missing implementations:**
1. **`GET /ea/license-check`** — Not called during EA OnInit()
2. **`POST /ea/heartbeat`** — Not called from EA OnTimer()
3. **`POST /ea/account-sync`** — Not called from EA OnInit() or OnTimer()
4. **`POST /ea/symbol-sync`** — Not called from EA OnInit()

**Current EA structure (from [SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5)):**
- `OnInit()` at line 119: Validates config, resolves symbols, calls `engine.Initialize()`, sets timer. **No license gate.**
- `OnTimer()` at line 200: Polls non-chart symbols, calls `engine.OnPeriodic()`. **Heartbeat/account-sync missing.**
- `OnTick()` at line 192: Passes tick to engine. (No changes needed.)

**MarketDataEngine structure (from [MarketDataEngine.mqh](mt5/MarketDataEngine.mqh)):**
- `OnPeriodic()` at line 120: Already calls `SendToBackend()` for market-stream (working).
- `SendToBackend()` at line 320: Handles WebRequest retry logic (3 attempts, 150ms between retries).
- No methods exist for license-check, heartbeat, account-sync, or symbol-sync.

### Payload Contracts — All Defined in Tests

**License-check (GET):**
```
Input: account_id, terminal_id, ea_version (optional)
Output: { "ok": true, "allowed": true|false, "status": "...", ... }
Action on denied: Return INIT_FAILED
```
Source: [test-ea-license-check.php](wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php)

**Heartbeat (POST):**
```
Input: account_id, terminal_id, broker, broker_server, ea_version, terminal_build, connected, timestamp
Output: { "ok": true, "received": true, "status": "live", "server_time": "..." }
Softness: Log warning on error; continue (soft gate)
```
Source: [test-ea-heartbeat.php](wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php)

**Account-sync (POST):**
```
Input: account_id, terminal_id, broker, broker_server, currency, balance, equity, margin, 
       free_margin, leverage, trade_allowed, connected, ea_version, terminal_build, timestamp
Output: { "ok": true, "synced": true, "account_id": "...", "terminal_id": "...", "server_time": "..." }
Persistence: smc_sf_account_snapshots.data.eaBridge.accounts[account_id|terminal_id]
```
Source: [test-ea-account-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php)

**Symbol-sync (POST):**
```
Input: account_id, terminal_id, broker, broker_server, timestamp, symbols: [
  { broker_symbol, normalized_symbol, base_symbol, visible, selected, digits, point, 
    contract_size, trade_mode, min_lot, max_lot, lot_step, spread, 
    currency_profit, currency_margin }
]
Output: { "ok": true, "synced": true, "symbols_received": N, "symbols_upserted": N }
Persistence: smc_sf_symbol_sync (upsert by user_id + account_id + terminal_id + broker_symbol)
```
Source: [test-ea-symbol-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php)

---

## 3. Root cause hypothesis

**Most likely root cause: Incomplete Phase 1 task subdivision**
- **Confirmed:** Backend routes are complete, tested, and ready to accept WebRequest calls.
- **Hypothesis:** Phase 1 delivery was split into two independent tracks:
  - **Track A (Backend):** Implement PHP routes ✅ DONE (PR #185 merged 2026-05-15)
  - **Track B (MT5 EA):** Implement WebRequest calls in MQL5 ⚠️ NOT YET STARTED
- **Why this fits:** The Phase 1 bridge implementation report at [phase-1-ea-bridge-implementation-report.md](reports/phase-1-ea-bridge-implementation-report.md#L113) explicitly states:
  > "Known limitations: No MT5 EA file changes were made in this patch. Backend routes are live, but EA callers still need staging verification against the new endpoints. Next recommended step: Run staging Phase 1 bridge verification with a real MT5 terminal..."

- **What triggered this:** The user's issue submission identifies the exact 4 missing routes by comparing the backend route inventory against the EA side evidence.

**Why the gap exists (Hypothesis):**
- Backend delivery required database schema changes, route registration, handler logic, and comprehensive test coverage (higher complexity).
- MT5 EA delivery is primarily engineering scaffolding: extend MarketDataEngine with 4 new methods, wire them into OnInit/OnTimer, collect telemetry fields from the MT5 API.
- Both are prerequisites for Phase 1 validation window (heartbeat continuity 48h+, account/symbol metadata parity).

---

## 4. Blast radius

### Files directly affected (MT5 EA side):

1. **[mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh)**
   - Add public method `SendLicenseCheck()` — call from OnInit
   - Add public method `SendHeartbeat()` — call from OnTimer
   - Add public method `SendAccountSync()` — call from OnInit and periodically from OnTimer
   - Add public method `SendSymbolSync()` — call from OnInit
   - Each method builds JSON payload and calls WebRequest (reusing existing retry/error logic in `SendToBackend()` as template)

2. **[mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5)**
   - `OnInit()` at line 119: Add license-check gate before `EventSetTimer()`
   - `OnInit()` at line 119: Add account-sync and symbol-sync calls after symbols are resolved
   - `OnTimer()` at line 200: Add heartbeat call (every 30-60 seconds configurable)
   - Add module-level timer variable to throttle heartbeat to avoid spam

### Files read but not modified (validation only):

- [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php) — Backend routes are ready; no changes needed
- [wordpress/smc-superfib-sniper/tests/php/test-ea-*](wordpress/smc-superfib-sniper/tests/php/) — Backend tests are passing; no changes needed

### Parity surfaces at risk:

1. **License validation truth:** EA startup now gated by backend license-check response. If license-check returns `allowed=false`, EA must not proceed. Dashboard must not try to connect to an EA that failed license-check.

2. **Heartbeat truth:** Backend `engine_runs` table now records explicit heartbeat rows. Dashboard monitoring must understand that heartbeat absence = disconnection.

3. **Account metadata truth:** Backend now stores account state from EA (balance, equity, leverage, etc.). Dashboard must use this authoritative copy, not stale cached values. Reconciliation needed: What happens if balance changes without account-sync? Does dashboard freeze or refresh?

4. **Symbol metadata truth:** Backend now has broker-specific symbol specs (digits, point, min_lot, max_lot, spread). Dashboard must use this for trade calculation. Parity risk: If EA sends symbol-sync with spread=10 but actual spread is 12, dashboard calculations diverge.

### Sequence dependencies:

- License-check **must** complete before `EventSetTimer()` or EA initialization fails (blocking gate).
- Account-sync **should** complete before market-stream loop starts (metadata freshness).
- Symbol-sync **should** complete before market-stream loop starts (metadata freshness).
- Heartbeat **should** be called periodically (every 30-60 sec) to maintain session continuity.

### Cache invalidation risks:

- None currently visible. Heartbeat and account-sync are append/update semantics, not cache displacement.

---

## 5. Regression surface

### Existing behaviors that must not break:

1. **Market-stream WebRequest flow** ([MarketDataEngine.mqh line 320-410](mt5/MarketDataEngine.mqh#L320))
   - Retry logic (3 attempts, 150ms backoff) — must remain unchanged
   - Header caching (built once in Initialize, reused on every send) — must remain unchanged
   - JSON payload structure — must remain unchanged
   - httpStatus evaluation (200/201 = success) — must remain unchanged

2. **OnInit symbol resolution** ([SMC_MarketDataEA.mq5 line 119](mt5/SMC_MarketDataEA.mq5#L119))
   - Symbol lookup order (configured → broker → market watch selected) — must remain unchanged
   - ResolveBrokerSymbol() — must be called before new routes attempt to send telemetry

3. **OnTimer tick poll loop** ([SMC_MarketDataEA.mq5 line 200](mt5/SMC_MarketDataEA.mq5#L200))
   - Poll order (all symbols except chart symbol) — must remain unchanged
   - Chart symbol handled by OnTick() — must remain unchanged
   - engine.OnPeriodic() call order — must remain after symbol poll (so freshness is current)

4. **TimeToIso8601() UTC conversion** ([MarketDataEngine.mqh line 430](mt5/MarketDataEngine.mqh#L430))
   - All payloads (market-stream, heartbeat, account-sync, symbol-sync, license-check) must use consistent UTC timestamp format
   - Current implementation: broker-local time − broker offset = UTC, then format as YYYY-MM-DDTHH:MM:SSZ
   - Must NOT change to TimeGMT() directly (breaks compatibility with DST/offset-aware brokers)

5. **Auth header construction** ([SMC_MarketDataEA.mq5 line 153](mt5/SMC_MarketDataEA.mq5#L153))
   - Header format: `"X-EA-API-Key: " + ApiKey`
   - Must match backend expectation: `get_header('x_ea_api_key')`
   - All new routes must include this header in WebRequest cachedHeaders

### Guard rails protecting existing code:

- **FreshnessEngine** (phase-2 code) — reads freshness state, not affected by heartbeat changes
- **CandleBuilder** (phase-2 code) — reads candles, not affected by account/symbol sync changes
- **SessionManager** (phase-2 code) — reads session state, not affected by EA route changes
- **SymbolNormalizer** (common code) — used by all routes, must remain thread-safe

### Tests covering existing behavior (keep passing):

- [test-ea-market-stream.php](wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php) — PASS (backend only, no EA changes needed)
- [test-mt5-snapshot-contract.php](wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php) — PASS (backend only)

---

## 6. Resolution path options

### Path A — Narrow Implementation (Recommended)

**Surface:** Add 4 new methods to MarketDataEngine.mqh + wire into OnInit/OnTimer in SMC_MarketDataEA.mq5

**Scope:**
1. `MarketDataEngine::SendLicenseCheck()` — GET request, blocking return
2. `MarketDataEngine::SendHeartbeat()` — POST request, soft error handling
3. `MarketDataEngine::SendAccountSync()` — POST request, soft error handling
4. `MarketDataEngine::SendSymbolSync()` — POST request, soft error handling
5. SMC_MarketDataEA.mq5 OnInit: Add license-check gate + account-sync + symbol-sync calls
6. SMC_MarketDataEA.mq5 OnTimer: Add heartbeat call with throttle counter

**Rationale:**
- All payload contracts are defined and tested in PHP tests.
- Retry logic, error handling, and WebRequest patterns already exist in SendToBackend().
- No database changes needed (backend already ready).
- No new module-level state (reuse existing engine, symbolNormalizer, etc.).
- Minimal risk of breaking market-stream path (new methods are independent).
- Can be delivered in single commit + single PR.

**Estimated complexity:** 400–600 lines of MQL5 code

### Path B — Broader Structural Approach

**Surface:** Refactor MarketDataEngine to support typed WebRequest wrappers + middleware for auth/retry/logging

**Scope:**
- Extract WebRequest retry logic into reusable `WebRequestWrapper()` helper
- Create `PayloadBuilder` class to encapsulate JSON construction for each route type
- Add telemetry collection (AccountInfo, SymbolInfo) as separate module
- Add route registry (license-check, heartbeat, account-sync, symbol-sync URLs)
- Refactor SendToBackend() and new methods to use WebRequestWrapper
- Add dedicated error logger to distinguish route failures by type

**Rationale:**
- Improves testability (mock WebRequestWrapper instead of WebRequest directly)
- Centralizes URL management (easier to change backend endpoints during migration)
- Reduces duplicate code (retry logic shared across all 5 routes)
- Supports future routes without repeating patterns

**Risk:** Additional complexity may mask issues in the narrow path; not justified for Phase 1 gate delivery.

### Recommended: Path A

**Why:** Phase 1 is a blocking gate for validation window. Path A delivers the exact 4 missing routes with minimal risk, using existing patterns. Path B improves architecture but delays delivery and adds refactoring risk. After Phase 1 closes, Path B refactoring can be considered for Phase 2+ hardening.

---

## 7. Risk flags

- **High-risk system involved:** YES
  - Reason: License check gates EA startup. If logic is inverted (denying when allowed), EA won't start. If logic is missing, unlicensed EAs could run unchecked. Requires careful testing: allowed=true → continue, allowed=false → return INIT_FAILED.

- **Requires parity re-validation:** YES
  - Which engine: Account/symbol metadata engine (Phase 2+)
  - Why: Dashboard must reconcile heartbeat presence/absence, account balance changes, symbol spread changes. Stale-state risk if EA sends old account snapshot or if account-sync is delayed.
  - Validation: Run 48h+ soak with account balance changes mid-session. Dashboard must reflect balance update within 5 min of account-sync push.

- **Migration-blocking:** YES
  - Which phase gate: Phase 1 → Phase 2 transition
  - Why: Phase 1 closure requires "all five routes working together for validation window". Without these 4 routes, heartbeat continuity cannot be measured, account metadata cannot be validated, and symbol metadata cannot be verified. Phase 2 depends on this foundation.

- **Human review required before merge:** YES
  - Why: WebRequest auth header must match backend expectation exactly. License-check gate logic must be inverted correctly (allowed=true → continue, allowed=false → INIT_FAILED). Heartbeat throttle interval must be appropriate (30-60 sec, not 1 sec spam or 10 min stale).

---

## 8. Handoff package

### Epicentre files to inspect first:
1. [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh) — Add 4 new Send*() methods
2. [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5) — Wire OnInit/OnTimer calls
3. [wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php](wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php) — Payload schema
4. [wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php) — Payload schema
5. [wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php](wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php) — Payload schema

### Inputs Codex must verify before planning:
1. **License-check gate logic:** Read backend permission_ea_bridge callback and handler. Confirm exact response structure (ok, allowed, status fields). Codex must implement: if allowed=false, return INIT_FAILED immediately.
2. **Heartbeat interval:** Verify backend expectation. User guidance says "30-60 seconds". Codex must choose interval, add module-level counter, throttle calls accordingly.
3. **Account telemetry availability:** Codex must query MT5 API (AccountInfoDouble/Integer) to collect balance, equity, margin, leverage during OnInit and OnTimer. Confirm API calls available on every MT5 build (4150+).
4. **Symbol telemetry availability:** Codex must query SymbolInfoInteger/Double for digits, point, min_lot, max_lot, spread. Confirm available for all symbols in g_symArray[] during OnInit.
5. **Existing WebRequest timeout:** Current market-stream uses 5000ms timeout. Codex must decide if new routes (smaller payloads) can use shorter timeout or must match 5000ms for consistency.
6. **Timestamp consistency:** Verify that TimeToIso8601(TimeCurrent()) is called consistently by all new routes. No mixing TimeCurrent() vs TimeGMT().

### Open unknowns that could invalidate current hypothesis:
1. **Do all MT5 builds support AccountInfo* and SymbolInfo* for telemetry?** Current EA targets "MT5 4150+". Research confirms. Codex should verify no unsupported builds are in use.
2. **Can WebRequest be called from OnInit() without hanging?** Currently called from OnTimer() only (periodic). Codex should test: Can license-check call WebRequest during OnInit() without blocking symbol resolution? Hypothesis: Yes, but needs verification.
3. **What is the expected heartbeat response time?** Backend handler is synchronous. Codex should assume 100–500ms. If heartbeat WebRequest times out frequently, this could block OnTimer and freeze market-stream. Should timeout be shorter (2000ms) to avoid blocking?
4. **Is there a trade-off between license-check blocking vs. soft-start?** Current guidance: "return INIT_FAILED if denied". But what if license-check times out? Should EA wait 3 attempts (450ms) or fail fast? Guidance in issue suggests hard gate (fail if denied OR timeout).
5. **Does symbol-sync need to batch all symbols or send individually?** Test shows batch (array of symbols). But if there are 100+ symbols and batch request times out, should EA fall back to per-symbol requests? Current guidance: "Batch or individual: TBD (report doesn't specify; likely batch for efficiency)".

---

## 9. Summary

Phase 1 EA Bridge implementation is blocked by a single task: wire 4 missing WebRequest calls into the MT5 EA. Backend is complete, tested, and passing. MT5 EA has the foundational infrastructure (MarketDataEngine, OnInit/OnTimer hooks, auth header, WebRequest retry patterns, UTC timestamp conversion) to support the new routes. All payload schemas are defined and tested. No new databases or architectural changes needed. Implementation is straightforward engineering using existing patterns. Risk is contained to MT5 EA module; no impact on dashboard, backend routes, or Phase 2 code. Requires careful testing of license-check gate logic and heartbeat throttling before merge.
- Full cleanup (Path B) is lower-risk if done carefully but requires script audit first (deferred)
- Compromise: Execute Path A immediately; queue Path B for a separate story after Phase 1 planning complete

**Exact steps**:
1. Create Phase 1 detailed roadmap, tracker, checklist (3 new docs)
2. Archive Phase 0 superseded checkpoints (folder consolidation, no file deletes)
3. Update migration-status.md to reference new Phase 1 docs
4. Leave root artifacts for now; revisit after Phase 1 kickoff
5. Defer `.artifacts/logs/` reorganization; risky without full script audit

---

## 7. Risk Flags

**High-risk system involved**: No
- Documentation and repo organization changes; no code changes in critical systems (MT5 EA, backend APIs, signal engine)

**Requires parity re-validation**: No
- Phase 0 parity (100%) is complete and confirmed; Phase 1 is just beginning with backend APIs already in place

**Migration-blocking**: No
- Phase 1 can start without detailed roadmap (APIs ready, EA validation can begin)
- However, lack of clarity **increases risk** of coordination failures between tracks

**Human review required before merge**: Yes
1. Archive folder structure must not break pipeline ingestion (review with migration manager agent)
2. New Phase 1 docs should be reviewed by Track A, B, C leads for accuracy and completeness
3. Root artifact cleanup (if included) must be audited against scripts first

---

## 8. Handoff Package

### Epicentre Files to Inspect First

1. **`.github/migration-status.md`** — primary source of truth; Phase 1 summary sections (lines 95–150)
2. **`.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`** — official Phase 0 closeout artifact
3. **`.github/migration/PHASE0_SOAK_TRACKER.md`** — reference for Phase 0 scope; understand what Phase 1 replaces
4. **`mt5/SMC_MarketDataEA.mq5`** — EA live terminal validation status (what's ready for testing?)
5. **`reports/phase-1-ea-bridge-implementation-report.md`** — existing Phase 1 work summary (if any)

### Inputs Codex Must Verify Before Planning

1. **Phase 1 success criteria clarity**:
   - "Heartbeat stable for 48h+" — where is the 48h test window? Does it require live MT5 terminal or can be simulated?
   - "No dropped sessions" — acceptance: 0 drops, or <0.1% acceptable?
   - "Reconnect works automatically" — auto-reconnect after what events? (Terminal restart, VPS restart, internet interruption?)

2. **Track assignments**:
   - Track A (MT5 EA): Who owns SMC_MarketDataEA.mq5 live terminal validation?
   - Track B (Backend): Who verifies API stability and edge cases (invalid license, duplicate heartbeat, etc.)?
   - Track C (Dashboard): Explicitly deferred to Phase 2 — confirm no Phase 1 work?

3. **Live terminal constraints**:
   - Where will Phase 1 terminal testing happen? (Production MT5, staging broker, simulation?)
   - Access requirements? (API keys, account credentials, broker details)
   - Timeline: When can testing begin? (EA code ready? Backend APIs in staging?)

4. **Archive folder safety**:
   - Any scripts or CI pipelines that parse `.github/migration/phase-updates/` directly? (Not just agent auto-ingest)
   - Can archived Phase 0 docs be safely moved without breaking references?

### Open Unknowns That Could Invalidate Hypothesis

1. **Phase 1 EA testing environment**: Unclear if live terminal testing is blocked by infrastructure (broker connectivity, testing account availability)
2. **Track C exclusion**: Confirm dashboard is truly blocked on Phase 1 completion, not just deferred preference
3. **Archive folder policy**: Check if archived docs need to remain queryable or can be truly removed from active view
4. **Documentation review cycle**: Do Track A/B leads need approval on new Phase 1 docs, or is Copilot/Codex authority sufficient?
5. **Phase 1 timeline pressure**: Is 2026-06-01 target realistic given live validation requirements, or is it aspirational?
