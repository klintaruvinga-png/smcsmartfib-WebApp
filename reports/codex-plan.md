# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

**Reported root cause:** Crypto symbols are classified as weekend-closed by the shared MT5 `SessionManager`, causing `IsMarketOpenForSymbol()` to return `false` for crypto on Saturdays and Sundays. This propagates through `FreshnessEngine` as `FRESHNESS_CLOSED`, the backend maps `CLOSED` to `state='offline'`, and the dashboard renders crypto instruments as offline even when live candles are arriving.

**Verdict: Confirmed.**

Reasoning:
- `SessionManager.mqh` special-cases equity indices via `IsEquityIndexSymbol()` but has no equivalent for crypto. The research report explicitly confirms this gap.
- The string `CLOSED` is produced by `FreshnessStateName()` when `is_market_open=false`, and `class-market-data-service.php::store_tick_snapshot()` maps both `CLOSED` and `DISCONNECTED` to `state='offline'`. This is the exact propagation path.
- `.github/migration-status.md` documents that crypto-fresh on weekends is *expected* behavior, confirming the current outcome is a defect, not intentional design.

| Claim | Status | Basis |
|---|---|---|
| `SessionManager` applies weekend closure to all non-equity-index symbols | **Confirmed** | `IsEquityIndexSymbol()` is the only special-case branch per research report |
| `FreshnessEngine` emits `FRESHNESS_CLOSED` when `is_market_open=false` | **Confirmed** | Explicit in research §2 |
| Backend maps `CLOSED` → `offline` | **Confirmed** | `store_tick_snapshot()` mapping confirmed |
| Crypto should be 24/7 open on this deployment | **Confirmed** | `migration-status.md` weekend expectation |
| Broker/MT5 platform independently closes crypto on weekends | **Unconfirmed** | Open unknown in research §8; treat as out-of-scope for this patch |
| Dashboard derives state from transient freshness vs. snapshot rows | **Unconfirmed** | Not resolved by research; backend path is confirmed sufficient for Path A |

**Corrected scope:** The defect is fully contained within `mt5/SessionManager.mqh`. The downstream chain (FreshnessEngine → backend → dashboard) is operating correctly against the signal it receives. The signal is wrong. Fix the signal at its source.

**Rejected hypotheses:**
- Path B (broad asset-class abstraction) — rejected. No evidence the defect extends beyond the crypto weekend-open case. Widening scope to FreshnessEngine, backend state mapping, or dashboard consumers is unsupported.
- Backend-side suppression of `CLOSED→offline` for crypto — rejected. Backend mapping is architecturally correct and must not be weakened. MT5 is the authority on market state.

---

## 2. Implementation contract

### File 1: `mt5/SessionManager.mqh`

**Why in scope:** The only confirmed defect location. This is where `IsMarketOpenForSymbol()` incorrectly returns `false` for crypto on weekends.

**Function/section to modify:**
- Add: `bool IsCryptoSymbol(string normalized_symbol)` — a new helper, analogous in structure to `IsEquityIndexSymbol()`.
- Modify: `IsMarketOpenForSymbol(string normalized, datetime now)` — add a crypto early-return guard before any weekend/session check block executes.

**Exact change required:**

1. `IsCryptoSymbol()` must return `true` if the normalized symbol matches the known crypto prefix or suffix patterns used in this broker deployment. The function must check against the same normalized symbol string that is used throughout `MarketDataEngine` and `SessionManager` (i.e., apply the same normalization that `IsEquityIndexSymbol()` receives). Initial symbol set must include at minimum: `BTC`, `ETH`, `LTC`, `XRP`, `BNB`, `SOL`, `ADA`, `DOGE` as prefix matches. The list must be defined as a constant array at file scope so it can be audited and extended without touching logic.

2. `IsMarketOpenForSymbol()` must call `IsCryptoSymbol(normalized)` as the first conditional check. If `true`, return `true` immediately and skip all session/weekend logic. This matches the structural pattern already used for `IsEquityIndexSymbol()`.

**Guard rails — must not change:**
- The weekend closure logic for FX symbols must be untouched.
- The `IsEquityIndexSymbol()` branch and its behavior must be untouched.
- The function signature of `IsMarketOpenForSymbol()` must not change.
- No new parameters may be added to any public function in this file.
- The normalization step applied before calling `IsMarketOpenForSymbol()` in `MarketDataEngine` must not be modified.

