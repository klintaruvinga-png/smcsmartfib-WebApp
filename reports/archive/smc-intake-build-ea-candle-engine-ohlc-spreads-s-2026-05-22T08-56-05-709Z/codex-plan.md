# SMC SuperFIB Phase 3 — EA Candle Engine Implementation Contract

## 1. Issue validation

### Confirmed
- `mt5/MarketDataEngine.mqh` `BuildWebhookPayload()` is the single construction point for the EA-to-backend payload. The research confirms all Phase 3 field names are present in the EA codebase: `symbol`, `normalized_symbol`, `timeframe`, `timestamp`, `bid`, `ask`, `freshness`, `session`, `spread`, and candle OHLC.
- `mt5/FreshnessEngine.mqh` manages LIVE/DELAYED/STALE/CLOSED transitions and is wired to both tick and periodic events.
- `mt5/SMC_MarketDataEA.mq5` uses `OnTimer()` to poll non-chart symbols so all watched symbols receive freshness updates independent of chart tick activity.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` contains hardcoded `source='mt5'` persistence and route registration for `POST /wp-json/sniper/v1/ea/market-stream` with `X-EA-API-Key` auth.
- `PHASE3_IMPLEMENTATION.md` is the authoritative acceptance criteria document for this issue.
- `MT5_CANONICAL_MARKET_SPEC.md` is the authoritative spec for tick ingestion, session detection, freshness transitions, and 10-second webhook frequency.

### Likely
- A Phase 3 contract gap exists between the EA payload field set and the backend ingestion schema. The EA code describes the fields; the research does not confirm that field names, types, and value formats match the backend's expected schema exactly.
- The 10-second dispatch timer exists but has not been validated end-to-end against the backend route under live or simulated conditions.
- Session detection edge cases — equity index closed hours and weekend gaps — may cause `CLOSED` state to propagate incorrectly, triggering the backend stale-data guard and silently dropping valid payloads.

### Unconfirmed
- Whether the backend route in this workspace currently accepts the full Phase 3 payload schema without rejection.
- Whether `mt5/CandleBuilder.mqh` and the inline `CopyRates()` path in `MarketDataEngine.mqh` are redundant or serve distinct purposes.
- Whether equity index session overrides in `mt5/SessionManager.mqh` are correct for all symbols in the configured watch list.
- Whether any payload field is malformed at runtime — e.g., timestamp in seconds instead of UTC Unix milliseconds, freshness as an integer instead of a string enum, session as a non-canonical string.

**Planning verifier note:** The research labels its own root cause as a hypothesis. The corrected framing is a *contract completeness gap*. Phase 3 components exist in the codebase but have not been validated as a closed loop from EA dispatch through backend persistence. This is not a single-line bug. It is an integration seam that must be walked and confirmed at each joint before any code is changed.

---

## 2. Implementation contract

### File 1: `mt5/MarketDataEngine.mqh`

- **Target:** `BuildWebhookPayload()` and `OnPeriodic()`
- **Exact change required:** Confirm all Phase 3 payload fields are present and correctly typed: `symbol` (string), `normalized_symbol` (string), `timeframe` (string), `timestamp` (UTC Unix milliseconds integer), `bid` (double), `ask` (double), `spread` (double), `freshness` (string enum: `LIVE`/`DELAYED`/`STALE`/`CLOSED`), `session` (canonical spec string), and per-timeframe OHLC fields `candle_open`, `candle_high`, `candle_low`, `candle_close`, `candle_volume`, `candle_time` for both M1 and M15. If `timestamp` is emitted in seconds, convert to milliseconds. If any field is absent or mis-keyed relative to the backend schema, add or correct it. If `OnPeriodic()` is not called on a 10-second interval, correct `EventSetTimer()`.
- **Guard rails:** Do not rename fields that already match the backend schema. Do not remove the future-candle timestamp guard in the `CopyRates()` path. Do not alter the `OnPeriodic()` call chain beyond adding missing fields or correcting the timer interval.
- **Why in scope:** This is the sole construction point of every Phase 3 payload value. All field completeness and format requirements converge here.
- **Acceptance criterion:** A payload JSON produced by `BuildWebhookPayload()` for an active symbol contains all Phase 3 required fields with correct types and no null values.

---

### File 2: `mt5/FreshnessEngine.mqh`

- **Target:** State transition thresholds and `CLOSED` propagation logic
- **Exact change required:** Confirm LIVE/DELAYED/STALE aging thresholds match the values specified in `MT5_CANONICAL_MARKET_SPEC.md`. Confirm CLOSED is set when `SessionManager` reports the market as outside trading hours, including weekend gaps and equity index close periods. If thresholds or CLOSED conditions differ from the spec, update them to match. No new states may be introduced.
- **Guard rails:** Do not add freshness states beyond LIVE/DELAYED/STALE/CLOSED. Do not change the tick and periodic event bindings. Do not alter the authority contract between freshness state output and backend acceptance logic.
- **Why in scope:** Session/freshness misclassification is the primary Likely trigger. The canonical spec is the authority; this file must match it precisely.
- **Acceptance criterion:** `FreshnessEngine` outputs `CLOSED` for a symbol during a confirmed closed-session window and outputs `LIVE` when a tick arrives within the spec-defined LIVE threshold.

---

### File 3: `mt5/SessionManager.mqh`

- **Target:** `GetCurrentSession()` (or equivalent session detection function) and equity index closed-hour overrides
- **Exact change required:** Confirm the session strings emitted match the exact canonical values in `MT5_CANONICAL_MARKET_SPEC.md` — e.g., `"LONDON"`, `"NEW_YORK"`, `"ASIAN"`, `"CLOSED"`. If equity index session overrides are absent or incomplete for any symbol in the configured watch list, add them. If session boundary times do not match the spec, correct them.
- **Guard rails:** Do not change session boundary times without a traceable reference in `MT5_CANONICAL_MARKET_SPEC.md`. Do not alter the interface consumed by `MarketDataEngine`. Do not add new session types beyond those in the spec.
- **Why in scope:** Session string mismatch is an unconfirmed but plausible backend field-rejection path. The session value feeds directly into `BuildWebhookPayload()` and must be canonical.
- **Acceptance criterion:** `GetCurrentSession()` returns the spec-canonical string for each configured symbol at any hour, including equity index close periods.

---

### File 4: `mt5/SMC_MarketDataEA.mq5`

- **Target:** `OnTimer()` dispatch interval and non-chart symbol polling loop
- **Exact change required:** Confirm `EventSetTimer(10)` is in the initialization path. Confirm the `OnTimer()` body calls `OnPeriodic()` or equivalent for every configured symbol, not only the attached chart symbol. If the timer value is not 10, correct it. If non-chart symbol polling is absent, add it.
- **Guard rails:** Do not change the EA initialization sequence beyond correcting the timer value. Do not add new event handlers. Do not alter the symbol configuration loading path.
- **Why in scope:** 10-second dispatch is a Phase 3 hard requirement. Non-chart symbol polling is the mechanism that makes freshness authoritative across the full watch list.
- **Acceptance criterion:** The EA calls `OnPeriodic()` for every configured symbol every 10 seconds regardless of chart tick activity.

---

### File 5: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

- **Target:** Route handler for `POST /wp-json/sniper/v1/ea/market-stream` and `X-EA-API-Key` auth gate
- **Exact change required:** Confirm the route is registered and the auth gate validates `X-EA-API-Key` before processing the payload body. If the route handler does not validate required Phase 3 fields (`freshness`, `session`, `spread`, `bid`, `ask`, OHLC fields, `timestamp`), add field presence validation that returns HTTP 400 with a logged error message on failure. Add a log line on successful ingestion that records the received `freshness` and `session` values.
- **Guard rails:** Do not change the route URI. Do not change the auth key mechanism. Do not alter Twelve Data fallback route handling. Do not relax any existing validation.
- **Why in scope:** Route-level field validation surfaces payload contract violations as visible HTTP errors rather than silent data loss. The diagnostic log line is required for post-deploy verification.
- **Acceptance criterion:** A POST with a missing required field returns HTTP 400 with a logged error. A valid complete POST returns HTTP 200 and a `freshness`/`session` log entry appears in the WordPress debug log.

---

### File 6: `wordpress/smc-superfib-sniper/class-market-data-service.php`

- **Target:** `source='mt5'` upsert path writing to `wp_smc_sf_snapshots` and `wp_smc_sf_candles`
- **Exact change required:** Confirm `source='mt5'` is hardcoded on all upsert operations for EA-sourced rows and is not derived from the payload body. Confirm the candle write path deduplicates by `(symbol, timeframe, candle_time)` using an upsert guard — if it does not, add one. Confirm the stale-data guard rejects payloads with `timestamp` older than 300 seconds and that the 10-second EA dispatch interval keeps payloads within this window under normal operation.
- **Guard rails:** Do not change the Twelve Data write path. Do not alter MT5 authority protection for already-persisted rows. Do not relax or widen the 300-second stale guard threshold.
- **Why in scope:** Silent data loss at the persistence layer is the highest-risk unconfirmed failure path. Duplicate candle rows or missing `source='mt5'` tags silently break Phase 3 authority and require a database correction to reverse.
- **Acceptance criterion:** Two consecutive EA payloads for the same `(symbol, timeframe, candle_time)` produce exactly one candle row. All rows written by this path carry `source='mt5'`.

---

### File 7: `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`

- **Target:** Phase 3 simulation test suite
- **Exact change required:** Add the following test cases:
  1. Full Phase 3 payload ingestion — asserts HTTP 200, one snapshot row with `source='mt5'`, one candle row with `source='mt5'`.
  2. Incomplete payload (missing `freshness`) — asserts HTTP 400.
  3. Incomplete payload (missing any OHLC field) — asserts HTTP 400.
  4. Stale payload (`timestamp` > 300 seconds old) — asserts stale-data guard rejection.
  5. CLOSED freshness state — asserts HTTP 200 and row persisted without triggering stale rejection.
  6. Duplicate candle upsert — two payloads with identical `(symbol, timeframe, candle_time)` produce exactly one candle row.
- **Guard rails:** Do not remove or modify existing test cases. Do not mock the database layer — these must be integration tests against the real schema.
- **Why in scope:** Phase 3 gate cannot close without this test coverage. The research explicitly identifies this file as the regression surface.
- **Acceptance criterion:** All new and all pre-existing test cases pass in a clean environment.

---

## 3. Patch sequence

1. Read `MT5_CANONICAL_MARKET_SPEC.md` in full — all MT5 changes must trace to spec entries. Do not proceed to MT5 files until this read is complete.
2. Apply `mt5/FreshnessEngine.mqh` — align thresholds and CLOSED logic to the spec. This is the upstream data source for all freshness values in the payload.
3. Apply `mt5/SessionManager.mqh` — align session strings to the spec. This is the upstream data source for all session values in the payload.
4. Apply `mt5/MarketDataEngine.mqh` — validate and complete `BuildWebhookPayload()` using the now-confirmed freshness and session outputs. Correct the timer interval if needed.
5. Apply `mt5/SMC_MarketDataEA.mq5` — confirm `EventSetTimer(10)` and non-chart polling. This step is expected to be verification-only; code change only if the timer value is wrong.
6. Apply `wordpress/smc-superfib-sniper/class-market-data-service.php` — harden the `source='mt5'` upsert path and candle deduplication guard. This step is independent of steps 2–5 and may be worked in parallel.
7. Apply `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — add required-field validation and diagnostic logging to the route handler. This step depends on step 6 only.
8. Apply `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` — add test cases after all implementation seams are confirmed.

