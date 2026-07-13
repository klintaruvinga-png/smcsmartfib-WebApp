### 1. Issue classification
- Severity: HIGH
- Category: stale-data / parity-drift / migration-governance
- Layer(s) affected: MT5 / PHP-backend / workflow
- Phase impact: Phase 0 / Cross-phase

### 2. Confirmed evidence
- `reports/codex-implementation.md` records the Phase 0 soak closeout and the exact blocker set: NAS100/US30 `PRICE_NOT_MT5_FRESH`, XAUUSD `INSUFFICIENT_CANDLE_HISTORY`, AUDUSD/ETHUSD `CHOP_GATE_BLOCKED`.
- `.github/migration-status.md` shows Phase 0 blocked in closeout and lists the same repaired fix paths and open validation requirement for the blocked symbols.
- `.github/migration/audits/phase-0-full-parity-2026-05-14.md` confirms the soak closed operationally but failed the migration gate and explicitly prescribes a targeted post-fix validation and superseding closeout artifact.
- `reports/snapshots/stabilize-ea-2026-05-14/MANIFEST.md` documents the Phase 0 patch cluster and the final state readiness status, including MQL5 compile and PHP syntax checks.
- `mt5/MarketDataEngine.mqh`, `mt5/SymbolNormalizer.mqh`, and `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` are the epicentre files for the MT5 freshness fix, XAUUSD alias fix, and equity-index health gating.

### 3. Root cause hypothesis
- NAS100/US30 freshness failure: Confirmed. MT5 EA session classification used FX hours only; equity index symbols were incorrectly aged stale and the backend health check lacked equity-index off-session logic. `Confirmed`
- XAUUSD candle-history failure: Confirmed. EA symbol normalization lacked a broker alias for "GOLD" → "XAUUSD", so XAUUSD did not enter the active MT5 symbol list on affected brokers. `Confirmed`
- AUDUSD/ETHUSD chop-gate status: Confirmed as engine behavior, not a stale-data bug. Chop is computed live and the gate blocked these symbols because the live 15m regime was high-chop. `Confirmed`
- Superseding closeout artifact status: Unconfirmed. The repo contains the blocked-symbol audit and soak closeout logs, but there is no explicit published Phase 0 superseding closeout artifact that declares the gate cleared after the post-fix validation.

### 4. Blast radius
- Files likely affected:
  - `mt5/MarketDataEngine.mqh`
  - `mt5/SymbolNormalizer.mqh`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `.github/migration-status.md`
  - `.github/migration/audits/phase-0-full-parity-2026-05-14.md`
  - `reports/codex-implementation.md`
- Systems involved:
  - MT5 EA market data and freshness engine
  - PHP backend health check and feed-status logic
  - Phase 0 migration workflow and soak closeout tracker
- Parity surfaces at risk:
  - MT5 -> Backend freshness truth
  - Backend -> Phase 0 closeout gate
  - Symbol readiness for XAUUSD M1→M15 aggregation
- Stale-state / authority risks:
  - Equity index off-session stale logic
  - XAUUSD alias-resolution gap causing missing symbol ingestion
  - AUDUSD/ETHUSD chop gating being treated as a possible live market classification issue

### 5. Regression surface
- Must preserve existing stale-data protections: genuine stale live-market symbols should continue to fail with `PRICE_NOT_MT5_FRESH`.
- Must preserve backend `feedStatus=stale` semantics for all non-equity-index symbols.
- AUDUSD/ETHUSD chop-gate logic must not be relaxed without actual evidence of false positives, because code audit classified it as correct behavior.
- Existing soak and parity logs (`.github/migration/phase-updates/*` and `reports/snapshots/*`) are the operational evidence chain and must remain intact.

### 6. Resolution path options
- Path A: Narrow correction plus targeted validation. Accept the confirmed fixes for NAS100/US30 and XAUUSD, run focused validation on only the previously blocked symbols, and publish a superseding Phase 0 closeout artifact if they all pass.
- Path B: Broader structural audit. Re-run a full Phase 0 parity closeout after the fix, including audit of AUDUSD/ETHUSD chop behavior and a complete recheck of backend/dashboard parity.
- Recommended: Path A. The issue request is specifically a blocked-symbol re-validation and closeout update; the repo already shows the targeted fixes are in place and the remaining task is to verify the live symbol state and publish the new closeout artifact.

### 7. Risk flags
- High-risk system involved: Yes. MT5 freshness and backend health gating are critical for Phase 0 stabilization.
- Requires parity re-validation: Yes. Backend freshness and symbol readiness engines must be revalidated for NAS100, US30, XAUUSD, AUDUSD, and ETHUSD.
- Migration-blocking: Yes. Phase 0 closeout is currently blocked by these symbol-level issues.
- Human review required before merge: Yes. The closeout artifact and the determination that AUDUSD/ETHUSD remain observation-only need explicit manual signoff.

### 8. Handoff package
- Epicentre files to inspect first:
  - `mt5/MarketDataEngine.mqh`
  - `mt5/SymbolNormalizer.mqh`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `.github/migration-status.md`
  - `.github/migration/audits/phase-0-full-parity-2026-05-14.md`
  - `reports/codex-implementation.md`
- Inputs Codex must verify before planning:
  - Whether NAS100 and US30 now pass the MT5 freshness path in a live validation soak
  - Whether XAUUSD now resolves and accumulates M1→M15 candles after EA restart
  - Whether AUDUSD and ETHUSD remain observation-only as chop-gate behavior, not a regression
  - Whether a superseding Phase 0 closeout artifact can be published based on the focused validation results
- Open unknowns:
  - Has the focused re-validation already completed outside the repo and been documented elsewhere?
  - Is there an explicit superseding Phase 0 closeout artifact file yet, or does it still need to be created?
  - Are the current `staleThresholdSec` and equity-session definitions in the deployed EA and backend aligned with the code changes in the repo?
