# Issue Research: Backend Freshness Layer

### 1. Issue classification
- Severity: HIGH
- Category: data-contract / stale-data
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS
- Phase impact: Phase 3

### 2. Confirmed evidence
- Backend TODO & acceptance requirement: [.github/migration-status.md](.github/migration-status.md) lists "Backend Freshness Layer: `quote_updated_at`, `last_seen_at`, stagnation state, feed health" as a Phase 3 deliverable.
- PHP schema includes `last_seen_at` and snapshot `updated_at` columns: [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php).
- Market-data service persists MT5 snapshots and candles and exposes `updated_at` and freshness/session APIs: [wordpress/smc-superfib-sniper/class-market-data-service.php](wordpress/smc-superfib-sniper/class-market-data-service.php) (`store_tick_snapshot`, `store_candle_m1`, `get_price_snapshot`, `store_freshness`, `get_freshness`).
- Freshness persisted via WordPress transients with a 300s TTL in `store_freshness()` and read via `get_freshness()` in the market data service: [wordpress/smc-superfib-sniper/class-market-data-service.php](wordpress/smc-superfib-sniper/class-market-data-service.php).
- Backend/frontend parity audits map `last_seen_at` -> `LIVE/STALE/UNAVAILABLE`: [.github/migration/audits/phase-2-backend-dashboard-progress-parity-2026-05-20.md](.github/migration/audits/phase-2-backend-dashboard-progress-parity-2026-05-20.md).
- PHP regression tests exercise `last_seen_at` live/stale behavior and progress mapping: [wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php](wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php).

### 3. Root cause hypothesis
- Most likely root cause: the backend freshness contract is partially implemented (DB columns and transient-based freshness exist) but lacks a canonical, persisted `quote_updated_at`/`last_seen_at` canonicalization and explicit stagnation/feed-health persistence and mappings required for Phase 3. (Hypothesis)
- Why: evidence shows `last_seen_at` column and transient freshness are present, but migration-status explicitly lists the freshness layer as an outstanding Phase 3 deliverable, and tests/audits continue to exercise mapping behavior rather than a full persisted feed-health model. (Confirmed/Hypothesis)
- Likely trigger: Phase 2 → Phase 3 handoff exposes the need for a durable freshness record (not just transient state) and explicit stagnation detection, which is required by downstream engine consumers and the dashboard. (Hypothesis)

### 4. Blast radius
- Files likely affected:
  - wordpress/smc-superfib-sniper/smc-superfib-sniper.php
  - wordpress/smc-superfib-sniper/class-market-data-service.php
  - wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php
  - .github/migration-status.md and related audit artifacts
  - src/dashboard consumers that display freshness / progress (frontend API client and FreshnessBadge component)
- Systems that read/write the component: MT5 EA (EA -> /ea/market-stream), WordPress REST API, DB (`smc_sf_snapshots`, `smc_sf_candles`, `smc_sf_account_telemetry`), Dashboard JS consumers.
- Parity surfaces at risk: MT5 (EA) -> Backend freshness semantics -> Dashboard freshness UI; signal integrity and LIVE-state gating for downstream engines.
- Risks: stale/transient-only freshness can lead to false LIVE states after a transient eviction, or inability to reason about long-running stagnation/health across restarts.

### 5. Regression surface
- Must not break: EA authoritative writes to `smc_sf_snapshots`/`smc_sf_candles` and the `/ea/market-stream` auth contract.
- Existing guards: DB schema with `last_seen_at` and snapshot `updated_at`; tests that assert stale/live mappings; transient TTL-based freshness guard (`store_freshness()` TTL=300s).
- Tests/audits: Phase 2 PHP regression tests and the Phase 2 parity audit cover mapping behavior; any change must retain those guarantees or extend them with durable feed-health proofs.