**Dependencies:**
- Steps 2 and 3 must complete before step 4. `BuildWebhookPayload()` consumes their outputs.
- Steps 6 and 7 are independent of steps 2–5 and may run in parallel on a second agent.
- Step 8 depends on all prior steps.

**Sequencing risks:**
- If `MT5_CANONICAL_MARKET_SPEC.md` is found to be inconsistent with the WordPress backend schema (e.g., session string casing mismatch), the PHP-side changes must be re-evaluated before MT5 field names are finalized. The spec is MT5-side authority; the backend must accept its values, not the reverse.
- The 300-second stale guard must not be widened during this patch. If the EA timer and the stale guard are discovered to be incompatible under normal conditions, surface this as a blocker requiring human review rather than silently relaxing the guard.

---

## 4. Regression guards

- `POST /wp-json/sniper/v1/ea/market-stream` with a valid complete Phase 3 payload must return HTTP 200 after the patch.
- `source='mt5'` rows must not be overwritten by Twelve Data fallback after the patch. Run a query for `source='mt5'` rows and confirm they persist across a Twelve Data poll cycle.
- The future-candle guard in `BuildWebhookPayload()` must remain active — verify that a `CopyRates()` bar with `time > TimeCurrent()` is excluded from the payload.
- `FreshnessEngine` must not emit `LIVE` for a symbol that has not received a tick within the spec-defined LIVE threshold.
- The 10-second dispatch timer must survive an EA re-initialization (chart reload without MT5 restart).
- All pre-existing PHP test cases in `wordpress/smc-superfib-sniper/tests/php/` must pass without modifying existing assertions.
- **Parity re-validation:** After any change to `BuildWebhookPayload()`, perform a schema diff of the emitted JSON field names against the backend's expected field names. A single mis-keyed field causes silent data loss.
- After the patch, the backend's `engine_runs` counter must increment on each EA dispatch cycle, confirming heartbeat tracking is intact.
- The diagnostic log lines added to the route handler must appear in the WordPress debug log on every successful ingestion — this is the primary post-deploy verification signal.

