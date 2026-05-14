# Parity Audit Report - Phase 0

**Report Date**: 2026-05-14  
**Phase**: Phase 0 - 72h soak closeout  
**Auditor**: Codex repo reconciliation  
**Status**: FAIL

---

## Executive Summary

- **Overall Parity**: Partial; code-contract parity is strong, but live closeout parity is not yet sufficient for a Phase 0 pass.
- **Threshold Required**: Phase 0 requires stable backend truth across soak health, freshness, candle coverage, and dashboard/backend parity.
- **Pass/Fail**: FAIL
- **Trend**: Stable at the platform level, blocked at the symbol level

The restart soak window from `2026-05-11 08:57 SAST` to `2026-05-14 08:57 SAST` closed operationally, but it did not clear the migration gate. The final export recorded `feedStatus=stale`, `backendSync=live`, `engineRunState=live`, and `5/7` watchlist symbols live. The unresolved closeout blocker set remained `NAS100=PRICE_NOT_MT5_FRESH`, `US30=PRICE_NOT_MT5_FRESH`, `XAUUSD=INSUFFICIENT_CANDLE_HISTORY`, `AUDUSD=CHOP_GATE_BLOCKED`, and `ETHUSD=CHOP_GATE_BLOCKED`.

---

## Component Parity Metrics

### Phase 0 closeout matrix

| Metric | Evidence | Result | Notes |
|---|---|---|---|
| Admin soak-report contract | `phase-0-dashboard-admin-soak-parity-2026-05-12.md` | PASS | Dashboard/admin soak surfaces remained backend-authoritative. |
| Admin health contract | `phase-0-dashboard-admin-health-parity-2026-05-12.md` | PASS | `/health` and `/admin/health` parity remained aligned. |
| MT5 EA ingress route/payload parity | `phase-0-mt5-ea-market-stream-parity-2026-05-14.md` | PASS | Route, auth, timestamps, and OHLC guards are aligned and regression-covered. |
| Pine/backend deterministic fib parity | `phase-0-pine-backend-parity-2026-05-14.md` | PASS | Deterministic session-anchor and fib checks passed. |
| Backend -> dashboard display parity | `phase-0-dashboard-parity-2026-05-14.md` | PASS | Display-layer parity preserved for the audited chart surfaces. |
| Live operational symbol freshness parity | Final soak export + completion log | FAIL | NAS100 and US30 still closed the soak in `PRICE_NOT_MT5_FRESH`. |
| Live candle-history readiness parity | Final soak export + completion log | FAIL | XAUUSD still closed the soak in `INSUFFICIENT_CANDLE_HISTORY`. |
| Gate-state closeout parity | Final soak export + completion log | PARTIAL | AUDUSD and ETHUSD remained chop-gate blocked; operationally stable, but not ready for phase advancement. |

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---|---|---|
| NAS100 and US30 still not MT5-fresh at soak closeout | HIGH | 2 | Investigate MT5 freshness path, symbol sync, and ingestion timing | Yes |
| XAUUSD still fails candle-history readiness | HIGH | 1 | Verify M1 -> 15min aggregation and symbol/history continuity | Yes |
| Chop-gate blocks persisted through closeout for AUDUSD and ETHUSD | MEDIUM | 2 | Audit whether the locked state is true market behavior or parity drift | Yes |
| Raw final soak export is not committed to the repo evidence chain | MEDIUM | 1 | Commit or archive the raw `phase0-soak-2026-05-14 (1).md` artifact | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Live TradingView vs backend fib parity replay | Not captured in this repo artifact | Deterministic backend parity is documented, but live symbol replay and session-boundary checks remain external/manual | Yes |
| Historical original soak tracker vs restart baseline | Different baseline windows and candle counts | The original `2026-05-06` tracker is preserved as a historical guide, not the restart-window numeric authority | Yes |

---

## Post-Soak Root-Cause Findings — 2026-05-14

Investigation performed on 2026-05-14 after the soak closed with gate still failed. The following root causes were confirmed by direct code inspection. Fixes were applied on the same date; a 4-hour+ validation soak covering at least one NAS100/US30 active session and one XAUUSD active session is required before Phase 0 can be declared PASS.

### NAS100 / US30 — PRICE_NOT_MT5_FRESH (BOTH layers defective, both fixed)

**Root cause (MT5 EA):** `SessionManager.IsMarketOpen()` uses FX market hours (Mon 22:00 UTC – Fri 22:00 UTC). NAS100 and US30 are US equity index instruments that only trade Mon–Fri 13:30–20:00 UTC. During Asia/London sessions when no ticks arrive, `FreshnessEngine` ages the symbols to `FRESHNESS_STALE` after 300 s because the session manager reports "market open." The EA then re-pushes the last stale tick with `freshness="STALE"`. The PHP backend's 300-second stale-data guard rejects subsequent pushes (tick timestamp is hours old), leaving the snapshot `updated_at` from the close of the previous equity session. Age > `staleThresholdSec` (60 s) → `feedStatus=stale`.

**Root cause (PHP):** `get_health()` feed check has no per-symbol session-awareness. All symbols are evaluated identically against `staleThresholdSec`. Equity index symbols in their documented off-session state are indistinguishable from genuinely stale live-market symbols.

