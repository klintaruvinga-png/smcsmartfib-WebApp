# SMC SuperFIB — Hardened Implementation Contract
## Phase 3: MT5 EA Webhook Market-Data Flow Validation

---

### 1. Issue validation

**Subject**: Phase 3 gate is blocked because end-to-end operational validation of the MT5 EA → PHP backend → dashboard data path has not been completed, and at least one code-level gap (dashboard authority wiring) is unconfirmed but probable.

---

**Confirmed**

| Item | Evidence |
|---|---|
| `POST /wp-json/sniper/v1/ea/market-stream` is registered | `smc-superfib-sniper.php` route registration confirmed |
| `permission_ea_bridge()` validates `X-EA-API-Key` against `SMC_SF_EA_KEY` | Auth handler confirmed with multi-variant header support |
| `post_ea_market_stream()` upserts to `wp_smc_sf_snapshots` with `source='mt5'` | `$wpdb->replace()` confirmed with hardcoded source field |
| M1 candles upserted to `wp_smc_sf_candles` with `source='mt5'` | Confirmed in handler body |
| Source-field guard rejects payloads with `source != 'mt5'` at line ~1810 | Confirmed PHP guard code; defaults to 'mt5' when field omitted |
| Freshness and session stored as transients with 5-minute TTL | `smc_sf_freshness_{uid}_{sym}` and `smc_sf_session_{uid}_{sym}` confirmed |
| `get_market_data_authority()` and `get_authority_diagnostics()` read `source='mt5'` rows | Authority endpoints confirmed; staleness threshold 60 seconds; `willFallbackToTD` flag confirmed |
| Phase 3 test harness exists with SQL, WP-CLI, and curl verification steps | `PHASE3_TESTING_GUIDE.md` and `phase3_mt5_simulation_test.php` confirmed |

---

**Likely** (evidence points to gap; not yet code-confirmed)

| Item | Reasoning |
|---|---|
| Dashboard is NOT wired to `/market-data-authority` or `/authority-diagnostics` | Research search returned no frontend code calling these endpoints; Phase 3 gate requires it |
| `post_ea_market_stream()` does NOT write an `engine_runs` heartbeat row | Not mentioned in handler description; Twelve Data path does write heartbeat; MT5 path omission is probable |

---

**Unconfirmed** (operational, not code deficiencies — no code change resolves them)

| Item | Required action |
|---|---|
| MT5 EA is attached to live terminal and sending webhooks | EA operator verification |
| API-key matches between EA inputs and `wp-config.php` | Configuration audit |
| WordPress endpoint is reachable from MT5 broker network | Network/curl test from MT5 machine |
| 72-hour stability test has been scheduled | Ops scheduling |

**Corrected root cause**: The backend implementation is complete and sound. The Phase 3 gate is blocked by (a) absence of confirmed dashboard authority endpoint wiring, (b) probable absence of engine_runs heartbeat on the MT5 success path, and (c) unresolved operational prerequisites that no code change can substitute for.

---

### 2. Implementation contract

**Total files in scope: 2, both conditional on pre-patch audit.**

---

#### FILE A — Dashboard frontend: authority endpoint wiring