### 6. Resolution path options
- Path A (narrow): Add canonical persisted `quote_updated_at` and `last_seen_at` writes on every MT5 snapshot/candle ingest, and implement deterministic stagnation rules that set a durable `feed_health` row or column. Keep transient freshness for fast reads but use persisted timestamps as the authority for longer-term state and auditability.
- Path B (broader): Rework the freshness model into a small persisted service table (per-user, per-symbol) containing `last_seen_at`, `quote_updated_at`, `stagnation_state`, `feed_health`, and add idempotent upserts from EA and a background job to compute derived `stagnation_state` and to avoid transient-only authority.
- Recommended: Path A — minimal blast radius, leverages existing schema, preserves current transient optimizations, and satisfies Phase 3 acceptance while keeping the implementation surface small for careful review.

### 7. Risk flags
- High-risk system involved: Yes — price authority and freshness influence LIVE-state gating and downstream signal engines.
- Requires parity re-validation: Yes — backend freshness engine and dashboard FreshnessBadge / progress consumers.
- Migration-blocking: Yes — Phase 3 readiness explicitly lists this deliverable.
- Human review required before merge: Yes — authority boundaries, persisted fields, and tests must be reviewed to avoid introducing false-live or frozen-live regressions.

### 8. Handoff package
- Epicentre files to inspect first:
  - [wordpress/smc-superfib-sniper/class-market-data-service.php](wordpress/smc-superfib-sniper/class-market-data-service.php)
  - [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php)
  - [wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php](wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php)
- Inputs Codex must verify before planning:
  - Does `store_tick_snapshot()`/`store_candle_m1()` already persist a canonical `quote_updated_at` on ingest? (Unconfirmed / inspect `store_tick_snapshot` call sites)
  - Are transients sufficient for short-term freshness only, and is a persisted feed-health row required by Phase 3? (Unconfirmed — migration-status suggests yes)
  - What consumers rely on transient-only freshness vs persisted timestamp fields (frontend caches, signal engine, audits)? (Unconfirmed — needs inventory)
- Open unknowns that could invalidate hypothesis:
  - Whether EA payload currently includes an explicit `quote_updated_at` field and if backend already writes it (EA payload inspection required).
  - Whether background jobs or other processes already compute stagnation/feed-health from persisted timestamps (no evidence found).
  - Exact expected stagnation thresholds and mapping to `LIVE/DELAYED/STALE/CLOSED` for all asset classes and sessions (business rules may vary).

---

Generated by Copilot intake on behalf of the repository triage process.
# SMC SuperFIB Phase 3 Research Report
## MT5 EA Webhook Market-Data Flow Validation

---

## 1. Issue Classification

- **Severity:** CRITICAL
- **Category:** wiring / data-contract / migration-governance
- **Layer(s) affected:** MT5, PHP-backend, REST-API, Dashboard-JS
- **Phase impact:** Phase 3 (gate blocking for parity validation)

---

## 2. Confirmed Evidence

### MT5 EA Market Data Transmission (Source: MarketDataEngine.mqh, SMC_MarketDataEA.mq5)

**Confirmed components:**
- MT5 EA (`MarketDataEngine`) builds tick and candle snapshots on-timer (every 10-30 seconds)
- Sends HTTP POST to `/wp-json/sniper/v1/ea/market-stream` endpoint
- Includes required headers:
  - `Content-Type: application/json`
  - `X-EA-API-Key: [token]` (matches `SMC_SF_EA_API_KEY` in wp-config.php)
  - `Connection: close`
- Webhook payload includes:
  - `user_id` (WordPress user that owns the stream)
  - `symbol` (normalized to broker symbol)
  - `tick` object with `bid`, `ask`, `spread`, `timestamp`, `volume`
  - `candle_m1` object with `open`, `high`, `low`, `close`, `volume`, `timestamp`
  - `freshness` state (LIVE|DELAYED|STALE|CLOSED|DISCONNECTED)
  - `session` name (Sydney|Tokyo|London|New York|Overlap|Weekend|Closed)
  - `is_synthetic` flag

### Backend REST Endpoint (Source: smc-superfib-sniper.php)

