# SMC SuperFIB — Hardened Implementation Contract

**Output target:** `reports/codex-plan.md`
**Issue:** Post-weekend watchlist shows only crypto; All Symbols / Watchlist toggle appears broken
**Input artifact:** `reports/copilot-research.md`

---

## 1. Issue validation

### Prong 1 — Post-weekend watchlist shows only crypto

**Confirmed**

The research provides two convergent evidence tiers:

**Frontend (confirmed code):** `src/routes/signals.tsx` computes `uniqueSignals` via `watchlistSet.has(signal.symbol)`. If the backend emits no candidates for non-crypto symbols, the watchlist view correctly shows only crypto. The frontend is not the defect origin; it faithfully renders the backend payload.

**MT5 / Backend (confirmed code + migration doc):** `class-market-data-service.php` maps `FRESHNESS_CLOSED` and `DISCONNECTED` to `state='offline'`. The WordPress transient store persists this offline state. `.github/migration-status.md` confirms the expected contract: FX stale on weekend is expected; crypto fresh on weekend is expected. On Monday market open, if the MT5 EA has not yet emitted a post-open freshness update, the transient continues to hold the weekend-CLOSED state for FX and equity index symbols. The signal engine never receives live candidates for those symbols. The frontend watchlist filter has nothing to show.

**Confirmed root cause:** MT5 `SessionManager.IsMarketOpenForSymbol()` has no post-weekend re-activation path. Non-crypto symbols transition to CLOSED at weekend open and do not re-activate until the EA emits a fresh tick. The WordPress transient cache holds the CLOSED state through Monday open, gating all downstream signal emission for those instruments.

---

**Prong 2 — Toggle between All Symbols / Watchlist Only appears broken**

**Likely, not independently confirmed as a standalone UI defect**

If the backend emits signals only for crypto post-weekend, "All Symbols" and "Watchlist Only" both resolve to the same crypto-only set. The toggle is functionally correct — it is operating on an absent dataset, not failing. This means Prong 2 is likely a symptom of Prong 1, not an independent defect.

An independent UI toggle bug would reproduce on normal weekday sessions. No evidence of that is present in the research.

**Secondary hypothesis (Likely, not Confirmed):** `signal.symbol` format mismatch (casing, suffix variants such as `.r` or market code appended) causes `watchlistSet.has(signal.symbol)` to return false even when the backend emits non-crypto signals. This would make the toggle appear broken even after Prong 1 is resolved. It cannot be confirmed without API payload capture.

---

**Rejected:** The normalization mismatch is not the primary root cause. If it were, the issue would be session-agnostic (fail every day), not post-weekend-specific. It is treated as a compounding risk to harden against, not the origin defect.

**Discrepancy — Research Section 3:** Section 3 of the research report describes crypto symbols being classified as weekend-closed by MT5. This is the inverse of the reported symptom (crypto IS showing; non-crypto is NOT showing). Section 3 either describes a historically distinct incident or was appended from a different investigation. **Do not act on Section 3's MT5 crypto-classification fix in this patch.** It contradicts the reported symptom and widens scope without valid grounding.

**Discrepancy — Soak Type section:** The research report includes an entire Soak Type / soakPurpose research section. This is an unrelated issue (admin baseline form, Phase 3 evidence storage). It has no bearing on the watchlist / signal gate defect. Ignored entirely.

---

## 2. Implementation contract

### File 1: `mt5/SessionManager.mqh`

- **Target:** `IsMarketOpenForSymbol()` function (or the weekend-hours gate it calls)
- **Change required:** Add a post-weekend reopen condition. When server time is past the weekend close threshold for the symbol's asset class (FX: Sunday ≥ 21:00 UTC; equity index: Sunday ≥ 21:00 UTC or Monday 00:00 exchange-specific), return `true` (market open) instead of persisting the weekend-CLOSED return value. Determine asset class from symbol name (known FX major pairs, known index names) using the existing symbol classification already present in the EA codebase. Do not introduce new asset-class abstraction tables.
- **Guard rails:**
  - Must not alter `IsMarketOpenForSymbol()` behavior during mid-weekend (Saturday 00:00–Sunday 20:59 UTC) for FX or equity index — must still return false
  - Crypto 24/7 path must not be touched
  - Do not add new asset-class enumerations, schedule tables, or configuration files
  - Do not change the function signature or callers
