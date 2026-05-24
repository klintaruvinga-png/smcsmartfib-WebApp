# SMC SuperFIB - Implementation Contract: Crypto Weekend Session Classification

## 1. Issue validation

**MISMATCH NOTE (recorded in-contract):** The RUNTIME CONTEXT issue header describes soakType/soakPurpose form wiring. The attached `reports/copilot-research.md` contains evidence exclusively about crypto weekend session classification in MT5/backend. These are different defects. This plan is scoped to what the research report actually proves. If a soakType/soakPurpose plan is required, a separate research artifact must be produced and submitted.

---

**Confirmed:**
- `mt5/SessionManager.mqh` applies generic weekend closure rules to all non-equity symbols. No crypto-specific 24/7 override exists. The only asset-class branch is `IsEquityIndexSymbol()`.
- `mt5/MarketDataEngine.mqh` `OnPeriodic()` calls `sessionManager.IsMarketOpenForSymbol(normalized, now)` for every tracked symbol including crypto without any pre-filter.
- `mt5/FreshnessEngine.mqh` emits `FRESHNESS_CLOSED` when `is_market_open=false`. `FreshnessStateName()` maps that enum to the string `"CLOSED"`. No secondary path exists per research report.
- `wordpress/smc-superfib-sniper/class-market-data-service.php` maps `CLOSED` and `DISCONNECTED` to `state='offline'` in `store_tick_snapshot()`.
- `.github/migration-status.md` documents crypto-fresh-on-weekend as expected behavior. This is primary documentary evidence that the current classification is a defect, not intended design.

**Root cause: Confirmed**
`IsMarketOpenForSymbol()` in `mt5/SessionManager.mqh` has no crypto-specific open-market override. On weekend UTC windows it returns `false` for crypto symbols. `FreshnessEngine` derives `FRESHNESS_CLOSED` from that result. The backend maps `CLOSED` to `state='offline'`. The defect is a session-classification error in a single MT5 function; it is not a data-pipeline, transport, or backend-mapping defect.

**Likely:**
- The defect is Saturday/Sunday UTC-bounded only. Weekday behavior for crypto is unaffected.
- The normalized symbol format already in use by `SessionManager` is sufficient to implement a crypto detection helper without schema changes.

**Unconfirmed:**
- Whether the broker/MT5 platform itself closes crypto during weekend windows. If the broker closes crypto, the current classification is correct behavior and the patch must not be applied.
- Whether the EA payload already encodes a session field that could be inspected to detect broker-side closure independently of `SessionManager`.
- Whether any frontend layer intentionally re-maps `CLOSED` to `offline` for crypto as a deliberate UX choice.

**Hard pre-condition:** Broker weekend crypto behavior must be verified by a human before any MT5 code is changed. If broker closes crypto, halt; do not patch.

---

## 2. Implementation contract

**File 1: `mt5/SessionManager.mqh`**
- **Target:** `IsMarketOpenForSymbol()` function; add a new `IsCryptoSymbol()` helper, modeled on `IsEquityIndexSymbol()`.
- **Exact change:** Before the weekend-closure branch in `IsMarketOpenForSymbol()`, insert: if `IsCryptoSymbol(normalized)` return `true`. `IsCryptoSymbol()` must detect crypto by normalized symbol prefix or suffix (e.g., BTC, ETH, LTC, XRP) using the same normalization already applied before this call.
- **Guard rails:** Do not modify the weekend-closure path for FX or equity index symbols. Do not remove or alter the existing `IsEquityIndexSymbol()` branch. Do not change the function signature or return type. Crypto detection must use the normalized symbol, not the raw broker symbol.
- **Why in scope:** This is the single classification gate driving the entire downstream freshness/state chain. The minimum-surface fix is here.
- **Acceptance criterion:** On a simulated Saturday/Sunday UTC call: `IsMarketOpenForSymbol("BTCUSD", weekend_time)` returns `true`; `IsMarketOpenForSymbol("EURUSD", weekend_time)` returns `false`; `IsMarketOpenForSymbol("US500", weekend_time)` returns `false`.

---

