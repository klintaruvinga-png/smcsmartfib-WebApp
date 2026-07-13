# SMC SuperFIB — EA Side Routes Phase 1 Bridge: Implementation Contract

---

## 1. Issue validation

### Confirmed

- **Root cause: MT5 EA WebRequest calls for four backend routes were never implemented.** The backend PHP routes (`POST /ea/heartbeat`, `POST /ea/account-sync`, `POST /ea/symbol-sync`, `GET /ea/license-check`) are fully implemented, tested, and passing. The MT5 EA has no corresponding caller code for any of these routes. The gap is not a wiring misconfiguration — the code simply does not exist on the EA side.
- **Evidence:** `SMC_MarketDataEA.mq5 OnInit()` contains no license-check call. `OnTimer()` contains no heartbeat or periodic account-sync call. `MarketDataEngine.mqh` contains no `SendLicenseCheck()`, `SendHeartbeat()`, `SendAccountSync()`, or `SendSymbolSync()` methods.
- **Delivery split confirmed:** Phase 1 was split into two tracks. Track A (backend) merged in PR #185 on 2026-05-15. Track B (MT5 EA) was never started. The phase-1-ea-bridge-implementation-report explicitly states no MT5 EA file changes were made in that patch.
- **Baseline WebRequest infrastructure confirmed working:** `POST /ea/market-stream` is called from `MarketDataEngine.mqh:SendToBackend()` at line 357. Current 422 response confirms the route is reachable and auth headers are accepted by the backend; the rejection is payload-level (freshness gate), not auth or transport.
- **All four payload contracts are defined and testable:** Payload field lists, response schemas, and acceptance semantics are fully specified in the PHP backend tests.

### Likely

- **WebRequest can be called from `OnInit()` without hanging.** Current usage is `OnTimer()`-only, but MQL5 `WebRequest()` is synchronous and blocking regardless of handler; there is no documented restriction against calling it from `OnInit()`. The risk is latency during EA startup (license-check adds one synchronous round-trip before `EventSetTimer()` is called), which is acceptable given it is a hard gate.
- **All required MT5 telemetry API calls are available on MT5 build 4150+.** `AccountInfoDouble(ACCOUNT_BALANCE)`, `AccountInfoDouble(ACCOUNT_EQUITY)`, `AccountInfoDouble(ACCOUNT_MARGIN)`, `AccountInfoDouble(ACCOUNT_FREEMARGIN)`, `AccountInfoInteger(ACCOUNT_LEVERAGE)`, `AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)`, `SymbolInfoInteger()`, `SymbolInfoDouble()` are standard MT5 API; not build-specific above 4150.

### Unconfirmed

- **Optimal heartbeat interval.** Research guidance states 30–60 seconds. Backend test does not specify a minimum interval. Interval must be chosen defensively: long enough to avoid `OnTimer()` blocking market-stream, short enough to satisfy 48h+ continuity tracking. **48 seconds is the recommended default** (48 × 75 timer ticks/hour = manageable; adjustable via EA input parameter).
- **Symbol-sync batch size safety.** If `g_symArray[]` contains 100+ symbols and the batch payload exceeds backend request size limits, the request will fail silently. The backend test confirms batch semantics but does not specify a size cap. The implementation must send a single batch; if that is later found to fail at scale, per-batch chunking is a follow-on concern (not in this patch).
- **License-check timeout behavior.** Research recommends treating timeout as denial (hard gate: fail if denied OR timeout). This is conservative and correct for a license gate. **Three retry attempts at 150ms backoff (matching `SendToBackend()` pattern), then `INIT_FAILED`.**

---

## 2. Implementation contract

### File 1: `mt5/MarketDataEngine.mqh`

**Scope:** Add four new public methods. Do not modify any existing method.

---

**Method: `SendLicenseCheck()`**

- **Section to modify:** After the existing `SendToBackend()` method (append new methods at end of class body before closing brace).
- **Exact change:** Add `public bool SendLicenseCheck()` method.
  - Build GET URL with query parameters: `account_id` (from `AccountInfoInteger(ACCOUNT_LOGIN)`), `terminal_id` (from `TerminalInfoString(TERMINAL_DATA_PATH)` hashed or raw), `ea_version` (from module-level `EA_VERSION` constant already defined).
  - Use `WebRequest("GET", url, m_cachedHeaders, 5000, emptyBody, response, httpStatus)`.
  - On HTTP 200: parse JSON response, check `"allowed": true`. Return `true` if allowed, `false` otherwise.
  - On HTTP non-200 or timeout (after 3 attempts, 150ms backoff matching `SendToBackend()` pattern): return `false`.
  - Log result to `Print()` with prefix `[LicenseCheck]`.