- **Why in scope:** This is the origin of the incorrect CLOSED emission that persists in the WordPress transient store post-weekend
- **Acceptance criterion:** Simulated Monday 00:01 UTC → `IsMarketOpenForSymbol("EURUSD")` returns `true`; simulated Saturday 12:00 UTC → same call returns `false`; simulated Saturday 12:00 UTC → `IsMarketOpenForSymbol("BTCUSD")` returns `true` (unchanged)

---

### File 2: `wordpress/smc-superfib-sniper/class-market-data-service.php`

- **Target:** `store_tick_snapshot()` freshness-to-state mapping and `get_price_snapshot()` transient read path
- **Change required:** In `get_price_snapshot()`, when the stored transient state is `offline` (derived from CLOSED) and the current broker server time indicates the symbol's market should now be open (use the same asset-class / trading-hours check used by the EA, not PHP wall clock), return `state='stale'` rather than `state='offline'`. Add an `error_log()` call when this override fires so it is observable. Do not alter what `store_tick_snapshot()` writes — only the read interpretation when stale CLOSED state persists past market open.
- **Guard rails:**
  - Must not change `DISCONNECTED → offline` mapping — only the stale `CLOSED` path after market open
  - Must use broker server time (from MT5 EA payload timestamp), not `time()` PHP wall clock, to avoid clock divergence errors
  - Must not introduce frontend as a source of session truth
  - Must not alter the transient TTL or eviction logic
  - Must not widen to new asset-class abstraction beyond a narrow symbol-name check
- **Why in scope:** WordPress transient cache can hold stale CLOSED state for minutes after the MT5 EA re-opens. Without this guard, even a correctly patched EA can leave the dashboard showing offline state until the next full tick cycle.
- **Acceptance criterion:** `get_price_snapshot("EURUSD")` returns `state='stale'` (not `'offline'`) when the stored transient was written with CLOSED before Sunday 21:00 UTC and the EA payload timestamp is now Monday 00:05 UTC

---

### File 3: `src/hooks/useSniperData.ts`

- **Target:** `normalizeWatchlist()` function and the `watchlistSet.has(signal.symbol)` comparison call site
- **Change required:** Apply a defensive normalization to `signal.symbol` at the point of the `has()` comparison: uppercase, strip known broker suffixes (`.r`, `.m`, `.pro`), strip appended market codes (e.g., trailing `+`, `-ECN`). The same normalization must already be applied when building `watchlistSet` entries. This normalization is **for local comparison only** — it must not alter what is sent to `postWatchlistAdd` / `postWatchlistRemove` or any API call.
- **Guard rails:**
  - Must not change canonical watchlist storage format
  - Must not alter `postWatchlistAdd` / `postWatchlistRemove` request payloads
  - Must not change `usePollingQueryState` gating logic
  - Must not make frontend the authority on symbol format — normalization is a comparison convenience only
  - The normalization strip list (suffixes) must be hardcoded to known broker variants documented in the codebase; do not make it configurable in this patch
- **Why in scope:** If broker suffix variants cause `watchlistSet.has()` to miss matches even after Prong 1 is resolved, the toggle will appear broken on real trading sessions — not just post-weekend. Defensive hardening closes this gap.
- **Acceptance criterion:** `watchlistSet.has("EURUSD.r")` returns `true` when watchlist contains `"EURUSD"` after normalization is applied to both sides

---

### File 4: `src/routes/signals.tsx`

- **Target:** `uniqueSignals` computation block and `watchlistOnly` toggle
- **Change required:** Add development-mode diagnostic logging (wrapped in `if (import.meta.env.DEV)`) that logs on each render: (a) `watchlistSet.size`, (b) total signal count before filter, (c) signal count after filter, (d) up to 5 sample `signal.symbol` values that failed the `has()` check. No behavior change.
- **Guard rails:**
  - Must not change toggle logic
  - Must not add UI state that bypasses the backend-driven filter
  - Log must be gated by `import.meta.env.DEV` — zero output in production build
  - Must not widen render path or introduce new state
- **Why in scope:** Without this diagnostic, distinguishing "no backend candidates" from "normalization mismatch" during live troubleshooting requires network tab inspection on every incident. The log makes the distinction immediate.
- **Acceptance criterion:** In development build, browser console shows watchlist set size and pre/post filter counts on each signals render; production build emits no console output

---

## 3. Patch sequence