**File 2: `mt5/FreshnessEngine.mqh`**
- **Target:** The block that evaluates `is_market_open` and emits `FRESHNESS_CLOSED`.
- **Exact change:** No code change. Inspection only. Verify no hardcoded weekend-closed path exists that bypasses `SessionManager`.
- **Guard rails:** Do not add asset-class branching here. Freshness state must remain fully derived from `SessionManager`.
- **Why in scope:** Inspection required to confirm no secondary emission path would re-introduce `FRESHNESS_CLOSED` for crypto after the `SessionManager` fix.
- **Acceptance criterion:** After `SessionManager` patch, `FreshnessEngine` does not emit `FRESHNESS_CLOSED` for crypto on a simulated weekend window.

---

**File 3: `mt5/MarketDataEngine.mqh`**
- **Target:** `OnPeriodic()` — the call site for `sessionManager.IsMarketOpenForSymbol()`.
- **Exact change:** No code change. Inspection only. Verify the normalized symbol is passed through unmodified and no local override or short-circuit precedes the call.
- **Guard rails:** Do not add symbol-type branching here.
- **Why in scope:** Confirms the call chain is intact and the `SessionManager` fix will propagate correctly.
- **Acceptance criterion:** `OnPeriodic()` passes the same normalized symbol to `SessionManager` that `IsCryptoSymbol()` will evaluate.

---

**File 4: `wordpress/smc-superfib-sniper/class-market-data-service.php`**
- **Target:** `store_tick_snapshot()` — the `CLOSED/DISCONNECTED → state='offline'` mapping.
- **Exact change:** No code change. Document explicitly that this mapping is correct and must not be altered. Once MT5 stops emitting `CLOSED` for crypto, the backend will naturally persist a non-offline state.
- **Guard rails:** Do not remove or soften `CLOSED → offline`. It is required for FX and equity index weekend behavior and is architecturally correct.
- **Why in scope:** Confirm no backend-side crypto carve-out is needed and that backend authority is preserved.
- **Acceptance criterion:** No backend code changes. Backend snapshot `state` for crypto shifts from `offline` to non-offline after MT5 fix, without any backend modification.

---

## 3. Patch sequence

1. **(Pre-condition, not a code change)** Obtain human confirmation that the broker keeps crypto tradeable on weekends. If broker closes crypto: halt, document, close the patch scope.
2. Read `mt5/FreshnessEngine.mqh` — inspect for any hardcoded weekend-close path. Record finding.
3. Read `mt5/MarketDataEngine.mqh` `OnPeriodic()` — confirm normalized symbol passthrough. Record finding.
4. Implement `IsCryptoSymbol(string normalized)` helper in `mt5/SessionManager.mqh`.
5. Patch `IsMarketOpenForSymbol()` to call `IsCryptoSymbol()` before the weekend-closure branch and return `true` for crypto.
6. Run MT5 simulation test: crypto weekend → open; FX weekend → closed; equity index weekend → closed.
7. Run `phase3_mt5_simulation_test.php` — confirm FX `CLOSED → offline` assertions still pass.
8. Verify backend snapshot `state` for a crypto symbol in a test environment reflects non-offline after the MT5 fix.
9. Update `.github/migration-status.md` to record the fix and close the Phase 3 crypto weekend observation task.

**Dependencies:**
- Steps 4–5 are blocked by step 1 (broker confirmation).
- Steps 6–8 depend on step 5.
- Step 9 depends on step 8.

**Sequencing risk:** If `IsCryptoSymbol()` uses a hardcoded symbol list, any broker-specific crypto symbol naming not on the list will remain misclassified. Prefer prefix/suffix detection if broker naming is consistent; otherwise the symbol list becomes a maintenance liability and must be documented as such.

---

## 4. Regression guards

**Checks to run after patching:**
- `phase3_mt5_simulation_test.php` — all existing `CLOSED → offline` assertions for FX instruments must pass without modification.
- MT5 simulation: equity index weekend behavior must remain `CLOSED`.
- MT5 simulation: crypto weekend must now return `is_market_open=true` and `FreshnessEngine` must not emit `FRESHNESS_CLOSED`.
- Backend snapshot `state` field for FX on weekend must remain `offline`.
- Backend snapshot `state` field for crypto after MT5 fix must not be `offline` (assuming broker confirms crypto is open).

**Existing protections that must still hold:**
- `CLOSED/DISCONNECTED → offline` backend mapping in `store_tick_snapshot()`.
- `FreshnessStateName()` enum-to-string mapping — must not be altered.
- Phase 1/3 weekend observation audit artifacts — must not be invalidated by the patch.