- **Guard rails:**
  - Must use `m_cachedHeaders` (built in `Initialize()`, already containing `X-EA-API-Key` header) — do not construct new headers inline.
  - Must use `TimeToIso8601(TimeCurrent())` for any timestamp field (do not call `TimeGMT()` directly).
  - Must not modify `m_cachedHeaders`.
  - Must not call `SendToBackend()` (that is the market-stream path; do not reuse it for routing to different endpoints).
- **Why in scope:** The license-check caller must be in `MarketDataEngine` so it has access to `m_cachedHeaders`, the auth key, and MT5 account API. Placing it in the EA file directly would violate the existing architectural boundary.
- **Acceptance criterion:** EA `OnInit()` calls `SendLicenseCheck()`. If backend returns `{"ok":true,"allowed":false}`, `OnInit()` returns `INIT_FAILED` and EA does not reach `EventSetTimer()`. If backend returns `{"ok":true,"allowed":true}`, `OnInit()` proceeds normally.

---

**Method: `SendHeartbeat()`**

- **Section to modify:** After `SendLicenseCheck()`.
- **Exact change:** Add `public bool SendHeartbeat()` method.
  - POST payload (JSON): `account_id`, `terminal_id`, `broker` (`AccountInfoString(ACCOUNT_COMPANY)`), `broker_server` (`AccountInfoString(ACCOUNT_SERVER)`), `ea_version`, `terminal_build` (`TerminalInfoInteger(TERMINAL_BUILD)`), `connected` (`TerminalInfoInteger(TERMINAL_CONNECTED)`), `timestamp` (`TimeToIso8601(TimeCurrent())`).
  - POST to `m_baseUrl + "/ea/heartbeat"`.
  - On HTTP 200: log success. Return `true`.
  - On error: log warning (`Print("[Heartbeat] WARNING: ...")`). Return `false`. **Do not halt or return INIT_FAILED** — heartbeat is a soft gate.
  - No retry loop on heartbeat (unlike license-check): one attempt only, to avoid blocking `OnTimer()`.
- **Guard rails:**
  - Must not affect `m_candleBuffer`, `m_freshnessState`, or any market-stream state.
  - Must be a soft gate: failure must not stop market-stream processing.
  - Must use same `m_cachedHeaders`.
- **Why in scope:** Requires engine-level access to `m_baseUrl`, `m_cachedHeaders`, and MT5 terminal API.
- **Acceptance criterion:** Backend `engine_runs` table receives a row within 60 seconds of EA timer activation. Dashboard heartbeat monitor reflects EA as connected.

---

**Method: `SendAccountSync()`**

- **Section to modify:** After `SendHeartbeat()`.
- **Exact change:** Add `public bool SendAccountSync()` method.
  - POST payload (JSON): `account_id`, `terminal_id`, `broker`, `broker_server`, `currency` (`AccountInfoString(ACCOUNT_CURRENCY)`), `balance` (`AccountInfoDouble(ACCOUNT_BALANCE)`), `equity` (`AccountInfoDouble(ACCOUNT_EQUITY)`), `margin` (`AccountInfoDouble(ACCOUNT_MARGIN)`), `free_margin` (`AccountInfoDouble(ACCOUNT_FREEMARGIN)`), `leverage` (`AccountInfoInteger(ACCOUNT_LEVERAGE)`), `trade_allowed` (`AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)`), `connected`, `ea_version`, `terminal_build`, `timestamp`.
  - POST to `m_baseUrl + "/ea/account-sync"`.
  - On HTTP 200: log success. Return `true`.
  - On error: log warning. Return `false`. **Soft gate — do not halt.**
  - No retry loop: one attempt, to avoid blocking.
- **Guard rails:**
  - Must not modify any existing account state or cached values used by market-stream.
  - Must not be called before `Initialize()` completes (headers not yet built).
  - Must use `TimeToIso8601(TimeCurrent())`.
- **Why in scope:** Telemetry collection requires engine-level access to `m_baseUrl` and `m_cachedHeaders`.
- **Acceptance criterion:** Backend `smc_sf_account_snapshots` JSON blob contains an entry keyed by `account_id|terminal_id` with balance matching the live account within one sync cycle.

