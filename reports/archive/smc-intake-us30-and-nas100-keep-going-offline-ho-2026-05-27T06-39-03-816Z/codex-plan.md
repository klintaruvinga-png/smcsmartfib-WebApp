# SMC SuperFIB - Implementation Contract: US30 / NAS100 Recurring Offline

---

## 1. Issue validation

### Confirmed

**Alias map is correct and complete.**
`mt5/SymbolNormalizer.mqh` contains `AddAlias("US TECH 100", "NAS100")`, `AddAlias("WALL STREET 30", "US30")`, `AddAlias("WALL STREET", "US30")`, `AddAlias("NASDAQ", "NAS100")`, and `AddAlias("DOW30", "US30")`. Missing symbol support is not a factor.

**The multi-symbol freshness fix is present in the current repo.**
`mt5/SMC_MarketDataEA.mq5` `OnTimer()` (lines 281–289) already contains the loop over `g_symArray[]` that calls `SymbolInfoTick()` for every non-chart symbol. This fix matches the post-patch architecture documented in `phase-0-mt5-multisymbol-parity-2026-05-03.md`.

**The phase3 closeout offline observation was legitimate pre-market closure.**
`reports/phase3-closeout.md` and `RISK_REGISTER.md` RISK-04 both confirm the 04:17 UTC snapshot showed US30/NAS100 offline because US equity session does not open until 13:30 UTC. That snapshot was not a bug.

### Likely

**The recurring offline condition during market hours is caused by `SymbolInfoTick()` silently returning `false` for unsubscribed symbols.**
The phase-0 multisymbol parity audit records a CONDITIONAL PASS with one unchecked acceptance criterion: `[ ] All Symbols[] subscribed via SymbolSelect()`. In MQL5, `SymbolInfoTick()` returns `false` for any symbol not subscribed in the Market Watch. When it returns `false`, the freshness engine receives no tick update. Freshness ages past the DISCONNECTED threshold. The backend records `offline`. This matches the "keep going offline" pattern described in the issue exactly.

### Unconfirmed

- Whether the deployed MT5 binary was compiled from the current repo source (with the `OnTimer()` loop) or from a pre-patch build.
- Whether the user's 26-symbol runtime override is set via MT5 EA input parameters or an external config. The repo default `Symbols` input at line 29 of `SMC_MarketDataEA.mq5` is only `"EURUSD,GBPUSD,XAUUSD,USDJPY,GBPJPY,AUDUSD"`.

### Corrected root cause

The primary failure path is:

```
OnInit() completes without SymbolSelect() for non-chart symbols
  → OnTimer() calls SymbolInfoTick(g_symArray[i], tick) for US30 / NAS100
  → SymbolInfoTick() returns false (symbol not in Market Watch)
  → engine.OnTick() is never called for those symbols
  → freshness ages to DISCONNECTED
  → backend snapshot records offline
  → dashboard renders offline
```

This is a deployment gap left open by the conditional pass in the phase-0 audit, not a new regression.

---

## 2. Implementation contract

### File: `mt5/SMC_MarketDataEA.mq5`

**Function / section to modify:** `OnInit()` — the block immediately after the symbol resolution loop (`ResolveBrokerSymbol()`) where `g_symArray[]` and `g_symCount` are fully populated (approximately lines 174–192).

**Exact change required:**
After `g_symArray[]` is fully populated and before `engine.Init()` (or the first timer arm), insert a loop that calls `SymbolSelect(g_symArray[i], true)` for every index `i < g_symCount`. Log the result for each symbol using `Print()`. If `SymbolSelect()` returns `false`, emit a warning log entry and continue — do not return `INIT_FAILED`. The call must use the resolved canonical symbol name already stored in `g_symArray[i]`, not the raw broker alias.

Example structure (logic only — implementation agent writes the exact MQL5):

```
for i in 0..g_symCount-1:
    result = SymbolSelect(g_symArray[i], true)
    Print("[SymbolSelect] ", g_symArray[i], ": ", result ? "OK" : "WARN broker unavailable")
```

**Guard rails — must not change:**
- `ResolveBrokerSymbol()` logic and alias resolution chain.
- `g_symCount` counting or `g_symArray[]` population logic.
- The `OnTimer()` polling loop body — do not add `SymbolSelect()` calls there.
- The default `Symbols` input string value.
- `SymbolNormalizer.mqh` — no changes.
- `engine.OnPeriodic()` call site.