**Acceptance criterion:** After patch, `IsMarketOpenForSymbol()` returns `true` for all crypto-normalized symbols on a Saturday UTC datetime input. It continues to return `false` for an FX symbol (e.g., `EURUSD`) on the same Saturday UTC input.

---

### File 2: `mt5/MarketDataEngine.mqh`

**Status: No change required.**

`MarketDataEngine` calls `sessionManager.IsMarketOpenForSymbol()` without modification. The fix in `SessionManager` propagates correctly. Touching `MarketDataEngine` would widen scope without benefit.

---

### File 3: `mt5/FreshnessEngine.mqh`

**Status: No change required.**

`FreshnessEngine` responds correctly to the `is_market_open` signal it receives. Once `SessionManager` emits `true` for crypto, `FreshnessEngine` will not emit `FRESHNESS_CLOSED`. No change needed.

---

### File 4: `wordpress/smc-superfib-sniper/class-market-data-service.php`

**Status: No change required.**

The `CLOSED → offline` mapping in `store_tick_snapshot()` is architecturally correct and must be preserved. The problem is not the mapping; the problem is that the wrong state is reaching it. Do not modify backend state mapping logic.

---

### File 5: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Status: No change required.**

No evidence this file is in the defect path.

---

## 3. Patch sequence

1. **`mt5/SessionManager.mqh` — add `IsCryptoSymbol()`**
   Define the static crypto symbol list constant and implement the function. No dependencies.

2. **`mt5/SessionManager.mqh` — modify `IsMarketOpenForSymbol()`**
   Insert the `IsCryptoSymbol()` early-return guard. Depends on step 1 being complete in the same file.

**Sequencing risks:**
- Both changes are in a single file. They must be applied atomically in one commit to avoid a broken intermediate state where `IsCryptoSymbol()` is defined but not called, or called but undefined.
- No database migrations, cache invalidations, or transient flushes are required. WordPress transients will self-correct on the next `store_tick_snapshot()` write after the EA reloads with the patched binary.
- MT5 EA must be recompiled and reloaded in the terminal after the MQH change. The implementation agent must not assume the fix is live until the EA binary is rebuilt.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. Compile the MT5 EA with zero errors and zero warnings in MetaEditor before committing.
2. Unit-verify `IsCryptoSymbol()` by constructing a test script that asserts:
   - `IsCryptoSymbol("BTCUSD")` → `true`
   - `IsCryptoSymbol("ETHUSD")` → `true`
   - `IsCryptoSymbol("EURUSD")` → `false`
   - `IsCryptoSymbol("US500")` → `false`
3. Verify `IsMarketOpenForSymbol("BTCUSD", <Saturday UTC>)` returns `true`.
4. Verify `IsMarketOpenForSymbol("EURUSD", <Saturday UTC>)` returns `false` (FX weekend behavior unchanged).
5. Verify `IsMarketOpenForSymbol("US500", <Saturday UTC>)` returns the same value as before the patch (equity index behavior unchanged).

**Existing protections that must still hold:**
- Backend `CLOSED → offline` mapping in `store_tick_snapshot()` must remain intact.
- `FreshnessEngine` `FRESHNESS_CLOSED` emission when `is_market_open=false` must remain intact.
- Phase 1/3 weekend regression audit notes in `.github/migration-status.md` must remain consistent with post-patch behavior for FX instruments.
- Any existing `phase3_mt5_simulation_test.php` assertions for `CLOSED → offline` must continue to pass for non-crypto instruments.

**Parity re-validations required:**
- EA → Backend freshness contract: after EA reload, verify that a crypto symbol's freshness field in the next tick payload reads as `FRESH` or `LIVE` (not `CLOSED`) during a weekend window.
- Backend → Dashboard: verify that the dashboard renders the crypto instrument as live/online, not offline, after the transient is refreshed.

**Logging/diagnostics to confirm after patch:**
- The EA log must show `IsMarketOpenForSymbol` returning `true` for a crypto symbol during a weekend tick cycle.
- The WordPress debug log must not show a `CLOSED` freshness value for any crypto symbol in the next `store_tick_snapshot()` write after EA reload.

---