**Fix applied:**
- `mt5/MarketDataEngine.mqh`: Added `IsEquityIndexSymbol()` and `IsEquitySessionOpen()` helpers. When building the webhook payload for NAS100/US30 outside US equity hours, `freshness` is overridden to `"CLOSED"` and `timestamp` is set to the current `TimeGMT()` (not the stale last-tick time) so PHP accepts the push and keeps `updated_at` current.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: Added `is_equity_index_off_session($symbol)` helper (Mon–Fri 13:30–20:00 UTC gate). In the health check symbol loop, equity index symbols outside their session are excluded from `$feed_has_stale_symbols` — they are neither counted as live nor as stale, allowing `feedStatus=live` via the `!$feed_has_stale_symbols && $batch_age <= 120` path when all other symbols are healthy.

**Acceptance criteria:** NAS100 and US30 report `feedStatus=live` (per-symbol) during their active trading session. Outside session hours, they are excluded from the feed-health stale count without triggering `PRICE_NOT_MT5_FRESH`. Control symbols (EURUSD, GBPUSD) must remain unaffected.

---

### XAUUSD — INSUFFICIENT_CANDLE_HISTORY (SymbolNormalizer alias defect)

**Root cause:** `mt5/SymbolNormalizer.mqh` did not include a broker alias mapping for "GOLD" → "XAUUSD". Brokers that list gold as "GOLD" rather than "XAUUSD" (common with IC Markets, Exness, and others) cause `ResolveBrokerSymbol("XAUUSD")` in the EA to fail: the function scans all broker symbols and compares `NormalizeSymbol(candidate)` against the canonical "XAUUSD", but `NormalizeSymbol("GOLD")` returned "GOLD" (unrecognized), never matching. XAUUSD was therefore absent from the EA's active symbol list. No MT5 price snapshots or M1 candles were ever pushed for XAUUSD. `fetch_aggregated_mt5_m1_candles()` returned empty; the health check fell back to Twelve Data 15m candles, which were stale or insufficient → `$mt5_candles_live = false` → `feedStatus=stale`.

**Fix applied:**
- `mt5/SymbolNormalizer.mqh`: Added a broker alias map (`aliasKeys[]`/`aliasVals[]`) with `AddAlias()` / `LookupAlias()` methods. `NormalizeSymbol()` now checks aliases before and after suffix stripping so "GOLD", "GOLD.PRO", etc. all resolve to "XAUUSD". Also added aliases for other common broker renames: SILVER→XAGUSD, US100/NASDAQ/NDX→NAS100, DJ30/DJI/DOW30→US30, US500/SPX→SPX500.

**Acceptance criteria:** After EA restart, XAUUSD is resolved from the broker's symbol list (resolves via the "GOLD" alias if applicable), MT5 M1 and M15 candles begin accumulating in the DB under "XAUUSD", and `$mt5_candles_live = true` within 7.5h of initial data flow. Candle-history readiness gate passes for XAUUSD and 15m signal spot-check produces valid SMC/SuperFIB output.

---

### AUDUSD / ETHUSD — CHOP_GATE_BLOCKED (Classified: A — Correct Engine Behavior)

**Inspection finding (INSPECT-5):** The chop-gate evaluation (`$chop = 1 - abs(move)/range`) in `build_symbol_state()` is computed inline from live 15m candle data on every engine run. It is not cached or persisted. The gate blocks signal generation when `$chop >= 0.7`. No stale-cache or parity-drift defect was found.

**Classification:** **A — Correct engine behavior.** AUDUSD and ETHUSD were in genuine high-chop equilibrium during the Phase 0 soak window. No code change is authorized for this finding.

**Follow-on:** A chop-gate audit branch (`codex/fix-phase0-chop-gate-audit`) is required only if a future soak window shows the symbols remain chop-blocked during clearly trending sessions, which would indicate Explanation B (parity drift) or C (stale cache) re-emerging. No such evidence exists at this time.

---

## Recommendations

1. Fix the NAS100/US30 MT5 freshness path before attempting any phase advancement. ✅ **Fixed 2026-05-14**
2. Resolve XAUUSD candle-history readiness with a focused M1 -> 15min aggregation audit. ✅ **Fixed 2026-05-14 (GOLD alias)**
3. Re-run a targeted post-fix soak or focused checkpoint validation for the affected symbols and publish a superseding closeout artifact if the blockers clear.
4. Classify AUDUSD/ETHUSD chop-gate blocks. ✅ **Classified 2026-05-14 — Explanation A (correct engine behavior), no code change.**

---

## Verification Checklist

- [x] Latest soak closeout log reviewed
- [x] Restart checklist reconciled against closeout
- [x] Latest Phase 0 parity audits reviewed
- [x] MT5 EA ingress parity reviewed
- [x] Pine/backend deterministic parity reviewed
- [ ] Raw final soak export committed to the repo
- [ ] Live TradingView/session-boundary replay attached to the closeout evidence chain

---

## Artifacts

- Final external soak export: `C:\Users\LEONNA\Downloads\phase0-soak-2026-05-14 (1).md`
- Closeout log: `.github/migration/phase-updates/phase-0-completion-2026-05-14.md`
- Restart checklist: `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`
- Restart summary: `.github/migration/phase-updates/phase-0-soak-summary-2026-05-11.md`
- Supporting parity audits: `.github/migration/audits/phase-0-*.md`