**Parity re-validation required:**
- MT5 freshness state output: crypto vs FX on simulated Saturday/Sunday UTC.
- Backend snapshot: `state`, `freshness`, `session` fields for crypto after MT5 fix.
- Dashboard live/offline display for a crypto symbol on a simulated weekend window.

**Required logging after patch:**
- MT5 EA must log the symbol-type classification result (`crypto` vs `non-crypto`) at the point of the `IsMarketOpenForSymbol()` call, visible in MT5 Experts log. This must be present in the final patch; absence is a regression guard failure.

---

## 5. Non-goals

- Do not implement a general asset-class scheduling framework (research report Path B).
- Do not modify holiday or special-session handling for any instrument.
- Do not change the `CLOSED/DISCONNECTED → offline` backend mapping.
- Do not touch Pine trading formulas.
- Do not alter dashboard state interpretation or signal gating logic.
- Do not extend the fix to commodity, bond, or index symbols.
- Do not implement broker-specific session configuration loading or dynamic schedule ingestion.
- Do not refactor `IsEquityIndexSymbol()` beyond using it as the pattern reference.
- Do not address the soakType/soakPurpose issue referenced in RUNTIME CONTEXT — that requires a separate research artifact and separate plan.

---

## 6. Risk assessment

**Worst-case failure if patched incorrectly:** A non-crypto symbol with a crypto-like name is classified as crypto and returns `is_market_open=true` on weekends when the broker has closed it. Signal engines receive a live state for a closed instrument. Stale candles are treated as fresh.

**User-visible failure mode:** Crypto symbols display as live on the dashboard during a weekend when the broker has actually closed the market. Signals generated against stale data may be acted upon.

**Backend authority risk:** If the broker closes crypto and the MT5 fix forces `is_market_open=true`, the backend persists a live state that contradicts the actual market. Freshness enforcement and stale-data gating are bypassed for that instrument. This is the highest-consequence failure path.

**Stale-state risk introduced by this patch:** None, provided broker confirmation is obtained before applying the fix. The patch does not alter transient storage, snapshot schema, or transport contracts.

**Human approval required before merge:** Yes. Broker weekend crypto behavior and asset-class session semantics must be confirmed by a human. This cannot be automated or inferred from the codebase alone.

---

## 7. Test requirements

**Add:**
- Unit test for `IsCryptoSymbol()` — must cover: known crypto prefixes/suffixes (positive cases), known FX pairs (negative cases), known equity indices (negative cases), edge cases (empty string, partial match, mixed-case).
- Integration test for `IsMarketOpenForSymbol()` with a simulated Saturday UTC timestamp: crypto symbol → `true`; FX symbol → `false`; equity index → `false`.

**Update:**
- `phase3_mt5_simulation_test.php` — add a crypto weekend case asserting `state != 'offline'` after the MT5 fix is applied. Existing FX `CLOSED → offline` cases must remain and pass.

**Must still pass:**
- All existing `CLOSED → offline` backend assertions for FX instruments.
- All Phase 1/3 weekend observation test fixtures.

**Manual checks:**
- Observe MT5 Experts log on a Saturday UTC simulation run. Confirm crypto symbol logs `session=open` and freshness is not `CLOSED`.
- Inspect backend snapshot table for a crypto symbol before and after patch on a simulated weekend window. Confirm `state` field change.

**Soak/replay:** Not required unless the broker confirms crypto was historically closed in logged data, in which case a replay of the affected weekend window is needed to validate that no live signals were generated against stale crypto candles.

---

## 8. Implementation handoff

**Branch naming:** `fix/crypto-weekend-session-classification`

**Commit grouping:**
- Commit 1: Add `IsCryptoSymbol()` helper to `mt5/SessionManager.mqh`
- Commit 2: Patch `IsMarketOpenForSymbol()` with crypto 24/7 open override before weekend-closure branch
- Commit 3: Add unit and integration tests for `IsCryptoSymbol()` and `IsMarketOpenForSymbol()`
- Commit 4: Update `phase3_mt5_simulation_test.php` with crypto weekend open case
- Commit 5: Update `.github/migration-status.md` — record fix, close Phase 3 crypto weekend observation task

**Required artifacts after implementation:**
- MT5 simulation test output log confirming crypto=open and FX=closed on a weekend UTC window
- Backend snapshot diff showing `state` field change for a crypto symbol after the MT5 fix
- Updated `reports/codex-review.json` with fix-applied status and broker confirmation record

**State transition:** `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
