# SMC SuperFIB - Phase 1 prep research

## 1. Issue classification
- Severity: HIGH
- Category: migration-governance / data-contract / wiring
- Layer(s) affected: MT5 / PHP-backend / REST-API / workflow
- Phase impact: Phase 1 / Cross-phase

## 2. Confirmed evidence
- `.github/migration-status.md` defines Phase 1 deliverables for the MT5 bridge and backend API contract: `POST /heartbeat`, `POST /account-sync`, `POST /symbol-sync`, and `GET /license-check`.
- `wordpress/smc-superfib-sniper/README.md` documents the current MT5 ingestion channel as `POST /wp-json/sniper/v1/ea/market-stream` and explains that successful EA snapshot writes emit a lightweight `engine_runs` heartbeat row so `/health` `backendSync` reflects live EA activity.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` registers exactly one MT5 EA ingestion route: `POST /wp-json/sniper/v1/ea/market-stream`. No dedicated `/heartbeat`, `/account-sync`, or `/symbol-sync` REST routes are defined in the current plugin route table.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` inserts `engine_runs` heartbeat rows on successful EA ingestion with `status='heartbeat'` and `summary={"source":"ea_push","symbol":...}`.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` asserts that an EA push writes a backendSync heartbeat row, confirming the current health contract is implemented as a side-effect of market-stream ingestion.
- `mt5/SMC_MarketDataEA.mq5` is configured to send `WebhookURL` to `/wp-json/sniper/v1/ea/market-stream`, with `ApiKey` and `UserId` auth settings and symbol normalization logic that suggests broker-symbol sync is currently handled by the EA before POST.

## 3. Root cause hypothesis
- Confirmed: the repository currently supports MT5 heartbeat indirectly through the existing EA market-stream ingestion path, not through the explicit Phase 1 REST API routes named in the migration contract. (Confirmed)
- Hypothesis: the Phase 1 deliverables list is intentionally specifying a new MT5 bridge contract surface, but the codebase has not yet been updated to expose those dedicated endpoints. (Hypothesis)
- Hypothesis: account and symbol sync semantics are still implicit in current EA payloads and backend normalization, rather than being captured by dedicated `POST /account-sync` and `POST /symbol-sync` contracts. (Hypothesis)
- Hypothesis: the backend health route and `engine_runs` heartbeat row are serving as an interim heartbeat/health contract while the Phase 1 API surface is being prepared. (Hypothesis)

## 4. Blast radius
- Files likely affected:
  - `.github/migration-status.md`
  - `.github/migration/PHASE0_SOAK_TRACKER.md`
  - `wordpress/smc-superfib-sniper/README.md`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
  - `mt5/SMC_MarketDataEA.mq5`
- Systems affected:
  - MT5 EA bridge ingestion and symbol normalization
  - WordPress REST backend route contract and auth model
  - Backend health endpoint and `backendSync` status derivation
  - Engine heartbeat persistence in `smc_sf_engine_runs`
  - Phase 1 migration governance and contract readiness
- Parity surfaces at risk:
  - MT5 EA authority vs backend REST contract naming and payload shape
  - backend health heartbeat semantics vs explicit heartbeat API route
  - account/symbol sync expectations in migration docs vs actual code
- Stale-state risks:
  - if symbol sync remains implicit, broker symbol lists may drift versus persisted account state
  - if heartbeat health is only inferred from engine rows, an endpoint-level contract may still be underspecified

## 5. Regression surface
- Must preserve the existing `POST /wp-json/sniper/v1/ea/market-stream` ingest path and its backend heartbeat side-effect.
- Must preserve current `engine_runs` heartbeat row insertion and the health contract that uses it to mark `backendSync` as live.
- Must not weaken auth or API validation while formalizing Phase 1 endpoints.
- Existing coverage:
  - `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
  - `.github/migration-status.md` Phase 1 checklist
  - `.github/migration/PHASE0_SOAK_TRACKER.md` backend health and soak evidence guidance
- Incorrect patch risk:
  - `backendSync` could appear live without actual MT5 ingestion
  - account-symbol sync could diverge and leave stale symbol state in the EA or backend
  - phase-gate readiness checks could pass on incomplete API contract implementation

## 6. Resolution path options
- Path A: formalize Phase 1 by adding dedicated backend endpoints `POST /heartbeat`, `POST /account-sync`, `POST /symbol-sync`, and `GET /license-check`, while preserving `POST /ea/market-stream` as the existing MT5 data ingest channel. Recommended if the deliverables list is the canonical contract.
- Path B: preserve the current `POST /ea/market-stream` channel and extend its payload to carry explicit heartbeat, account sync, and symbol sync metadata, treating dedicated endpoints as a later refactor. Recommended if preserving compatibility with the current EA payload is a priority.
- Recommended: Path A, because the migration docs explicitly call out separate Phase 1 API routes and that gives the MT5 bridge a clearer, auditable contract surface.
- Note: do not write implementation code or patch design details in this report.

## 7. Risk flags
- High-risk system involved: Yes — Phase 1 MT5 bridge and heartbeat contract are migration gating and health-critical.
- Requires parity re-validation: Yes — MT5 EA ↔ backend REST contract and health/heartbeat semantics.
- Migration-blocking: Yes — Phase 1 readiness depends on a stable MT5 heartbeat/account-symbol-sync contract.
- Human review required before merge: Yes — to validate final API endpoint names, auth model, and whether heartbeat/account/symbol sync should remain implicit or become explicit.

## 8. Handoff package
- Epicentre files to inspect first:
  - `.github/migration-status.md`
  - `.github/migration/PHASE0_SOAK_TRACKER.md`
  - `wordpress/smc-superfib-sniper/README.md`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`
  - `mt5/SMC_MarketDataEA.mq5`
- Inputs Codex must verify before planning:
  - whether the Phase 1 contract requires dedicated `POST /heartbeat`, `/account-sync`, and `/symbol-sync` routes or if those are to be folded into `POST /ea/market-stream`
  - whether `GET /license-check` is required in Phase 1 or deferred
  - whether the current `engine_runs` heartbeat row is the authoritative backend health contract for `backendSync`
  - whether account/symbol sync is currently handled by the EA payload and normalized in the backend, or whether it should be a separate sync API
- Open unknowns:
  - whether dedicated Phase 1 routes are intentionally omitted pending a separate backend branch
  - whether frontend/dashboard or EA clients already depend on the existing market-stream contract in a way that would block new endpoint names
  - whether account symbol sync should include broker symbol normalization state explicitly or rely on the EA symbol list alone