**Confirmed routing:**
- Endpoint: `POST /wp-json/sniper/v1/ea/market-stream`
- Handler: `post_ea_market_stream($request)`
- Permission callback: `permission_ea_market_stream()` → `permission_ea_bridge()`
- Auth validation: `X-EA-API-Key` header checked against `SMC_SF_EA_API_KEY` constant/env var (case-insensitive header name support: `x-ea-api-key`, `x_ea_api_key`, `x-api-key`, `x_api_key`)
- User resolution: Payload `user_id` field or fallback to `resolve_ea_user_id()` (first admin)
- Payload parsing: JSON with backward-compatible field normalization via `normalize_snapshot_payload_compat()`

### Backend Data Storage (Source: smc-superfib-sniper.php post_ea_market_stream)

**Confirmed storage paths:**
1. **Tick snapshots** → `wp_smc_sf_snapshots` table
   - Fields: `user_id`, `symbol`, `bid`, `ask`, `mid`, `spread`, `change_pct_1d`, `source='mt5'`, `state='live'`, `updated_at`
   - Write method: `$wpdb->replace()` (idempotent upsert by user_id + symbol)

2. **M1 Candles** → `wp_smc_sf_candles` table
   - Fields: `user_id`, `symbol`, `timeframe='1min'`, `candle_time`, `open`, `high`, `low`, `close`, `volume`, `source='mt5'`, `created_at`
   - Write method: `$wpdb->replace()` (idempotent upsert by user_id + symbol + timeframe + candle_time)

3. **Freshness state** → WordPress transient
   - Key: `smc_sf_freshness_{user_id}_{normalized_symbol}`
   - TTL: 5 minutes (300 seconds)
   - Value: Freshness state enum (LIVE|DELAYED|STALE|CLOSED|DISCONNECTED)

4. **Session state** → WordPress transient
   - Key: `smc_sf_session_{user_id}_{normalized_symbol}`
   - TTL: 5 minutes
   - Value: Session name string

**Source field validation:**
- Line ~1810 in smc-superfib-sniper.php:
  ```php
  $requested_source = array_key_exists('source', $payload) ? strtolower(trim((string) $payload['source'])) : 'mt5';
  
  if ($requested_source !== 'mt5') {
      $this->audit($user_id, 'mt5_snapshot.invalid_source', ...);
      return rest_ensure_response(array('ok' => true));
  }
  ```
  - **Confirmed**: Backend **rejects** any payload with `source` field != `'mt5'`
  - Backend **defaults** to `'mt5'` when source field is omitted
  - Source field is then **hardcoded** to `'mt5'` on write to snapshots/candles tables

### Authority System (Source: class-market-data-service.php, authority-diagnostics endpoint)

**Confirmed authority logic:**
- `get_market_data_authority()` endpoint returns `source` field from `snapshots` table
- `get_authority_diagnostics()` endpoint:
  - Returns `authority='mt5'` when MT5 data exists
  - Calculates `authorityAgeSec` from `snapshots.updated_at`
  - Reports `authorityStale=true` when age >= 60 seconds with source='mt5'
  - Reports `willFallbackToTD=true` for stale MT5 authority

### Phase 3 Testing Framework (Source: PHASE3_TESTING_GUIDE.md, phase3_mt5_simulation_test.php)

**Confirmed test setup:**
- Test harness provides curl/file_get_contents/PowerShell fallback for webhook simulation
- Sample payload demonstrates full contract
- Database verification SQL provided
- Transient inspection via WP CLI documented
- Success criteria include:
  - "Backend stores data with `source='mt5'`"
  - "Dashboard recognizes MT5 as authoritative data source"
  - "No data conflicts between MT5 and Twelve Data for MT5-live symbols"

---

## 3. Root Cause Hypothesis

### Highest Confidence (Confirmed)

**Issue**: The backend webhook endpoint has full routing, authentication, and storage implementation in place. All data paths are wired correctly from intake through persistence and authority reads.