---

**Method: `SendSymbolSync()`**

- **Section to modify:** After `SendAccountSync()`.
- **Exact change:** Add `public bool SendSymbolSync(const string &symbols[], int symbolCount)` method.
  - Accept the resolved symbol array (already available in `SMC_MarketDataEA.mq5` as `g_symArray[]` after `ResolveBrokerSymbol()` completes).
  - Build JSON: top-level object with `account_id`, `terminal_id`, `broker`, `broker_server`, `timestamp`, and `symbols` array.
  - Each symbol entry: `broker_symbol` (raw), `normalized_symbol`, `base_symbol`, `visible` (`SymbolInfoInteger(sym, SYMBOL_SELECT)`), `selected`, `digits` (`SymbolInfoInteger(sym, SYMBOL_DIGITS)`), `point` (`SymbolInfoDouble(sym, SYMBOL_POINT)`), `contract_size` (`SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE)`), `trade_mode` (`SymbolInfoInteger(sym, SYMBOL_TRADE_MODE)`), `min_lot` (`SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN)`), `max_lot` (`SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX)`), `lot_step` (`SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP)`), `spread` (`SymbolInfoInteger(sym, SYMBOL_SPREAD)`), `currency_profit` (`SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT)`), `currency_margin` (`SymbolInfoString(sym, SYMBOL_CURRENCY_MARGIN)`).
  - POST to `m_baseUrl + "/ea/symbol-sync"`. One attempt, no retry loop.
  - On HTTP 200: log `symbols_received` and `symbols_upserted` from response. Return `true`.
  - On error: log warning. Return `false`. **Soft gate.**
- **Guard rails:**
  - Must be called after `ResolveBrokerSymbol()` completes in `OnInit()` — symbol data is only valid after resolution.
  - Must not alter `g_symArray[]` or any normalizer state.
  - Must send as a single batch — no per-symbol individual requests in this patch.
  - Symbol normalization (`normalized_symbol`, `base_symbol`) must use existing `SymbolNormalizer` — do not re-implement normalization inline.
- **Why in scope:** Requires engine-level access to `m_baseUrl`, `m_cachedHeaders`, and `SymbolNormalizer`.
- **Acceptance criterion:** Backend `smc_sf_symbol_sync` table contains upserted rows for all symbols in `g_symArray[]` within one minute of EA startup.

---

### File 2: `mt5/SMC_MarketDataEA.mq5`

**Scope:** Wire the four new engine methods into `OnInit()` and `OnTimer()`. Add a module-level heartbeat throttle counter. Do not restructure existing logic.

---

**Change A: Module-level heartbeat counter**

- **Section to modify:** Module-level variable declarations (top of file, alongside existing `g_symArray[]`, engine instance, etc.).
- **Exact change:** Add `static int g_heartbeatTickCount = 0;` and `static const int HEARTBEAT_INTERVAL_TICKS = 48;` (configurable: one heartbeat every 48 `OnTimer()` invocations, approximately 48 seconds if timer is 1000ms).
- **Guard rails:** Must not collide with existing module-level variable names. Must be `static` to avoid re-initialization across invocations.

---

**Change B: `OnInit()` — license-check hard gate**

- **Section to modify:** `OnInit()` at line 119, immediately after config validation and before `ResolveBrokerSymbol()` calls.
- **Exact change:** Insert:
  ```
  if (!engine.SendLicenseCheck()) {
      Print("[EA] License check denied or timed out. EA will not start.");
      return INIT_FAILED;
  }
  ```
- **Guard rails:**
  - Must be placed before `EventSetTimer()`. EA must not begin periodic polling if license is denied.
  - Must be placed before account-sync and symbol-sync calls.
  - Must not wrap `ResolveBrokerSymbol()` inside the license gate (symbol resolution is independent of license status and could be needed for diagnostics).
  - `INIT_FAILED` is the correct MQL5 return code — do not use `INIT_PARAMETERS_INCORRECT` or return `-1`.

---

**Change C: `OnInit()` — account-sync and symbol-sync after symbol resolution**

- **Section to modify:** `OnInit()` at line 119, after `ResolveBrokerSymbol()` completes and `g_symArray[]` is fully populated, before `EventSetTimer()`.
- **Exact change:** Insert:
  ```
  engine.SendAccountSync();
  engine.SendSymbolSync(g_symArray, ArraySize(g_symArray));
  ```