---

## 5. Non-goals

- Dashboard UI changes are out of scope.
- `src/types/sniper.ts` changes are out of scope unless a payload field name mismatch requires a type correction. Even then, the change is limited to the specific mismatched field only.
- Twelve Data fallback logic changes are out of scope.
- Adding new freshness states beyond LIVE/DELAYED/STALE/CLOSED is out of scope.
- Changing the `X-EA-API-Key` authentication mechanism is out of scope.
- Changing the route URI is out of scope.
- Adding new MT5 symbols to the watch list is out of scope.
- Adding new timeframes beyond M1 and M15 is out of scope.
- `mt5/CandleBuilder.mqh` and `mt5/TickProcessor.mqh` are out of scope. The research lists them as likely affected but provides no confirmed evidence of a gap in either. Resolving the CandleBuilder/CopyRates redundancy is explicitly deferred until the redundancy is confirmed and the safe path is identified.
- `PHASE3_IMPLEMENTATION.md` and `PHASE3_TESTING_GUIDE.md` documentation updates are out of scope unless the patch changes an acceptance criterion.
- Phase 0 stale-data protection relaxation is prohibited regardless of context.

**Attractive but unsafe follow-ons to avoid in this patch:**
- Do not refactor `BuildWebhookPayload()` into a new abstraction while filling in missing fields. Fix the gap only.
- Do not consolidate `FreshnessEngine` and `SessionManager` into a single component. They are separate authority contracts.
- Do not add backend buffering or retry logic for EA payloads. The 10-second dispatch is the designed delivery guarantee; adding buffering changes the freshness semantics.
- Do not add frontend authority for any MT5 field. The frontend remains a read surface only.