1. **`mt5/SessionManager.mqh`** — foundational; all downstream fixes depend on the EA emitting correct post-weekend state. Deploy first.
2. **`class-market-data-service.php`** — backend transient guard; deploy together with the EA update in the same release window. Deploying this without the EA fix provides no benefit; deploying the EA fix without this guard still risks transient lag.
3. **`src/hooks/useSniperData.ts`** — normalization hardening; independent of MT5/backend but must be applied in the same patch to close the compounding risk before the first post-patch Monday open.
4. **`src/routes/signals.tsx`** — diagnostic instrumentation; no behavioral change, can be applied in any order.

**Dependencies:**
- Steps 1 and 2 must be deployed atomically (MT5 EA + WordPress PHP) and in the same maintenance window
- After deploying steps 1 and 2, flush all WordPress transients for freshness state to prevent stale CLOSED entries surviving the deploy
- Steps 3 and 4 are frontend-only and can be deployed independently of the backend pair

**Sequencing risks:**
- MT5 EA deployment requires the broker/MT5 terminal to be active; schedule during non-critical trading hours (not during active FX session)
- WordPress transient flush after deploy — if skipped, stale CLOSED transients from before the patch remain until natural TTL expiry; patch benefit delayed until next full tick cycle
- No database migration required; transient store is ephemeral

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. Run `phase3_mt5_simulation_test.php` — all existing `CLOSED → offline` assertions must pass for mid-weekend FX simulation timestamps
2. Simulate `IsMarketOpenForSymbol("EURUSD")` at Saturday 12:00 UTC → must return `false`
3. Simulate `IsMarketOpenForSymbol("EURUSD")` at Monday 00:01 UTC → must return `true`
4. Simulate `IsMarketOpenForSymbol("BTCUSD")` at Saturday 12:00 UTC → must return `true` (crypto 24/7 unchanged)
5. Simulate `get_price_snapshot("EURUSD")` with a pre-weekend CLOSED transient and a Monday EA payload timestamp → must return `state='stale'`, not `state='offline'`
6. Simulate `get_price_snapshot("EURUSD")` with DISCONNECTED state → must still return `state='offline'` (DISCONNECTED guard unchanged)
7. Verify `watchlistSet.has("EURUSD.r")` returns `true` when watchlist contains `"EURUSD"` (normalization unit test)
8. Verify production build of `signals.tsx` emits no console output (tree-shaking of `import.meta.env.DEV` block)

**Existing protections that must still hold:**
- `DISCONNECTED → offline` mapping in `class-market-data-service.php` — unchanged
- `CLOSED → offline` for mid-weekend timestamps — unchanged
- `usePollingQueryState` `backendReady` gating — must not be altered
- `postWatchlistAdd` / `postWatchlistRemove` API payloads — must be byte-identical to pre-patch
- `baselineCaptureLocked` in admin.tsx — not in scope; must not be touched

**Parity re-validations required:**
- MT5 EA freshness state → WordPress transient → `get_price_snapshot()` → Dashboard signal gate: full parity pass on Monday open simulation after deploy
- Pine signal source not affected (Pine uses its own symbol resolution); no Pine parity check required for this patch

**Logging / diagnostics that must exist after patch:**
- `error_log()` (or `do_action()`) in `class-market-data-service.php` when the stale-CLOSED override fires — must be present and observable in WordPress debug log
- Development-mode filter diagnostic in `signals.tsx` — must appear in browser console in dev build

---

## 5. Non-goals

**Out of scope for this patch:**
- Soak type / soakPurpose UI improvements (separate issue, separate research section, separate contract)
- Backend `soak_template` schema field addition (Phase 4+ item, unrelated)
- Full asset-class schedule abstraction across `SessionManager`, `FreshnessEngine`, and backend (Path B — deferred)
- MT5 crypto weekend-closed fix described in Research Section 3 — contradicts reported symptom; excluded without independent evidence of a separate crypto-closed defect
- Engine scheduling changes beyond session reopen timing
- New REST endpoints or API contract changes
- Replacing or restructuring the WordPress transient freshness store
- Dashboard UI redesign of the watchlist display

**Attractive but unsafe follow-ons to avoid in this patch:**
- Forcing the frontend to display "assumed live" symbols before backend confirms — this bypasses stale-data protections that are a core Phase 0 requirement
- Adding a "force refresh" button that bypasses polling gates — masks engine failures rather than fixing them
- Widening symbol normalization to affect API request payloads — breaks the backend symbol contract
- Changing the transient TTL to shorten cache lag — architectural change that could cause excessive MT5 polling under normal conditions

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