- **Guard rails:**
  - Must be after `ResolveBrokerSymbol()` — symbol data must be valid before `SendSymbolSync()` is called.
  - Both are soft gates: failure must not prevent `EventSetTimer()` from being called.
  - Must be before `EventSetTimer()` so initial metadata is pushed to backend before the market-stream loop begins.

---

**Change D: `OnTimer()` — heartbeat throttle**

- **Section to modify:** `OnTimer()` at line 200, at the top of the function body before existing symbol poll loop.
- **Exact change:** Insert:
  ```
  g_heartbeatTickCount++;
  if (g_heartbeatTickCount >= HEARTBEAT_INTERVAL_TICKS) {
      g_heartbeatTickCount = 0;
      engine.SendHeartbeat();
  }
  ```
- **Guard rails:**
  - Must be placed before the existing symbol poll loop — heartbeat failure must not block symbol polling (soft gate).
  - Must not replace or reorder the existing `engine.OnPeriodic()` call.
  - Must not alter the existing `OnTick()` path.
  - Counter must reset to 0 after firing, not after a failed heartbeat.

---

## 3. Patch sequence

1. **`mt5/MarketDataEngine.mqh` — Add `SendLicenseCheck()`**
   Dependency: None. Uses only existing `m_cachedHeaders`, `m_baseUrl`, and `TimeToIso8601()` which are all already initialized in `Initialize()`.

2. **`mt5/MarketDataEngine.mqh` — Add `SendHeartbeat()`**
   Dependency: None beyond step 1 (independent method, same access pattern).

3. **`mt5/MarketDataEngine.mqh` — Add `SendAccountSync()`**
   Dependency: None beyond step 2.

4. **`mt5/MarketDataEngine.mqh` — Add `SendSymbolSync()`**
   Dependency: `SymbolNormalizer` must remain unmodified. Depends on symbol array being passed in from caller — does not self-source the array.

5. **`mt5/SMC_MarketDataEA.mq5` — Add module-level heartbeat counter variables**
   Dependency: Steps 1–4 must be complete (compiler will reject calls to undefined methods).

6. **`mt5/SMC_MarketDataEA.mq5` — Wire `OnInit()`: license-check gate**
   Dependency: Step 5.

7. **`mt5/SMC_MarketDataEA.mq5` — Wire `OnInit()`: account-sync + symbol-sync after `ResolveBrokerSymbol()`**
   Dependency: Step 6.

8. **`mt5/SMC_MarketDataEA.mq5` — Wire `OnTimer()`: heartbeat throttle**
   Dependency: Step 7.

**Sequencing risk:** Steps 1–4 must be committed before steps 5–8 attempt to compile. If both files are modified in the same commit, the MQL5 compiler processes them together and order is not a risk. However, logical review must verify the method signatures in `MarketDataEngine.mqh` exactly match the call sites in `SMC_MarketDataEA.mq5` before compilation.

**No database migration required.** Backend schema is already in place.

**No cache invalidation required.** New routes are append/upsert; they do not displace existing cached state.

---

## 4. Regression guards

**After patching, the implementation agent must verify:**

1. **Market-stream WebRequest path is unchanged.** `SendToBackend()` in `MarketDataEngine.mqh` must have zero modifications. Its retry logic (3 attempts, 150ms backoff), header reuse (`m_cachedHeaders`), JSON payload structure, and `httpStatus` evaluation (200/201 = success) must be bit-for-bit identical to pre-patch.

2. **`OnInit()` symbol resolution order is unchanged.** `ResolveBrokerSymbol()` must still be called in the same sequence as pre-patch. The license-check gate is prepended before symbol resolution; account-sync and symbol-sync are appended after. No existing `OnInit()` lines may be reordered.

3. **`OnTimer()` poll order is unchanged.** The existing non-chart symbol poll loop and `engine.OnPeriodic()` call must execute in the same order as pre-patch. The heartbeat block is prepended before the poll loop; it must not be inserted between `engine.OnPeriodic()` and the poll loop.

4. **`TimeToIso8601()` is not modified.** All new methods must call it without alteration. It must remain the sole timestamp authority (no `TimeGMT()` direct calls in new code).

5. **Auth header is not re-constructed.** All new `WebRequest` calls must pass `m_cachedHeaders` directly. No inline header construction.

6. **License-check inversion is correct.** The gate must read: `if (!engine.SendLicenseCheck()) return INIT_FAILED`. It must NOT read: `if (engine.SendLicenseCheck()) return INIT_FAILED`. This is the highest-risk logic inversion. Reviewer must explicitly check this.