## 5. Non-goals

**Out of scope for this patch:**
- Modifying FX weekend closure behavior.
- Modifying equity index session handling.
- Adding holiday/schedule abstraction (Path B).
- Changing the backend `CLOSED → offline` mapping for any asset class.
- Modifying dashboard state rendering or signal-gating logic.
- Modifying `FreshnessEngine` state names or enum values.
- Changing any REST API fields, snapshot schema, or transient key names.
- Adding broker-aware session scheduling (e.g., broker-specific weekend open/close times for crypto).
- Addressing any unrelated Phase 3 readiness items.

**Attractive but unsafe follow-ons to avoid in this patch:**
- Generalizing `IsCryptoSymbol()` into a full asset-class classifier — premature abstraction with no current requirement.
- Adding a configurable crypto symbol list to WordPress admin — scope creep with no confirmed requirement.
- Modifying how the dashboard interprets `offline` state for any instrument — not the defect location.
- Flushing or invalidating existing WordPress transients as part of the patch — risk of disrupting live state for other instruments.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
If `IsCryptoSymbol()` matches too broadly (e.g., matches a non-crypto symbol with a crypto-like prefix), those instruments will never report as market-closed, masking genuine closure states from the dashboard and downstream signal engines.

**User-visible failure mode:**
Crypto instruments appear permanently live even if the EA is disconnected or the broker has genuinely halted the symbol — hiding a real outage behind a false-open state.

**Backend authority / stale-state risks:**
The fix is MT5-side only. If the EA is not recompiled and reloaded, the transient in WordPress will continue to carry `CLOSED` state. The patch has no effect until the EA binary is rebuilt and running.

**Whether human approval should be required before merge:**
**Yes.** The crypto symbol list embedded in `IsCryptoSymbol()` must be reviewed against the actual broker symbol catalog before merge. An incorrect or incomplete symbol list is a live risk. A human with access to the MT5 broker symbol list must confirm the list before the PR is merged.

---

## 7. Test requirements

**Tests to add:**

1. **MT5-side (MQL5 script or simulation test):**
   - Target: `SessionManager::IsCryptoSymbol()` and `SessionManager::IsMarketOpenForSymbol()`.
   - Assert: crypto symbols return `true` on Saturday/Sunday UTC. Assert: FX and equity index symbols return unchanged values on Saturday/Sunday UTC.

2. **Backend integration test (PHP):**
   - Target: `class-market-data-service.php::store_tick_snapshot()` freshness mapping path.
   - Assert: a tick payload carrying `freshness=FRESH` for a crypto symbol stores `state='live'` (or equivalent non-offline state), not `state='offline'`.
   - This test must use an actual `FRESH` payload — do not modify the CLOSED→offline assertion path.

**Existing tests that must still pass:**
- `phase3_mt5_simulation_test.php` assertions for `CLOSED → offline` for non-crypto instruments.
- Any backend freshness/session regression tests referenced in `.github/migration-status.md`.
- Phase 1/3 weekend observation assertions for FX stale behavior.

**Soak / live-environment verification:**
- The patch must be observed live during a weekend window (Saturday or Sunday UTC) with the EA running against the broker.
- Confirm: at least one crypto symbol shows live/online in the dashboard while at least one FX symbol shows closed/offline in the same session.
- This is a **mandatory pre-merge verification**, not optional.

---

## 8. Implementation handoff

**Branch naming recommendation:**
`codex/fix-crypto-weekend-session-classification`

**Suggested commit grouping:**
- Commit 1: `feat(mt5): add IsCryptoSymbol helper to SessionManager` — adds the constant list and the function only.
- Commit 2: `fix(mt5): exempt crypto symbols from weekend session closure in IsMarketOpenForSymbol` — inserts the early-return guard only.

Do not combine into a single commit. Keeping them separate makes the intent auditable and allows rollback of the guard without losing the helper.

**Required reports or artifacts to generate after implementation:**
- Updated `reports/codex-review.json` after Codex review of the PR.
- Weekend soak observation log (can be a comment on the PR) confirming live/offline parity during a Saturday or Sunday UTC window.
- Confirmation that `phase3_mt5_simulation_test.php` passes after patch.

**State transition:**

`READY_FOR_IMPLEMENTATION` | `editing_locked=false`