**Why this file is in scope:**
It is the sole location where symbol subscription state is set for the EA's Market Watch. The unchecked phase-0 acceptance criterion is in this file's `OnInit()` path.

**Acceptance criterion tied to the failure path:**
After EA restart, `SymbolInfoTick(g_symArray[i], tick)` returns `true` for US30 and NAS100 during a confirmed open equity session (after 13:30 UTC Monday–Friday). Backend shows both symbols as `live`. Dashboard renders both symbols with a live badge.

---

No other files require code changes. `SymbolNormalizer.mqh`, `class-market-data-service.php`, and the dashboard rendering layer are all correct.

---

## 3. Patch sequence

1. **Read `OnInit()` exactly.** Identify the precise line where the last `g_symArray[i]` assignment completes and `g_symCount` is final. This is the insertion point.
2. **Insert the `SymbolSelect()` loop** immediately after that line, before any `engine.Init()` call or timer arming.
3. **Add `Print()` diagnostic** for each symbol's select result — one line per symbol.
4. **Rebuild the EA** in MetaEditor from the patched source.
5. **Redeploy to the live MT5 terminal** with the user's runtime Symbols override intact. Do not change the runtime Symbols input.
6. **Monitor MT5 Journal** at EA startup for `[SymbolSelect]` log lines confirming OK or WARN for each symbol.

**Dependencies:**
- Step 2 depends on Step 1 (insertion point must be verified, not assumed).
- Steps 4–6 depend on Steps 1–3 (binary must be rebuilt before deploying).
- No database migration, no PHP change, no dashboard change.

**Sequencing risks:**
- `SymbolSelect()` must complete in `OnInit()` before the first `OnTimer()` fire. MQL5 guarantees `OnInit()` finishes before any timer event. No race risk if the call is placed in `OnInit()`.
- If EA is reattached without recompiling, the fix will not take effect. Rebuild is mandatory.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. EA `OnInit()` does not return `INIT_FAILED` — EA attaches and runs normally.
2. MT5 Journal shows `[SymbolSelect] EURUSD: OK`, `[SymbolSelect] XAUUSD: OK`, etc. for all FX and metal symbols — no regression in previously working symbols.
3. MT5 Journal shows `[SymbolSelect] US30: OK` and `[SymbolSelect] NAS100: OK` — confirmed subscribed.
4. Backend snapshot table contains rows for US30 and NAS100 with `status = 'live'` during an open equity session window (13:30–20:00 UTC Monday–Friday).
5. Dashboard renders live badge for US30 and NAS100 during confirmed open session.
6. US30 and NAS100 correctly show `offline` before 13:30 UTC — pre-market offline must still work.
7. BTCUSD, ETHUSD, SOLUSD remain `live` throughout the test window.

**Existing protections that must still hold:**
- `SymbolNormalizer.mqh` alias resolution — untouched.
- `CLOSED`/`DISCONNECTED` → `offline` mapping in `class-market-data-service.php` — untouched.
- Freshness threshold values in the engine — untouched.

**Parity re-validations required:**
- Re-run MT5 ↔ backend ↔ dashboard parity check for US30 and NAS100 during a confirmed open session. Reference: `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md`. All previously unchecked acceptance criteria must now be checked.

**Logging / diagnostics that must exist after patch:**
- EA startup Expert log must contain one `[SymbolSelect]` line per symbol in `g_symArray[]`.

---

## 5. Non-goals

**Out of scope:**
- Any change to `mt5/SymbolNormalizer.mqh`.
- Any change to `wordpress/smc-superfib-sniper/class-market-data-service.php`.
- Any change to dashboard JS rendering logic.
- Expanding the repo's default `Symbols` input string — the runtime override is the user's deployment responsibility.
- Adding new alias entries for symbols not mentioned in the issue.
- Changing freshness threshold values.
- Modifying `OnTick()`, `engine.OnPeriodic()`, or `ResolveBrokerSymbol()`.
- Validating USDZAR, CHFJPY, AUDCAD, or other secondary symbols — they are not in the reported failure set.