7. **Backend PHP tests remain passing (no regressions introduced by this patch):**
   - `test-ea-heartbeat.php` — PASS
   - `test-ea-account-sync.php` — PASS
   - `test-ea-symbol-sync.php` — PASS
   - `test-ea-license-check.php` — PASS
   - `test-ea-market-stream.php` — PASS
   - `test-mt5-snapshot-contract.php` — PASS

8. **`SymbolNormalizer` is not modified.** Symbol normalization must remain identical; `SendSymbolSync()` is a consumer, not a modifier.

9. **Logging prefixes must be distinct.** `[LicenseCheck]`, `[Heartbeat]`, `[AccountSync]`, `[SymbolSync]` must each be present so log analysis can distinguish route failures without ambiguity.

**Parity re-validations required:**

- After EA starts and completes `OnInit()`, backend must show:
  - One `engine_runs` row from first heartbeat within 60 seconds.
  - One `smc_sf_account_snapshots` entry matching the live account balance within one sync cycle.
  - `smc_sf_symbol_sync` rows for all symbols in `g_symArray[]`.
- After 48h+ soak: heartbeat rows in `engine_runs` must be continuous (no gaps > 120 seconds under normal connectivity).

---

## 5. Non-goals

**Out of scope for this patch:**

- Any modification to `SendToBackend()` or the market-stream WebRequest flow.
- Any modification to `OnTick()`.
- Refactoring `WebRequest` retry logic into a shared `WebRequestWrapper()` helper (Path B — deferred).
- Extracting `PayloadBuilder` or a route registry class (Path B — deferred).
- Adding a dedicated error logger or telemetry module (Path B — deferred).
- Any change to PHP backend routes, handlers, or database schema.
- Any change to backend PHP tests.
- Dashboard UI changes related to heartbeat monitoring, account balance display, or symbol metadata.
- Phase 2 components: `FreshnessEngine`, `CandleBuilder`, `SessionManager`.
- Symbol-sync chunking or per-batch fallback for large symbol arrays.
- Per-symbol individual WebRequest fallback if batch fails.
- Periodic `SendAccountSync()` from `OnTimer()` (only `OnInit()` account-sync is in scope; periodic account-sync is a Phase 2 concern unless explicitly added to this issue).
- Auto-reconnect logic or WebRequest connection retry beyond the 3-attempt/150ms pattern already established.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Do not add a `SendAccountSync()` call inside the heartbeat throttle block in `OnTimer()`. Account-sync every 48 seconds would generate noise in `smc_sf_account_snapshots` and is not required by the Phase 1 gate. If periodic account-sync is needed, it requires a separate interval counter and a separate issue.
- Do not reduce the WebRequest timeout from 5000ms to a shorter value. Consistency with `SendToBackend()` is more important than micro-optimization at this stage.
- Do not add an `EventSetTimer()` call inside `SendHeartbeat()` for self-scheduling. Timer management must remain in `OnInit()` only.
- Do not add `user_id` injection inside `MarketDataEngine.mqh`. If `user_id` is needed beyond the API key, it must be passed as a parameter from the EA file — do not reach into WordPress session state from the engine.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

- License-check gate logic is inverted (`if (SendLicenseCheck()) return INIT_FAILED`): EA refuses to start for all licensed users, blocks all market-stream data collection, and Phase 1 validation is impossible until the bug is identified and redeployed. This is a silent failure from the user's perspective (EA simply does not attach).
- License-check timeout is treated as success: Unlicensed or expired accounts run unchecked. This is a compliance violation.
- `SendHeartbeat()` is placed inside a hard gate: Heartbeat failure at any point stops market-stream processing. All market-stream data collection halts until EA is restarted manually.
- `SendSymbolSync()` is called before `ResolveBrokerSymbol()`: Symbol fields are uninitialized or stale. Backend receives garbage symbol metadata that is then used by dashboard calculations.

**User-visible failure mode:**

- If license-check gate inverted: EA does not load; no chart data; terminal shows `[EA] License check denied` log but user's license is valid.
- If heartbeat hard-gated: Market-stream stops on first heartbeat failure (e.g., transient network blip); dashboard shows stale data or disconnected state even though terminal is online.
- If symbol-sync precedes symbol resolution: Dashboard trade panel shows wrong lot sizes, wrong spread, or wrong decimal precision.

