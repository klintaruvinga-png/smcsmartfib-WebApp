### 1. Issue classification
- Severity: MEDIUM
- Category: migration-governance
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS / workflow
- Phase impact: Phase 2

### 2. Confirmed evidence
- `.github/migration-status.md` defines Phase 2 as "Read-only trade telemetry" with status NOT-STARTED and prerequisites Phase 1 complete.
- `PHASE2_IMPLEMENTATION.md` captures Phase 2 deliverables, including EA sync systems, dashboard panels, and the `GET /wp-json/sniper/v1/market-data-authority` endpoint.
- `mt5/SMC_MarketDataEA.mq5` contains `WebhookURL = "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream"`, confirming the MT5 EA telemetry output contract targets the existing market-stream path.
- `.github/migration/PHASE1_TRACKER.md` and `.github/migration/phase-updates/phase1-bridge-validation-started-2026-05-18.md` confirm `POST /ea/market-stream` is operational, auth is passing, and Phase 1 bridge route validation is complete.
- `.github/migration-status.md` shows Track C (Dashboard) is deferred until bridge instrumentation is available, indicating dashboard telemetry gaps remain for Phase 2.

### 3. Root cause hypothesis
- Confirmed: the project has completed Phase 1 bridge infrastructure and the existing market-stream route, but Phase 2 scope, acceptance criteria, and telemetry contracts are not yet documented as a unified readiness package.
- Hypothesis: Phase 2 is currently under-specified because the transition from bridge validation to read-only trade telemetry requires explicit alignment across MT5 EA output, backend ingestion, and dashboard instrumentation.
- Hypothesis: the current artifact set focuses on Phase 1 route/bridge health, leaving Phase 2 trade payload shape and dashboard visibility requirements as an open planning gap.

### 4. Blast radius
- Files likely affected:
  - `.github/migration-status.md`
  - `PHASE2_IMPLEMENTATION.md`
  - `.github/migration/PHASE1_TRACKER.md`
  - `.github/migration/phase-updates/phase1-bridge-validation-started-2026-05-18.md`
  - `mt5/SMC_MarketDataEA.mq5`
  - `mt5/MarketDataEngine.mqh`
  - `src/lib/api/sniperClient.ts`
  - frontend route files that render telemetry panels and account state
  - backend plugin files handling `POST /wp-json/sniper/v1/ea/market-stream` and `GET /wp-json/sniper/v1/market-data-authority`
- Systems affected:
  - MT5 EA telemetry sender
  - WordPress backend telemetry ingestion and persistence
  - Dashboard telemetry visualization and health indicators
  - migration governance and phase tracking
- Parity surfaces at risk:
  - MT5 EA output contract vs backend ingestion path
  - backend telemetry service fields vs dashboard consumers
  - Phase 2 readiness criteria vs Phase 1 bridge validation assumptions
- Risks:
  - stale or duplicate trade state
  - incomplete live position visibility
  - dashboard panels rendered without read-only authority contract

### 5. Regression surface
- Existing Phase 1 bridge routes, especially `POST /ea/market-stream`, must remain unchanged during planning and contract definition.
- Current auth and payload validation behavior for the EA market-stream route is a known stable surface; it should not be weakened.
- Dashboard data-fetching and backend authority endpoints already in place should not be broken by new Phase 2 telemetry requirements.
- Phase 1 route health and existing 48h continuity validation are regression guards for the forward path.

### 6. Resolution path options
- Path A: produce a narrow Phase 2 readiness package that documents the exact telemetry payload contract, backend ingestion interfaces, and dashboard instrumentation requirements for read-only trade state.
- Path B: expand into a broader audit of backend telemetry endpoints and dashboard route consumers if the current contract evidence is too sparse to plan safely.
- Recommended: Path A, because Phase 1 bridge validation is already complete and the immediate need is to capture Phase 2 scope and acceptance criteria, not to rewrite existing route infrastructure.

### 7. Risk flags
- High-risk system involved: Yes — cross-track telemetry contracts span MT5 EA, backend ingestion, and dashboard visibility.
- Requires parity re-validation: Yes — MT5 ↔ Backend ↔ Dashboard telemetry contract alignment.
- Migration-blocking: Yes — Phase 2 readiness is a prerequisite for Phase 3 market data engine work.
- Human review required before merge: Yes — the planning artifact should be reviewed by Track A/B/C owners to confirm telemetry, ingestion, and dashboard checklist completeness.

### 8. Handoff package
- Epicentre files to inspect first:
  - `.github/migration-status.md`
  - `PHASE2_IMPLEMENTATION.md`
  - `.github/migration/PHASE1_TRACKER.md`
  - `mt5/SMC_MarketDataEA.mq5`
  - `mt5/MarketDataEngine.mqh`
- Inputs Codex must verify before planning:
  - dashboard instrumentation requirements for read-only trade state
  - backend telemetry ingestion interfaces and persistence expectations
  - MT5 EA telemetry output contract and auth semantics
  - current `POST /ea/market-stream` route behavior and payload validation
- Open unknowns:
  - whether the backend has a dedicated Phase 2 ingest API beyond the existing market-stream path
  - whether dashboard panels already have concrete API contracts for live positions, P/L, and account metrics
  - whether any frontend sections still depend on auth/write authority assumptions that conflict with read-only telemetry