---

## 6. Risk assessment

- **Worst-case failure mode if patched incorrectly:** A field name mismatch between the MT5 payload and the backend schema causes all EA snapshots to be silently accepted at HTTP 200 but written with null values or dropped at the persistence layer. `wp_smc_sf_snapshots` contains no valid `source='mt5'` rows. The backend silently falls back to Twelve Data for all symbols. This failure is invisible until a downstream query for `source='mt5'` data returns zero rows.
- **User-visible failure mode:** Dashboard displays Twelve Data prices in place of MT5 prices. Freshness indicators show STALE or DELAYED for all MT5-authoritative symbols. No error appears on the frontend.
- **Backend authority risk:** If the `source='mt5'` upsert path is incomplete, Twelve Data rows may persist for symbols that should be MT5-authoritative. Reversing this requires a database correction in addition to a code fix — it cannot be resolved by redeploying the patch alone.
- **Stale-state risk:** If FreshnessEngine aging thresholds are shorter than the 10-second dispatch interval, symbols may age into STALE during normal operation. The backend stale-data guard then rejects valid payloads. This failure mode produces HTTP 400 responses in the WordPress debug log and no MT5 rows written — it is diagnosable but requires both a code fix and a database correction.
- **Human approval required before merge:** Yes. MT5 source authority, the `source='mt5'` write path, the `X-EA-API-Key` auth gate, and the stale-data guard are all Phase 0 protections. A human reviewer must confirm that no guard has been weakened or bypassed before merge.