`IsMarketOpenForSymbol()` reopen logic fires for instruments whose markets are actually closed (e.g., equity index outside exchange hours, FX during a bank holiday). FreshnessEngine emits FRESH for closed instruments. Backend marks live. Signal engine emits candidates for non-tradable instruments. User receives and potentially acts on false live signals for closed markets.

**User-visible failure mode:**

User sees FX or equity index signals appearing at times when those markets are verifiably closed (post-Friday-close, bank holiday). This is a high-credibility harm to signal integrity — the core value proposition of the product.

**Backend authority / stale-state risks:**
- The transient-read override in `class-market-data-service.php` introduces a time-based state override. If the PHP server clock and the MT5 broker server clock diverge, the override can fire at the wrong time. The broker server time from the EA payload timestamp must be used as the reference — not `time()`.
- If the normalization strip list in `useSniperData.ts` is not accurate to the broker's actual suffix conventions, it may produce false-positive matches (treating a genuinely different instrument as the same watchlist entry).

**Human approval required before merge:** YES

MT5 session reopen logic directly affects live signal emission. Backend transient override introduces time-based state inference. Both require review and sign-off by the backend/MT5 system owner before merge. The normalization change must also be verified against a live `/sniper/v1/live-signals` payload captured post-market-open to confirm actual `signal.symbol` formats before shipping.

---

## 7. Test requirements

**Tests to add or update:**

1. `mt5/SessionManager_test.mq5` (add or update): test `IsMarketOpenForSymbol()` with simulated server times:
   - Saturday 12:00 UTC: `EURUSD` → `false`, `BTCUSD` → `true`
   - Sunday 20:59 UTC: `EURUSD` → `false`
   - Sunday 21:01 UTC: `EURUSD` → `true`
   - Monday 09:00 UTC: `EURUSD` → `true`, `BTCUSD` → `true`
   - Friday 21:01 UTC (FX close): `EURUSD` → `false` (must still gate correctly)

2. `phase3_mt5_simulation_test.php` (update): add assertion that a CLOSED transient written before Sunday 21:00 UTC does not return `state='offline'` when queried with a Monday 00:01 UTC EA payload timestamp. Existing mid-weekend CLOSED assertions must remain and pass.

3. `src/hooks/useSniperData.test.ts` (add): test `normalizeWatchlist()` comparison logic:
   - `"EURUSD.r"` matches watchlist entry `"EURUSD"` after normalization
   - `"eurusd"` matches `"EURUSD"` after normalization
   - `"XAUUSD+"`matches `"XAUUSD"` after normalization
   - `"GBPUSD"` does not match `"EURUSD"` after normalization (negative case)

4. `src/routes/signals.test.tsx` (add): test that `watchlistOnly` toggle correctly filters signals when `signal.symbol` and watchlist entries differ only in known suffix variants

**Existing tests that must still pass:**
- `phase3_mt5_simulation_test.php` — all existing CLOSED/DISCONNECTED → offline assertions
- `src/routes/-admin.test.tsx` — all 15 existing soak/admin tests (unrelated, must be clean)
- Full vitest suite on frontend

**Soak / live-environment verification required:**

Manual verification on the first Monday after deploy (2026-06-01 at 22:00 UTC Sunday FX open): confirm non-crypto instruments (minimum: one FX major, one equity index) appear in the watchlist view within 5 minutes of FX market open. Manual toggle test with non-crypto signals present: confirm "All Symbols" count exceeds "Watchlist Only" count (proves toggle is functional when data is correct). Log and preserve the pre/post filter counts from the development diagnostic for the incident record.

---

## 8. Implementation handoff

**Branch naming:** `fix/post-weekend-watchlist-signal-gate`

**Suggested commit grouping:**
1. `fix(mt5): add post-weekend session reopen logic in IsMarketOpenForSymbol` — MT5 change only
2. `fix(backend): guard stale CLOSED transient on market reopen in class-market-data-service` — PHP change only; include transient flush instruction in commit body
3. `fix(frontend): normalize signal.symbol comparison in watchlist filter` — `useSniperData.ts` change only
4. `chore(diag): add dev-mode watchlist filter diagnostics in signals.tsx` — diagnostic instrumentation, no behavioral change

**Required reports or artifacts to generate after implementation:**
- `reports/codex-review.json` — populated by pipeline watcher on PR open
- Regression test output from `phase3_mt5_simulation_test.php` (attach to PR)
- Manual Monday-open verification log: instrument count in watchlist before and after FX open, toggle pre/post filter counts from development console

**State transition required after plan handoff:** `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