**Evidence**:
- `post_ea_market_stream()` handler is fully registered and functional
- API-key validation in `permission_ea_bridge()` checks header against configured constant
- Payload normalization handles legacy and canonical formats
- Source field is validated (rejects non-'mt5') and hardcoded on write
- Snapshots and candles tables exist with `source` column
- Authority endpoints (`get_market_data_authority`, `get_authority_diagnostics`) read from `source='mt5'` rows
- Freshness/session transient layer implemented
- Phase 3 testing guide documents expected behavior

### Medium Confidence (Hypothesis)

**Phase 3 validation requirements unconfirmed**:
- Whether the EA is currently attaching and sending webhooks to a live WordPress instance
- Whether the API key is correctly configured in both EA inputs and wp-config.php
- Whether network/firewall allows outbound HTTPS from MT5 broker to WordPress endpoint
- Whether transient TTL is appropriate for real-time freshness tracking (5 min may be too long during market hours)
- Whether dashboard is wired to read from the authority endpoints (not visible in search results)

### Lower Confidence (Needs Validation)

- Change_pct_1d calculation in MT5 context (currently placeholder, may need historical context)
- Whether "rate_limited" state properly clears when MT5 becomes live
- Whether equity index symbols (NAS100, US30) off-session handling works as documented

---

## 4. Blast Radius

### Files Directly Involved in Flow

**MT5 (MQL5)**:
- `mt5/MarketDataEngine.mqh` — candle engine, tick buffering, webhook payload construction
- `mt5/SMC_MarketDataEA.mq5` — EA entry point, timer callback, webhook dispatch
- `mt5/TickProcessor.mqh` — tick tick deduplication
- `mt5/CandleBuilder.mqh` — M1/M15 candle aggregation
- `mt5/SessionManager.mqh` — session detection and market-open inference
- `mt5/FreshnessEngine.mqh` — LIVE|STALE|CLOSED state tracking
- `mt5/SymbolNormalizer.mqh` — symbol name canonicalization

**Backend (PHP)**:
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — REST route registration, `post_ea_market_stream()`, auth, payload normalization
- `wordpress/smc-superfib-sniper/class-market-data-service.php` — `store_tick_snapshot()`, `store_candle_m1()`, `store_freshness()`, `store_session()`
- Database schema: `wp_smc_sf_snapshots`, `wp_smc_sf_candles`, WordPress transients table

**Dashboard/Frontend**:
- Authority read endpoints: `/sniper/v1/market-data-authority`, `/sniper/v1/authority-diagnostics`
- Health check endpoint: `/sniper/v1/health` (reads snapshots via `is_mt5_authoritative()`)
- Dashboard components must wire to these endpoints (search results incomplete — needs frontend audit)

### Parity Surfaces at Risk

1. **Pine → MT5 session window divergence** (CONFIRMED):
   - Pine authority uses simplified killzone windows (London 07-11, NY 12-16)
   - MT5 SessionManager uses full market hours (London 07-15, NY 12-20)
   - Dashboard endpoint returns Pine killzone, not MT5 full session
   - Documented as intentional "display-only parity divergence" in code comments
   
2. **Authority switch credibility**:
   - When MT5 price becomes authoritative (source='mt5'), stale Twelve Data state must clear
   - When MT5 becomes stale (age >= 60 sec), fallback to Twelve Data must work smoothly
   - Requires dashboard to call `get_authority_diagnostics()` and manage UI state accordingly

3. **Freshness state sync**:
   - MT5 EA sends freshness enum (LIVE|STALE|CLOSED)
   - Backend stores as transient (TTL 5 min)
   - Dashboard must read from transient, not from snapshots.state
   - Transient TTL may not align with 10-second tick intervals

### Cascade Effects

- **Engine run execution**: `engine_runs` table must receive heartbeat rows on successful MT5 pushes (Phase 3 checklist item)
- **Feed rate-limit state**: TD rate-limit transients should clear after MT5 write
- **Price snapshot reads**: `get_cached_price()` must distinguish MT5 vs. Twelve Data authority
- **Health status propagation**: Backend sync status depends on engine_runs recency

---

## 5. Regression Surface

### Currently Working Behavior (Must Not Break)