---

## 7. Test requirements

**Tests to add (`wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`):**
- Full Phase 3 payload ingestion test — all required fields populated, asserts HTTP 200, one snapshot row with `source='mt5'`, one candle row with `source='mt5'`.
- Missing `freshness` field test — asserts HTTP 400.
- Missing `session` field test — asserts HTTP 400.
- Missing any OHLC field test — asserts HTTP 400.
- Stale payload test — `timestamp` more than 300 seconds in the past, asserts stale-data guard rejection.
- `CLOSED` freshness state test — valid payload with `freshness=CLOSED`, asserts HTTP 200 and row persisted (not rejected as stale).
- Duplicate candle upsert test — two payloads with identical `(symbol, timeframe, candle_time)`, asserts exactly one candle row is present after both writes.

**Tests that must continue to pass without modification:**
- All pre-existing test cases in `wordpress/smc-superfib-sniper/tests/php/`.
- The future-candle guard test, if it exists — a bar with `time > TimeCurrent()` must be excluded from the payload.

**Live environment verification required after deployment:**
- Confirm `engine_runs` increments every ~10 seconds for each configured MT5 symbol.
- Confirm `wp_smc_sf_snapshots` contains rows with `source='mt5'` and `timestamp` within the last 30 seconds for each active symbol.
- Confirm `wp_smc_sf_candles` contains a row with `source='mt5'` for the most recently closed M1 and M15 bars for each active symbol.
- Confirm the diagnostic log lines added to the route handler are visible in the WordPress debug log on each successful ingestion cycle.

---

## 8. Implementation handoff

- **Branch naming:** `feature/phase3-ea-candle-engine-contract`
- **Suggested commit grouping:**
  1. `mt5: align FreshnessEngine thresholds and CLOSED transitions to canonical spec`
  2. `mt5: align SessionManager session strings to canonical spec`
  3. `mt5: validate and complete BuildWebhookPayload Phase 3 field set`
  4. `mt5: confirm OnTimer 10s interval and non-chart symbol polling`
  5. `backend: harden source=mt5 upsert path and candle deduplication guard`
  6. `backend: add required-field validation and diagnostic logging to ea/market-stream route`
  7. `tests: add Phase 3 MT5 simulation test coverage`
- **Required artifacts after implementation:**
  - `reports/phase3-ea-implementation-report.md` — the implementation agent must confirm each acceptance criterion was met, each test result, any deviations from this contract, and the live snapshot verification output (a timestamped dump of `wp_smc_sf_snapshots` rows with `source='mt5'` confirming post-deploy authority).
- **State transition:** `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