**Pre-condition (mandatory)**: Before writing any code, the implementation agent must read all JavaScript files under `assets/js/` (or the project's frontend entrypoint directory) and grep for calls to `market-data-authority` and `authority-diagnostics`. If both calls are found and wired to a UI state variable, FILE A is entirely dropped from scope.

- **Exact file path**: The dashboard JS module that owns market-data polling and source-authority display state. Likely `assets/js/dashboard.js` or equivalent; exact path must be confirmed by audit before editing.
- **Exact section to modify**: The polling or fetch block that reads market data from the backend REST API, and the state/render block that displays the current data source to the user.
- **Exact change required**:
  1. Add a `GET /wp-json/sniper/v1/market-data-authority` call on page load and on the existing polling interval.
  2. Add a `GET /wp-json/sniper/v1/authority-diagnostics` call on the same cadence.
  3. Store the returned `authority` field (`'mt5'` or `'twelve_data'`) in a local state variable.
  4. When `authorityStale === true` and `willFallbackToTD === true`, set state to `'twelve_data'`.
  5. Render a visible authority-source badge or indicator in the dashboard UI reflecting current state.
  6. Do not alter price display, chart rendering, or Twelve Data polling.
- **Guard rails**:
  - Dashboard must only read and display the backend's authority decision. It must not compute or override authority locally.
  - Do not modify the authority endpoint signatures or response shapes.
  - Do not alter the Twelve Data fetch path, rate-limit handling, or 429 cooldown transient reads.
  - Do not add local caching of the authority response beyond what the existing polling interval already provides.
- **Why in scope**: Phase 3 gate criterion: "Dashboard recognizes MT5 as authoritative data source." Research confirmed no frontend evidence of this wiring.
- **Acceptance criterion**: After a verified MT5 webhook push, the dashboard UI displays `'mt5'` as the authority source within one polling cycle. When MT5 data age exceeds 60 seconds, the dashboard switches to displaying Twelve Data authority without any page reload.

---

#### FILE B — `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: engine_runs heartbeat on MT5 success path

**Pre-condition (mandatory)**: Implementation agent must grep `post_ea_market_stream` for any existing call to the engine-run or heartbeat write function. If a heartbeat write is already present on the success path, FILE B is entirely dropped from scope.

- **Exact file path**: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- **Exact function**: `post_ea_market_stream()` — the success path immediately after `store_tick_snapshot()` returns without error.
- **Exact change required**: Call the same heartbeat write function used by the Twelve Data ingestion path, passing `source='mt5'`, the resolved `$user_id`, and the normalized `$symbol`. Do not create a new function; use the existing one.
- **Guard rails**:
  - Heartbeat write must occur after storage success, not before.
  - Must use the existing heartbeat function exactly as the Twelve Data path calls it — no signature changes.
  - Must not alter auth flow, payload normalization, storage calls, transient writes, or response shape.
  - Failure of the heartbeat write must not abort the response — log and continue.
- **Why in scope**: Phase 3 checklist requires engine_runs rows; backend sync health depends on their recency; MT5 path likely omits what Twelve Data path includes.
- **Acceptance criterion**: After a successful MT5 webhook POST, a row exists in `engine_runs` with `source='mt5'` and `created_at` within 5 seconds of the POST timestamp.

---

### 3. Patch sequence

1. **Audit first — no edits until audit is complete**
   - Read all dashboard JS files; grep for `market-data-authority` and `authority-diagnostics`
   - Read `post_ea_market_stream()` body; grep for heartbeat/engine-run write call
   - Both audits must complete before any file is edited
   - If both audits confirm gaps: proceed to steps 2–3
   - If both audits confirm wiring already exists: stop; no code changes; proceed directly to operational validation

2. **Apply FILE B first** (PHP backend heartbeat — no frontend dependency)
   - Add heartbeat write to `post_ea_market_stream()` success path
   - Verify no change to response shape or auth flow
   - Run existing PHP test harness against the modified handler

3. **Apply FILE A second** (dashboard wiring — may depend on confirmed backend state)
   - Wire authority endpoint fetches to dashboard polling
   - Wire state variable and UI badge
   - Verify Twelve Data path is unaffected

**Sequencing risk**: FILE A depends on FILE B being correct first, because the authority endpoints read from `engine_runs` recency for health status. If FILE B is applied after FILE A, the dashboard may initially display stale health state during the gap.

**No migration or schema changes**: Both changes are additive only. No table alterations, no transient TTL changes, no API signature changes.

---

### 4. Regression guards

**Checks the implementation agent must run after patching**

1. Simulate a valid MT5 webhook POST using the Phase 3 curl harness from `PHASE3_TESTING_GUIDE.md`. Confirm HTTP 200 response with `ok: true`.
2. Query `wp_smc_sf_snapshots WHERE source='mt5'` — confirm row exists with correct `bid`, `ask`, `symbol`, `user_id`, `updated_at`.
3. Query `wp_smc_sf_candles WHERE source='mt5'` — confirm M1 candle row exists with correct `candle_time`, `open`, `high`, `low`, `close`.
4. Query `wp_options WHERE option_name LIKE 'smc_sf_freshness_%'` — confirm transient exists and value is a valid freshness enum.
5. Query `engine_runs WHERE source='mt5'` (if FILE B applied) — confirm row exists within 5 seconds of POST.
6. Call `GET /sniper/v1/market-data-authority` — confirm `source='mt5'` is returned for the tested symbol.
7. Call `GET /sniper/v1/authority-diagnostics` — confirm `authority='mt5'`, `authorityAgeSec` is plausible, `authorityStale=false` for a fresh push.
8. Simulate a Twelve Data fetch for a non-MT5 symbol — confirm it still returns data without interference.
9. Simulate a webhook POST with `source='twelve_data'` in the payload — confirm backend rejects it silently (returns `ok: true` but writes nothing).
10. Confirm dashboard UI displays MT5 authority badge after a successful push (if FILE A applied).

**Existing protections that must still hold**

- `permission_ea_bridge()` must reject requests without a valid `X-EA-API-Key` header — do not weaken.
- Source-field guard at line ~1810 must still reject non-'mt5' values — do not touch.
- Twelve Data rate-limit transients (`429 cooldown`) must survive MT5 coexistence — verify by checking transient keys after MT5 write.
- `normalize_snapshot_payload_compat()` must still handle both legacy and canonical payload formats — do not alter.

**Parity re-validations**

- Pine session killzone windows (London 07-11, NY 12-16) vs. MT5 full market hours (London 07-15, NY 12-20) divergence is documented as intentional display-only divergence. Confirm this comment still exists in code after patching. Do not attempt to reconcile the windows in this patch.
- After a stale MT5 authority event (`authorityStale=true`, `willFallbackToTD=true`), confirm Twelve Data prices are displayed without dashboard error.

---

### 5. Non-goals

**Out of scope for this patch**

- Transient TTL adjustment (currently 5 minutes). The research flags this as possibly too long, but this is a tuning hypothesis with no confirmed failure. Do not change TTL without a confirmed staleness incident.
- Equity index off-session logic (NAS100, US30). Flagged as unvalidated but not confirmed broken. Out of scope.
- Rate-limit transient clearance on MT5 push. Flagged as unimplemented but not confirmed to cause a user-visible failure in Phase 3 testing. Out of scope.
- Change_pct_1d placeholder calculation in MT5 context. Not a Phase 3 gate item.
- Pine trading formula changes of any kind. Research does not prove parity corruption. Do not touch.
- Authority endpoint signature or response shape changes. Endpoints are consumed by health checks; altering them widens blast radius.
- Adding a new MT5 diagnostics operator endpoint. Path B suggestion from research; not required for Phase 3 gate.

**Attractive but unsafe follow-on changes to avoid in this patch**

- Do not reduce transient TTL speculatively — this affects freshness display for all users on the live system.
- Do not add dashboard-side authority override logic — dashboard must remain a reader, not a decision-maker.
- Do not add a fallback that defaults authority to MT5 when the authority endpoint is unreachable — this would bypass the backend's stale-state detection.
- Do not add rate-limit clearance logic inside `post_ea_market_stream()` — the interaction between MT5 writes and TD transient state is not yet characterized.

---

### 6. Risk assessment

**Worst-case failure mode if patched incorrectly**

FILE A incorrect: Dashboard displays MT5 as authoritative when backend has already switched authority to Twelve Data due to stale MT5 data. Operators see conflicting authority signals. Trade signals are generated against the wrong source with no visible warning.

FILE B incorrect: Heartbeat write placed before storage success, or placed on an error path. `engine_runs` table records false successes. Health checks pass when they should fail. Stale data is treated as live.

**User-visible failure mode**

Dashboard shows MT5 authority badge indefinitely after MT5 EA disconnects, because the authority endpoint's `willFallbackToTD` flag is not being read. Users act on stale MT5 prices believing the feed is live.

**Backend authority and stale-state risks**

The authority switch from Twelve Data to MT5 propagates to every trade signal generated. A false `LIVE` state (caused by stale transient surviving past TTL, or dashboard caching the authority response) will produce signals against stale prices. The 60-second staleness threshold in `get_authority_diagnostics()` is the primary guard; the dashboard must respect it without local overrides.

**Whether human approval should be required before merge**

**Yes.** The following approvals are required before merge:

1. MT5 EA operator: confirm EA config, network reachability, API-key match.
2. Backend operator: confirm API-key in `wp-config.php`, verify database rows post-webhook-test, confirm transient TTL is acceptable.
3. Dashboard team: confirm FILE A change does not conflict with any existing authority display logic.
4. Trading ops: confirm authority precedence and fallback behavior are acceptable for live trade signal generation.

---

### 7. Test requirements

**Tests to add**

1. **PHP unit: `post_ea_market_stream()` heartbeat write** (if FILE B applied)
   - Test: successful webhook POST results in an `engine_runs` row with `source='mt5'`
   - Test: failed storage call does not write heartbeat row
   - Location: existing `phase3_mt5_simulation_test.php` test file; add as new assertions

2. **PHP unit: source-field rejection guard**
   - Test: POST with `source='twelve_data'` returns `ok: true` but writes no snapshot row
   - Test: POST with source field omitted writes row with `source='mt5'`
   - Location: same test file; confirm these cases are already covered; add if missing

3. **Frontend integration: authority endpoint polling** (if FILE A applied)
   - Test: after mock MT5 push, authority badge displays `'mt5'`
   - Test: after authority age exceeds 60 seconds (mock `authorityStale=true`), badge switches to `'twelve_data'`
   - Test: Twelve Data price display is unchanged when authority is `'mt5'`
   - Location: dashboard JS test suite (if one exists); otherwise document as manual verification

**Existing tests that must still pass**

- All existing `phase3_mt5_simulation_test.php` assertions
- Auth rejection test: missing or invalid `X-EA-API-Key` returns 401
- Payload normalization test: legacy and canonical payload formats both parse correctly
- Twelve Data integration: non-MT5 symbols continue to return data via existing market-data endpoint

**Soak and parity verification required**

- A 72-hour continuous MT5 webhook simulation must be run against the WordPress instance with EA attached and active, confirming no missed heartbeats, no transient expiry gaps, and no authority flip-flop behavior
- After the soak, query `engine_runs` for gap intervals > 60 seconds; zero gaps is the pass criterion
- During soak, call `authority-diagnostics` on a 30-second interval and log `authorityAgeSec`; confirm it never exceeds 65 seconds for a live feed

---

### 8. Implementation handoff

**Branch naming recommendation**

`phase3/mt5-authority-wiring-and-heartbeat`

**Suggested commit grouping**

1. `chore(phase3): pre-patch audit — confirm dashboard wiring and heartbeat gaps` (no code change; audit findings documented in commit message)
2. `fix(backend): add engine_runs heartbeat write on MT5 success path` (FILE B only, if gap confirmed)
3. `fix(dashboard): wire authority endpoint reads for MT5 source display` (FILE A only, if gap confirmed)
4. `test(phase3): add heartbeat and source-guard assertions to simulation test`

If audit confirms no gaps, commit 1 is followed by a single commit documenting the validation result with no code changes.

**Required reports or artifacts after implementation**

- Updated `PHASE3_IMPLEMENTATION.md`: mark webhook storage path as validated, dashboard wiring as validated, engine_runs heartbeat as validated
- Database query output showing `source='mt5'` rows in both `wp_smc_sf_snapshots` and `wp_smc_sf_candles` attached as evidence
- `authority-diagnostics` endpoint response snapshot at T+5 seconds, T+30 seconds, T+90 seconds post-webhook-push
- Confirmation that the 72-hour soak test has been scheduled with start/end timestamps

**State transition**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
