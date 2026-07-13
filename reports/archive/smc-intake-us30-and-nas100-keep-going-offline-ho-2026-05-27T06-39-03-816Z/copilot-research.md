## 1. Issue classification
- Severity: HIGH
- Category: stale-data / symbol-wiring / migration-governance
- Layer(s) affected: MT5 / PHP-backend / Dashboard-JS
- Phase impact: Phase 3

## 2. Confirmed evidence
- `mt5/SymbolNormalizer.mqh` contains alias mappings for `US TECH 100` → `NAS100` and `WALL STREET 30` → `US30`, plus known symbol registrations for `US30` and `NAS100`.
- `.github/migration-status.md` documents that NAS100/US30 are present in EA as Deriv broker names and that offline status in the 04:17 UTC closeout snapshot was expected pre-market behaviour.
- `.github/migration/RISK_REGISTER.md` RISK-04 marks this exact symptom resolved and confirms the EA symbols are present and normalized correctly.
- `reports/phase3-closeout.md` explicitly reports the offline root cause as broker/session availability, not EA or backend failure.
- `mt5/SMC_MarketDataEA.mq5` shows the repo's bundled default `Symbols` list is only `EURUSD,GBPUSD,XAUUSD,USDJPY,GBPJPY,AUDUSD`, indicating the user's deployed list may be an override or a different runtime config than the packaged default.
- `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md` and `.github/docs/archive/BUG_SWEEP_REPORT_2026-05-03-v3.md` document the prior permanent root cause for non-chart symbols going offline: the EA failed to poll non-chart symbols from `SymbolInfoTick()` in `OnTimer()`, so all multi-symbol freshness ages to `DISCONNECTED` and backend state becomes `offline`.

## 3. Root cause hypothesis
- `Confirmed`: The current repo already contains a Deriv alias mapping for `US Tech 100` / `Wall Street 30`, so missing symbol support is not the primary fault.
- `Hypothesis`: The observed offline condition is most likely caused by market-session availability and freshness gating rather than the symbol being absent from the EA symbol map.
- `Hypothesis`: If the deployed EA still uses a multi-symbol configuration, the earlier multi-symbol freshness bug is the strongest candidate permanent cause for repeat offline behavior.
- `Hypothesis`: The deployed EA list in the issue text does not match the repo default, so a runtime override or external deployment configuration may be in play.

## 4. Blast radius
- Affected files: `mt5/SymbolNormalizer.mqh`, `mt5/SMC_MarketDataEA.mq5`, `wordpress/smc-superfib-sniper/class-market-data-service.php`, and dashboard routes that render live/stale/offline status.
- Systems affected: MT5 EA symbol normalization and freshness engine, backend snapshot state persistence, dashboard live/offline signal display, and migration stability gating.
- Parity surfaces at risk: MT5 live freshness truth → backend snapshot state → dashboard UI truth. Incorrect handling here can make US30/NAS100 appear offline even when they are legally live or when the correct alias mapping exists.
- Authority risks: if the backend or dashboard masks actual MT5 `offline` state as bogus live, operator trust and phase soak validation are compromised.

## 5. Regression surface
- Preserved behavior: FX/equity indices should remain `offline` when their broker session is legitimately closed; crypto symbols must still render `live` when their market is open.
- Existing guards: `SymbolNormalizer.mqh` alias map, backend `CLOSED`/`DISCONNECTED` → `offline` semantics, and dashboard stale/offline rendering regression coverage from Phase 0 audits.
- Tests/audits covering this area: `phase-0-mt5-multisymbol-parity-2026-05-03.md`, `phase-0-mt5-backend-dashboard-parity-2026-05-25.md`, `phase-3-soak-closeout-template.md`, and `reports/phase3-closeout.md`.

## 6. Resolution path options
- Path A: Validate and preserve the existing alias and multi-symbol freshness fix, then ensure the deployed EA config matches the repo's expected symbol normalization path. This is the narrowest correction surface.
- Path B: Broaden to a deployment-config audit and symbol normalization hardening check, ensuring any override list still uses the canonical Deriv alias map and that non-chart symbol polling is enforced.
- Recommended: Path A, because the repository already contains the permanent fix pattern; the likely gap is deployment/runtime configuration or market-session expectations rather than a missing code fix.

## 7. Risk flags
- High-risk system involved: Yes — MT5 freshness and index symbol handling affect live symbol state and Phase 3/Phase 4 migration validation.
- Requires parity re-validation: Yes — MT5 <-> backend <-> dashboard freshness/state parity for US30/NAS100.
- Migration-blocking: Yes — repeated offline index symbols can block live-soak validation and cause phase gate uncertainty.
- Human review required before merge: Yes — review should verify alias normalization, deployed symbol config, and that offline behavior is correctly attributed to session availability.

## 8. Handoff package
- Epicentre files to inspect first:
  - `mt5/SymbolNormalizer.mqh`
  - `mt5/SMC_MarketDataEA.mq5`
  - `.github/migration-status.md`
  - `.github/migration/RISK_REGISTER.md`
  - `reports/phase3-closeout.md`
- Inputs Codex must verify before planning:
  1. Does the current deployed EA configuration use the repo’s alias map for `US Tech 100` and `Wall Street 30`?
  2. Is the offline condition occurring during a known pre-market or closed session time window for US equities?
  3. Has the multi-symbol non-chart polling fix been preserved in the deployed EA build?
  4. Does the backend still map `CLOSED`/`DISCONNECTED` properly to `offline` without introducing false live states?
- Open unknowns:
  1. Whether the user’s deployed EA list is a runtime override that differs from the repo’s bundled `Symbols` default.
  2. Whether the current offline observation is genuine session closure or the earlier multi-symbol freshness bug resurfacing.
  3. Whether the issue is in the deployed MT5 binary and symbol list rather than the source files currently visible in the repo.