**Attractive but unsafe follow-on changes to avoid in this patch:**
- Do not add `SymbolSelect()` calls inside `OnTimer()` — creates per-timer overhead and may interfere with tick polling timing.
- Do not replace `SymbolInfoTick()` with chart-based polling or `CopyRates()` — this would break the non-chart symbol freshness architecture.
- Do not upgrade the EA's bundled default `Symbols` string to match the user's full 26-symbol deployed list — runtime input override is the correct mechanism and the repo default is intentionally minimal.
- Do not widen scope to a freshness-threshold audit, session-schedule refactor, or backend state-machine review.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

- `SymbolSelect()` loop placed after `engine.Init()` or inside `OnTimer()` instead of `OnInit()`: the first timer fire may precede subscription, leaving some symbols unsubscribed on the first poll cycle. Recovery: EA restart. No data loss.
- `SymbolSelect()` called with the raw broker alias string (e.g., `"US Tech 100"`) instead of the resolved canonical string in `g_symArray[i]`: select fails silently, no improvement. Guard: call only after `ResolveBrokerSymbol()` has populated `g_symArray[]` with canonical names.

**User-visible failure mode:**
US30 and NAS100 continue rendering offline during market hours. No data corruption, no historical snapshot loss. Operational impact only — operators cannot trust live index status.

**Backend authority and stale-state risks:**
Low. Backend is not modified. MT5 remains the freshness authority. If `SymbolInfoTick()` still fails post-patch for any reason, backend correctly retains the symbol as `offline` — no false-live risk is introduced.

**Whether human approval should be required before merge:**
Yes. The patch requires rebuilding and redeploying the live MT5 EA binary. A human operator must:
1. Verify MT5 Journal log shows `[SymbolSelect] US30: OK` and `[SymbolSelect] NAS100: OK` after restart.
2. Observe the dashboard during an open equity session to confirm live state.
3. Confirm pre-market offline behavior is preserved.

Merge should not be closed as resolved until the soak observation is complete.

---

## 7. Test requirements

**Tests to add:**

- **Phase-0 parity audit update:** In `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md`, the criterion `[ ] All Symbols[] subscribed via SymbolSelect()` is the direct test target. After patching and live observation, this must be marked `[x]` with a date and log evidence.
- **Soak observation record:** A new artifact (see §8) must document: EA startup log excerpt showing `[SymbolSelect]` lines, backend SQL snapshot query results confirming US30/NAS100 `live` rows during open session, and dashboard screenshot.

**Existing tests and checks that must still pass:**

- `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md` — all previously passing (checked) acceptance criteria must remain passing.
- `.github/migration/audits/phase-0-mt5-backend-dashboard-parity-2026-05-25.md` — full-symbol parity must hold for all symbols, not just index symbols.
- Phase 3 soak closeout template — offline state before 13:30 UTC must still be correctly attributed to session closure, not treated as a bug.

**Live-environment verification required:**

- Minimum soak window: one full equity trading session (13:30–20:00 UTC, Monday–Friday) with the patched EA running.
- Backend SQL: query `smc_price_snapshots` (or equivalent) for US30 and NAS100 rows with `status = 'live'` and `updated_at` within the open session window.
- Dashboard: live screenshot confirming live badge for US30 and NAS100.

---

## 8. Implementation handoff

**Branch naming:**
`fix/us30-nas100-symbolselect-ontinit`

**Suggested commit grouping:**

- **Commit 1:** `fix(mt5): add SymbolSelect for all symbols in OnInit to prevent SymbolInfoTick false returns`
  — contains only the `SMC_MarketDataEA.mq5` `OnInit()` change and `Print()` diagnostics.
- **Commit 2:** `docs(audit): mark SymbolSelect acceptance criterion PASS in phase-0 parity audit`
  — updates `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md` checkbox and adds soak evidence.
- **Commit 3:** `chore(risk): close RISK-04 with SymbolSelect fix reference`
  — updates `.github/migration/RISK_REGISTER.md` RISK-04 resolution note to cite the `SymbolSelect()` fix as the permanent close mechanism.

**Required artifacts to generate after implementation:**

- `reports/fix-us30-nas100-symbolselect.md` containing:
  - EA restart log excerpt showing `[SymbolSelect]` result for every symbol in `g_symArray[]`.
  - Backend SQL snapshot query output showing US30/NAS100 `live` rows during open session.
  - Dashboard screenshot of live badge for US30 and NAS100.
  - Confirmation that pre-market offline state is preserved.
- Updated `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md` with all acceptance criteria checked.

**State transition required after plan handoff:**
`READY_FOR_IMPLEMENTATION` with `editing_locked=false`