1. **Twelve Data fallback for non-MT5 symbols**:
   - Existing API integration with Twelve Data must remain functional
   - Non-EA watchlist symbols continue to fetch via `/sniper/v1/user/market-data`
   - Rate-limit handling (429 cooldown transients) must survive MT5 coexistence

2. **Dashboard data freshness assumptions**:
   - GET `/sniper/v1/snapshot` currently returns Twelve Data as primary source
   - Switching authority to MT5 must not break price display or chart rendering
   - Transient-based freshness may not be visible in snapshots table (dashboard may not read it)

3. **Authority-diagnostic reads**:
   - `get_authority_diagnostics()` already exists and returns `source` from snapshots
   - Endpoint is used by health checks to determine fallback behavior
   - Must not be altered by MT5 authority logic

4. **Engine run cycle**:
   - `engine_runs` table tracks signal generation success
   - Heartbeat rows are recorded on successful market data ingestion
   - MT5 path must trigger heartbeat writes just like Twelve Data path does

### Validation Paths That Must Survive

- Permission check for `user_id` validity (Phase 3 tests validate this)
- API-key auth against configured constant
- Payload schema normalization (handles both legacy and canonical formats)
- Transient TTL and cleanup

---

## 6. Resolution Path Options

### Path A: Narrow Validation (Recommended)

**Scope**: Confirm that the existing backend webhook implementation is receiving data from MT5 EA and persisting it correctly.

**Steps**:
1. **Verify API-key configuration**:
   - Check that `SMC_SF_EA_API_KEY` is defined in wp-config.php or environment
   - Confirm MT5 EA has matching `ApiKey` input set
   
2. **Verify webhook reception**:
   - Enable query logging or use WordPress audit table to confirm POST hits to `/ea/market-stream`
   - Check `permission_ea_bridge()` auth success/failure logs
   
3. **Verify data persistence**:
   - Query `wp_smc_sf_snapshots` for rows with `source='mt5'`
   - Query `wp_smc_sf_candles` for rows with `source='mt5'`
   - Query transients: `wp_options` for keys matching `smc_sf_freshness_*` and `smc_sf_session_*`
   
4. **Verify authority reads**:
   - Call GET `/sniper/v1/market-data-authority` — confirm it returns source='mt5' for EA symbols
   - Call GET `/sniper/v1/authority-diagnostics` — confirm authority age and fallback state
   
5. **Verify dashboard integration** (requires frontend code inspection):
   - Confirm dashboard calls authority endpoints
   - Confirm UI reflects MT5 as authoritative source
   - Confirm freshness indicators update from transient values

**Why this path**:
- The backend implementation is already complete and tested in isolation
- Phase 3 gate does not require code changes; only operational validation
- Narrowest blast radius — only validates, does not alter behavior
- Results directly feed Phase 3 checklist closure

### Path B: Comprehensive Hardening (Broader Scope)

**Scope**: Add explicit validation guards, logging, and monitoring for the MT5 authority transition.

**Additional steps beyond Path A**:
1. Add explicit source-field validation audit logging at ingestion
2. Add transient TTL monitoring to detect stale freshness states
3. Add dashboard endpoint to expose MT5 authority decision logic for operator visibility
4. Add rate-limit clearance confirmation (test that TD transients are cleared on MT5 push)
5. Add equity-index off-session logic validation (NAS100, US30 session detection)
6. Add heartbeat row writes confirmation (engine_runs table after successful MT5 push)

**Why broader path**:
- Catches runtime edge cases (transient TTL gaps, equity index session-awareness, etc.)
- Adds operator transparency (dashboard diagnostics)
- Preempts Phase 4 failures (signal generation depends on engine_runs)
- Reduces post-go-live incidents

**Trade-off**: Increases complexity and scope; stretches Phase 3 gate timeline

---

## 7. Risk Flags

### High-Risk System Involved
- **Yes** — Authority switch from Twelve Data to MT5 affects every trade signal generated
- **Impact**: A false LIVE state or stale timestamp will propagate to order execution