**Backend authority and stale-state risks:**

- `smc_sf_account_snapshots` will be stale if account balance changes significantly between EA restarts and no periodic account-sync is scheduled. This is an accepted limitation in Phase 1 scope; the backend remains the authority but the snapshot is point-in-time.
- Heartbeat absence (network failure, not EA failure) may cause dashboard to show disconnected state even when EA is running. This is correct behavior, not a bug — backend authority is preserved.
- Symbol-sync data remains static after `OnInit()`. Live spread changes will not be reflected until EA restarts. This is an accepted Phase 1 limitation.

**Human approval required before merge:** YES.

Reasons:
1. License-check gate inversion is a one-character logic error with severe consequences. A human reviewer must explicitly verify `if (!engine.SendLicenseCheck())`.
2. Heartbeat soft-gate classification must be confirmed in code review (not just specified in plan).
3. WebRequest call from `OnInit()` must be verified as non-blocking on the MT5 build in use before merge to production deployment.

---

## 7. Test requirements

**Tests to add:**

- **MQL5 unit test (if the project has an MQL5 test harness):** Mock `WebRequest` return for `SendLicenseCheck()` with `allowed=false`; verify `OnInit()` returns `INIT_FAILED`. Mock with `allowed=true`; verify `OnInit()` proceeds to `EventSetTimer()`.
- **MQL5 integration smoke test:** EA attaches to a live or demo terminal account with valid credentials. Verify backend logs show license-check 200, account-sync 200, symbol-sync 200 within 30 seconds of attach. Verify `engine_runs` shows heartbeat row within 60 seconds.

**Existing tests that must still pass (no regressions):**

- `test-ea-heartbeat.php` — PHP backend unit test
- `test-ea-account-sync.php` — PHP backend unit test
- `test-ea-symbol-sync.php` — PHP backend unit test
- `test-ea-license-check.php` — PHP backend unit test
- `test-ea-market-stream.php` — PHP backend unit test
- `test-mt5-snapshot-contract.php` — PHP backend unit test

**Live environment verification required:**

- **48-hour soak:** After patch deployment, EA must run continuously for 48 hours. `engine_runs` heartbeat rows must be present with no gaps > 120 seconds (accounting for expected network transients up to 2 heartbeat periods).
- **License deny path:** Must be manually tested against a revoked or expired license key. EA must log `[LicenseCheck] License check denied or timed out. EA will not start.` and return `INIT_FAILED`.
- **Account balance parity:** Observe live account balance in terminal. Confirm `smc_sf_account_snapshots` shows matching value within one sync cycle after EA restart.
- **Symbol metadata parity:** Confirm `smc_sf_symbol_sync` rows for all configured symbols contain spread, digits, and lot constraints matching the terminal's `SymbolInfo*` readings at time of sync.
- **Market-stream continuity:** Confirm market-stream WebRequest path continues to post candles normally after new routes are added. Existing 422 freshness-gate rejection pattern (confirming route is reachable) must still appear in logs for stale candles.

---

## 8. Implementation handoff

**Branch naming recommendation:**

```
codex/ea-phase1-bridge-webrequests
```

**Suggested commit grouping:**

- **Commit 1:** `feat(mt5): add SendLicenseCheck to MarketDataEngine`
- **Commit 2:** `feat(mt5): add SendHeartbeat to MarketDataEngine`
- **Commit 3:** `feat(mt5): add SendAccountSync to MarketDataEngine`
- **Commit 4:** `feat(mt5): add SendSymbolSync to MarketDataEngine`
- **Commit 5:** `feat(mt5): wire license-check gate, account-sync, symbol-sync into OnInit`
- **Commit 6:** `feat(mt5): wire heartbeat throttle into OnTimer`

Commits 1–4 may be squashed into a single `feat(mt5): add four EA bridge WebRequest methods to MarketDataEngine` if the implementation agent prefers atomic delivery. Commits 5–6 must remain separate to keep EA wiring review isolated.

**Required reports or artifacts to generate after implementation:**

- `reports/ea-phase1-bridge-webrequests-implementation-report.md` — Summary of methods added, wiring changes, payload schemas confirmed, lines changed.
- Backend log snapshot showing: license-check 200, account-sync 200, symbol-sync 200, first heartbeat 200, `engine_runs` row count after 1 hour of soak.
- `smc_sf_symbol_sync` row count and sample row confirming field parity against terminal `SymbolInfo*` readings.

**State transition:**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
