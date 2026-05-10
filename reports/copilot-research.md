### 1. Issue classification
- Severity: MEDIUM
- Category: wiring
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS / workflow
- Phase impact: Phase 0

### 2. Confirmed evidence
- `src/routes/admin.tsx` implements `/admin` route with admin-only access via `fetchAdminHealth()` from `/wp-json/sniper/v1/admin/health`.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` registers `/admin/health` endpoint with `permission_admin()` requiring `manage_options` capability.
- `get_admin_health()` returns `build_health_payload()` which aggregates EngineHealth including per-symbol diagnostics, feed status, engine run state, and timestamps.
- Database tables exist for `smc_sf_snapshots` (price data), `smc_sf_candles` (chart data), `smc_sf_engine_runs` (engine execution logs), `smc_sf_audit_events` (diagnostic traces).
- `get_market_data_authority()` and `get_authority_diagnostics()` endpoints provide market data authority state per symbol.
- `PHASE0_SOAK_TRACKER.md` documents Phase 0 soak requirements including 72h stability testing, manual evidence collection, and checkpoint reporting.
- Current `/admin` page displays health cards and per-symbol diagnostics table but lacks comprehensive aggregation, manual inputs, persistence, or export functionality.

### 3. Root cause hypothesis
- Confirmed: Existing `/admin/health` endpoint provides basic EngineHealth but lacks aggregation of watchlist, snapshots, candles, engine_runs, and audit_events for comprehensive soak reporting.
- Hypothesis: Phase 0 requires manual operator evidence fields and persisted checkpoint snapshots not present in current admin health contract.
- Hypothesis: Export functionality (markdown/HTML/PDF) needs new UI components and backend generation logic.
- Confirmed: Backend source-of-truth contracts for `/health` must remain unchanged per issue requirements.

### 4. Blast radius
- Files likely affected:
  - `src/routes/admin.tsx` (extend UI for soak report builder)
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (new admin endpoint for aggregated data)
  - `src/lib/api/sniperClient.ts` (new API client function)
  - Database: new table for manual evidence and checkpoint snapshots
  - `src/types/sniper.ts` (new types for soak report data)
- Systems affected:
  - Admin dashboard route and component rendering
  - REST API with new admin-only aggregation endpoint
  - Database schema for manual evidence persistence
  - Frontend/backend data contracts for soak report
- Parity surfaces at risk:
  - Admin authorization contract (must remain admin-only)
  - Backend health endpoint stability (must not change)
- Stale-state/caching risks:
  - Manual evidence should persist independently of health data freshness
  - Checkpoint snapshots need 12h TTL and should not interfere with live diagnostics

### 5. Regression surface
- Existing `/wp-json/sniper/v1/admin/health` endpoint must return identical EngineHealth response.
- Admin permission check (`manage_options`) must remain unchanged.
- Current `/admin` page health display must continue working.
- Backend source-of-truth contracts for health, snapshots, candles, engine_runs, audit_events must not be altered.
- Phase 0 soak tracking in `PHASE0_SOAK_TRACKER.md` expects stable health endpoint.

### 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Add new `/wp-json/sniper/v1/admin/soak-report` endpoint aggregating existing data sources.
  - Extend `src/routes/admin.tsx` with soak report UI including manual input fields and export buttons.
  - Add database table for manual evidence and checkpoint persistence.
- Path B: broader structural risk area if narrow path is unsafe
  - Extend existing `/admin/health` endpoint with optional `?include_soak=true` parameter for backwards compatibility.
  - Implement export generation in frontend with server-side markdown/HTML rendering.
  - Add soak report state management to admin page with local storage fallback.
- Recommended: Path A
  - Preserves existing `/health` contract unchanged, minimizes regression risk, allows independent soak report development.

### 7. Risk flags
- High-risk system involved: Yes — admin-only backend aggregation requires careful auth scoping and data access controls.
- Requires parity re-validation: Yes — new soak report aggregation must maintain consistency with existing health diagnostics.
- Migration-blocking: No — Phase 0 stabilization enhancement, not MT5 migration logic.
- Human review required before merge: Yes — admin data aggregation, manual evidence persistence, and export functionality need security and correctness review.

### 8. Handoff package
- Epicentre files to inspect first:
  - `src/routes/admin.tsx`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (around `get_admin_health` and `build_health_payload`)
  - `PHASE0_SOAK_TRACKER.md`
  - Database schema for `smc_sf_engine_runs` and `smc_sf_audit_events` tables
- Inputs Codex must verify before planning:
  - Exact response contract of existing `/admin/health` endpoint
  - Database schema and access patterns for snapshots, candles, engine_runs, audit_events
  - Admin permission requirements and current user capability checks
  - Whether manual evidence should be stored in new table or extended existing audit_events
  - Export format requirements (markdown, HTML, PDF) and generation approach
- Open unknowns:
  - Whether soak report should include real-time data or historical snapshots
  - How 12h checkpoint persistence should interact with existing data retention (engine_runs prune at 7d, audit_events at 14d)
  - Whether export should be client-side generation or server-side rendering