### Requires Parity Re-validation
- **Yes** — Session window divergence between Pine and MT5 must be documented and understood by operators
- **Dashboard impact**: Killzone windows shown to users (London 07-11, NY 12-16) do NOT match MT5 full session hours
- **Operator action**: Update dashboard documentation or standardize sessions across both systems

### Migration-Blocking
- **Yes** — Phase 3 gate cannot be closed without confirming:
  1. MT5 EA sends webhooks without errors
  2. Backend stores data with source='mt5'
  3. Dashboard recognizes MT5 as authoritative
  4. No data conflicts with Twelve Data
  5. 72-hour stability test passes

### Human Review Required Before Merge
- **Yes** — Changes must be reviewed by:
  1. MT5 EA operator (verify EA config, network routing)
  2. Backend operator (verify API-key, database state, transient TTL)
  3. Dashboard team (verify authority endpoint integration, UI state transitions)
  4. Trading ops (verify authority precedence, fallback behavior, order impact)

---

## 8. Handoff Package

### Epicentre Files to Inspect First

1. [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh) — Webhook payload construction, timer dispatch
2. [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php) — Endpoint handler, auth, storage
3. [wordpress/smc-superfib-sniper/class-market-data-service.php](wordpress/smc-superfib-sniper/class-market-data-service.php) — Storage service layer
4. [PHASE3_TESTING_GUIDE.md](PHASE3_TESTING_GUIDE.md) — Test harness and success criteria

### Inputs Codex Must Verify Before Planning

1. **Is the MT5 EA currently attaching to a live MT5 terminal and sending webhooks?**
   - Requires: EA logs showing webhook sends, network packet capture, or backend audit logs
   - Blocker if False: Cannot proceed with Path A validation

2. **Is the WordPress endpoint accessible from the MT5 broker network?**
   - Requires: curl test from MT5 machine, endpoint reachability confirmation
   - Blocker if False: Network/firewall issue must be resolved

3. **Is the API-key configured correctly in both EA and wp-config.php?**
   - Requires: Operator confirmation or configuration audit
   - Blocker if False: Auth will fail on every webhook attempt

4. **Has the 72-hour stability test been scheduled and started?**
   - Requires: Dedicated test environment with EA attached, continuous monitoring
   - Phase gate cannot close without this data

5. **Is the dashboard wired to read from `/market-data-authority` and `/authority-diagnostics` endpoints?**
   - Requires: Frontend code inspection (search results did not reveal this wiring)
   - Blocker if False: Dashboard will not reflect MT5 authority even if backend is correct

### Open Unknowns That Could Invalidate This Hypothesis

1. **Dashboard authority wiring is missing or incomplete** → Path A validation will show backend is correct but UI won't reflect it; requires frontend implementation
2. **Transient TTL is too long** (5 min) and causes stale freshness display during market hours → May need to reduce to 30-60 seconds
3. **Equity index session logic is not working** → Off-session symbols will appear stale when they should be closed; affects health check
4. **Rate-limit transient clearance is not implemented** → MT5 authority switch won't clear stale TD rate-limit state; confusion in UI
5. **Engine runs heartbeat rows are not being written on MT5 push** → Phase 3 checklist item will fail; backend execution flow assumption invalid
6. **Source field validation bug allows non-mt5 values to be stored** → Data integrity issue; authority logic will be confused
7. **Dashboard is caching authority state** → Fresh MT5 data won't propagate immediately; appears stale

---

## Summary

The MT5 EA webhook market-data flow is **architecturally sound** with **complete backend implementation** for routing, authentication, storage, and authority reads. 

**Phase 3 scope**: Operational validation — confirm EA is running, webhooks are being received, data is being persisted, and dashboard is reading the authority endpoints correctly.

**No code changes required** for Path A (narrow validation). Path B (hardening) would add monitoring, logging, and edge-case guards.

**Highest priority unknown**: Dashboard wiring to authority endpoints — search results did not reveal this integration, and it is critical for Phase 3 gate closure.
