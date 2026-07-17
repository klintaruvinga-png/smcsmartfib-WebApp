# Backend Migration Strategic Roadmap

This roadmap coordinates the WordPress → Node.js/TanStack Start backend migration with Phase 4 MT5 fib engine validation, providing a phased approach that minimizes context switching while ensuring safe cutover from the legacy WordPress backend.

> **STRATEGY UPDATE (2026-07-17) — WordPress-Free BACKEND-2.**
> WordPress is **permanently down**, so the shadow-mode sync, dual-write, cutover, and
> decommission narrative in this roadmap no longer applies. The authoritative plan is now
> [`backend-2-restoration-plan.md`](./backend-2-restoration-plan.md): a service-oriented,
> zero-WordPress restoration (`VITE_API_URL`, JWT-only auth, domain services) delivered in
> 7 sub-phases over 15–23 days. Sections below that describe shadow sync, dual-write,
> WordPress cutover, and WordPress decommission are **RETIRED** — see the inline notes.
> This file remains useful for the phased sequencing of MT5 validation vs. backend work.

---

## Executive Summary

**Current State**: Phase 4 MT5 fib engine is in read-only testing mode (parity gate not yet passed). Backend migration BACKEND-0 is ~90% complete (database layer, shared contracts already authored; provider wiring pending) and BACKEND-1 is COMPLETE (auth, critical endpoints, and settings endpoint all implemented).

**Strategic Approach (revised 2026-07-17)**: WordPress is permanently down, so the backend is restored directly via the WordPress-free BACKEND-2 plan — no shadow-mode sync, no cutover. Complete the backend foundation (BACKEND-0/1) and the service-oriented BACKEND-2 restoration in parallel with Phase 4 validation. This prevents debugging two major systems simultaneously while maintaining project momentum.

**Key Dependencies**: 
- BACKEND-2 (WordPress-Free Restoration) is gated only on BACKEND-1 completion, not on Phase 4
- No WordPress cutover — compatibility is removed outright in BACKEND-2 Phase 1
- MT5 engine validation (Phase 4) remains a separate track; backend restoration does not wait for it

---

## Phase 4 Context & Migration Coordination

### Current Phase 4 Status
- **MT5 Fib Engine**: Code complete, deployed live, T0 soak baseline captured (2026-05-27)
- **Parity Gate**: NOT PASSED - Best attempt 51.04% with 47 critical mismatches (anchor detection issues)
- **Operational Tests**: Weekend gap and sparse-data scenarios NOT completed
- **Governance**: No code changes permitted during backend migration

### Coordination Strategy
**During Phase 4 Testing** (Current):
- ✅ Build backend APIs (auth, endpoints, infrastructure)
- ✅ Complete dashboard integration work
- ✅ Prepare deployment infrastructure
- ❌ Avoid final migration cutover
- ❌ Avoid MT5 engine modifications

**After Phase 4 Gate Passes**:
- ✅ Execute BACKEND-2 (MT5 integration — read-only ingest)
- ✅ Execute the core-trading endpoints (signals, ladders, health, account-telemetry)
- ⌫ ~~Begin shadow-mode sync~~ — RETIRED (WordPress down)
- ⌫ ~~Plan controlled cutover~~ — RETIRED (no WordPress to cut over from)

**If Phase 4 Uncovers Issues**:
- Pause backend migration at BACKEND-1
- Focus resources on MT5 engine fixes
- Resume backend migration once Phase 4 stabilizes

---

## Timeline: Phased Approach

### Immediate Phase (Week 1-2): Complete Foundation

**Objective**: Finish BACKEND-0 and BACKEND-1 to establish production-ready backend foundation.

#### BACKEND-0 Completion (Days 1-3)
- [x] **Shared Contracts Package** (Priority: HIGH) — **DONE**: `packages/contracts/` already exists with `src/index.ts`, `src/normalizers.ts`, and a built `dist/`. Runtime adoption remains gated on Phase 5/6 per migration-status.md.
  - Create `packages/contracts/` with shared TypeScript interfaces
  - Define API contracts for fib-levels, users, sessions
  - Export types for frontend/backend consumption
  - Add validation schemas (Zod) for contract enforcement
  - **Evidence**: `packages/contracts/package.json` published locally

- [ ] **Provider Wiring** (Priority: HIGH) — PENDING
  - Wire Supabase client to Nitro runtime config
  - Implement database connection pooling
  - Add health check endpoint with DB connectivity
  - Configure environment variable validation
  - **Evidence**: `curl localhost:3000/api/health` returns DB status

- [ ] **TypeScript Configuration** (Priority: MEDIUM)
  - Fix npm scripts (`typecheck`, `test:integration`) — **DONE**: both present in `backend/package.json` and run green (47/47 integration tests); earlier `.bin` shim breakage resolved
  - Resolve OneDrive symlink issues
  - Configure strict mode for shared contracts
  - **Evidence**: `npm run typecheck` exits cleanly

#### BACKEND-1 Completion (Days 4-7)
- [x] **Settings Endpoint** (Priority: HIGH) — **DONE** (2026-07-17, PR #430)
  - `GET /api/user/settings` - retrieve user preferences
  - `PUT`/`POST`/`PATCH` `/api/user/settings` - update user preferences (transaction with row-locking `SELECT ... FOR UPDATE` + application deep merge)
  - Schema: notifications, theme, watchlist defaults, risk parameters
  - API/schema parity only; WordPress usermeta full data mapping owned by shadow-sync phase (BACKEND-3)
  - **Evidence**: 8 new integration tests; full suite 47/47 green; `npm run typecheck` clean

- [x] **Authentication Hardening** (Priority: MEDIUM) — **DONE** (2026-07-16)
  - JWT expiry policies configured (access: 15m, refresh: 7d)
  - Refresh token rotation implemented
  - Session management middleware implemented (requireAuth, requireEaAuth)
  - Rate limiting deferred to deployment phase
  - **Evidence**: 18 auth integration tests passing; refresh rotation verified

- [ ] **API Documentation** (Priority: MEDIUM)
  - Document all BACKEND-1 endpoints with OpenAPI/Swagger
  - Add request/response examples
  - Document error codes and recovery procedures
  - **Evidence**: `/docs/api` endpoint available

**Success Criteria**:
- All BACKEND-0/BACKEND-1 integration tests passing (47 tests)
- Shared contracts package consumable by frontend
- Settings endpoint achieves WordPress API/schema parity
- Health check confirms DB connectivity (pending provider wiring)
- Type checking passes without errors

---

### Medium Phase (Weeks 3-6): Integration & Shadow Mode

**Objective**: Execute the WordPress-free BACKEND-2 restoration (service layer + app-boot/core-trading endpoints + MT5 read-only ingest). See [`backend-2-restoration-plan.md`](./backend-2-restoration-plan.md).

#### BACKEND-2: WordPress-Free Restoration (was "MT5 Integration")
**Dependency**: BACKEND-1 complete (Phase 4 NOT required)

- [ ] **MT5 Read-Only Ingestion** (Priority: CRITICAL) — replaces dual-write
  - `POST /api/ea/market-stream` - market snapshot ingestion → `market_snapshots`
  - `POST /api/ea/heartbeat` - MT5 heartbeat ingestion → `ea_sessions`
  - `POST /api/ea/account-sync` - account telemetry → `account_telemetry`
  - `POST /api/ea/symbol-sync` - broker symbol sync
  - No dual-write, no WordPress primary/fallback (WordPress is down)
  - **Evidence**: MT5 EA writes data; integration tests pass

- [ ] **App-Boot + Core-Trading Endpoints** (Priority: HIGH)
  - `GET /api/snapshot/unified`, `GET /api/charts`, `GET /api/session` (app boot)
  - `GET /api/signals`, `GET /api/ladders`, `GET /api/health`, `GET /api/account-telemetry`
  - Backed by SnapshotService / SignalService / ChartService / MarketDataService / TelemetryService
  - **Evidence**: Frontend boots and renders signals, ladders, engine health

- [ ] **Service Layer Foundation** (Priority: HIGH)
  - `backend/src/lib/services/{snapshot,signal,chart,market,telemetry}/`
  - Refactor endpoint-first `handlers.ts` into services
  - **Evidence**: Services unit-tested in isolation; routes are thin wrappers

#### BACKEND-3: Signal & Plan Endpoints (folded into BACKEND-2 Phase 4)
**Dependency**: Now part of BACKEND-2 (no separate gate). Per [`backend-2-restoration-plan.md`](./backend-2-restoration-plan.md) these are delivered as `GET /api/signals`, `GET /api/ladders`, etc., backed by `SignalService`.

- [ ] **Signal Processing Endpoints** (Priority: HIGH)
  - `GET /api/signals` (board_size, scope) - live signal board
  - `GET /api/ladders` - trade plans for dashboard plan cards
  - Backed by `SignalService.getLiveSignals` / `getLadders`
  - **Evidence**: Signals/ladders render; match MT5 output where available

- [ ] **Regime & Chop Data** (Priority: MEDIUM)
  - `GET /api/snapshot/unified` carries regimes + gates (vs. separate WP routes)
  - Backed by `SnapshotService` + `market_regimes` / `signal_gates` tables
  - **Evidence**: Regime/gate state renders in snapshot

#### Shadow Mode Setup (Week 6) — RETIRED (WordPress permanently down)
No WordPress source exists to sync from or validate against. The WordPress client,
shadow sync service, scheduler, and `GET /api/admin/shadow-validation` are **removed
from scope**. Data migration is handled by BACKEND-2 Phase 6 (import a WordPress backup
if one exists, otherwise seed test data).

**Success Criteria** (revised, WordPress-free):
- MT5 read-only ingestion operational (market-stream, heartbeat, account-sync, symbol-sync)
- All signal/plan endpoints functional
- Service layer present; routes are thin wrappers
- Data migration/seed complete; frontend renders migrated or seeded data
- No data loss during migration

---

### Long Term Phase (Weeks 7-12): Cutover & Decommission

**Objective**: Complete the WordPress-free restoration (BACKEND-2) and harden the service-oriented architecture. The old BACKEND-4 (cutover) and BACKEND-5 (WP decommission) are obsolete — there is no WordPress to cut over from or decommission via migration; WordPress compatibility is removed outright in BACKEND-2 Phase 1.

#### BACKEND-4 / BACKEND-5 — SUPERSEDED (no WordPress cutover or decommission phase)
The previously planned Transition & Cutover and Architecture Refactoring phases assumed a
live WordPress to migrate away from. With WordPress permanently down, those phases are
removed. Their useful content is redistributed:
- **Data migration** → BACKEND-2 Phase 6 (import WordPress backup if available, else seed).
- **Architecture refactoring (service layer, DI)** → BACKEND-2 Phase 2 (service foundation).
- **Performance optimization / security hardening** → ongoing post-restoration work; HMAC-SHA256 EA auth is deferred (JWT + `X-EA-API-Key` is the model).

- [ ] **Hexagonal / Service-Oriented Architecture** (Priority: MEDIUM)
  - Domain services own DB access, validation, business logic (BACKEND-2 Phase 2)
  - Routes are thin wrappers; services unit-tested in isolation
  - **Evidence**: Architecture review passes; services present

- [ ] **Performance Optimization** (Priority: MEDIUM)
  - Database query optimization
  - Implement connection pooling
  - Configure CDN for static assets
  - **Evidence**: Performance benchmarks meet targets (<500ms most endpoints)

- [ ] **Security Hardening** (Priority: HIGH)
  - Enforce JWT (Bearer) for user routes; `X-EA-API-Key` for `/api/ea/*`
  - Configure WAF rules; security audit logging
  - (HMAC-SHA256 deferred)
  - **Evidence**: Security audit passes

#### Cleanup & Monitoring (Week 11-12)
**Dependency**: BACKEND-5 complete

- [ ] **Infrastructure Cleanup** (Priority: MEDIUM)
  - Remove deprecated WordPress code
  - Clean up temporary sync scripts
  - Archive old API versions
  - **Evidence**: Codebase cleanup complete

- [ ] **Monitoring & Alerting** (Priority: HIGH)
  - Configure application monitoring (Datadog/New Relic)
  - Set up error tracking (Sentry)
  - Configure log aggregation
  - Implement health check dashboards
  - **Evidence**: Monitoring operational, alerts configured

- [ ] **Documentation Updates** (Priority: MEDIUM)
  - Update API documentation
  - Document architecture decisions
  - Create runbooks for operations
  - Update deployment procedures
  - **Evidence**: Documentation complete and reviewed

**Success Criteria**:
- WordPress fully decommissioned
- All traffic migrated to TanStack backend
- Performance targets met (p95 <200ms)
- Security audit passes
- Monitoring and alerting operational
- Documentation complete

---

## WordPress Integration Strategy — RETIRED (WordPress permanently down)

> **Entire section obsolete (2026-07-17).** With no live WordPress, there is no shadow
> mode, cutover, rollback-to-WordPress, or decommission procedure. Data migration is now
> BACKEND-2 Phase 6 (backup import or seed). The subsections below are retained only as
> historical record.

### Shadow Mode Architecture (RETIRED)

**Phase 1: Read-Only Shadow** (Week 6-7)
- TanStack backend reads from WordPress via sync service
- WordPress remains primary write target
- TanStack validates data parity
- No production traffic to TanStack

**Phase 2: Dual-Write Shadow** (Week 7)
- MT5 EA writes to both WordPress and TanStack
- WordPress remains primary for dashboard reads
- TanStack validates write parity
- Gradual traffic shift to TanStack reads

**Phase 3: Primary Cutover** (Week 8)
- TanStack becomes primary write target
- WordPress becomes fallback
- Dashboard reads from TanStack
- WordPress kept for rollback capability

**Phase 4: Decommission** (Week 9-10)
- WordPress completely removed
- TanStack sole backend
- WordPress infrastructure archived

### Data Verification Strategy

**Real-Time Validation**
- Shadow validation endpoint runs every 5 minutes
- Compares WordPress vs TanStack data
- Alerts on any mismatches >0.1%
- Automated rollback on critical mismatches

**Batch Validation**
- Daily full data comparison
- Historical data integrity checks
- Row count validation
- Schema consistency validation

**Manual Validation**
- Weekly parity reports
- Spot checks of critical data points
- User acceptance testing
- Performance benchmarking

### Rollback Strategy (RETIRED — no WordPress to roll back to)

**Automatic Rollback Triggers**
- Error rate >5% for 5 minutes
- Data parity <99% for 10 minutes
- Response time p95 >1s for 5 minutes
- Database connection failures

**Manual Rollback Procedure**
1. Switch DNS back to WordPress
2. Verify WordPress operational
3. Investigate TanStack failure
4. Fix issue in staging environment
5. Re-test shadow mode
6. Schedule retry cutover

**Rollback Testing**
- Test rollback procedures weekly during shadow mode
- Document rollback times and success rates
- Refine rollback procedures based on testing

### Cutover Checklist (RETIRED)

**Pre-Cutover** (24 hours before)
- [ ] Shadow mode parity 100% for 7+ days
- [ ] All automated tests passing
- [ ] Rollback procedures tested and documented
- [ ] Stakeholders notified of maintenance window
- [ ] Backup procedures verified
- [ ] Monitoring and alerting configured

**During Cutover** (Maintenance window)
- [ ] Execute final WordPress → TanStack sync
- [ ] Switch DNS to TanStack backend
- [ ] Monitor error rates and response times
- [ ] Verify data integrity
- [ ] Test critical user flows
- [ ] Confirm rollback not needed

**Post-Cutover** (24 hours after)
- [ ] Monitor system health continuously
- [ ] Validate data parity
- [ ] Review error logs and metrics
- [ ] Document any issues and resolutions
- [ ] Update stakeholders on success
- [ ] Plan WordPress decommission timeline

### Decommission Checklist (RETIRED)

**Pre-Decommission** (1 week before)
- [ ] TanStack backend stable for 14+ days
- [ ] All traffic migrated to TanStack
- [ ] No WordPress dependencies remaining
- [ ] WordPress database archived
- [ ] Stakeholders approve decommission

**During Decommission**
- [ ] Disable WordPress write endpoints
- [ ] Remove WordPress from load balancer
- [ ] Stop WordPress services
- [ ] Archive WordPress codebase
- [ ] Clean up WordPress infrastructure

**Post-Decommission**
- [ ] Verify no WordPress references remain
- [ ] Confirm cost savings (infrastructure)
- [ ] Update documentation
- [ ] Archive decommission artifacts

---

## Deployment Infrastructure

### Environments

**Development** (Local)
- Nitro dev server on localhost:3000
- Local Supabase instance (via Docker)
- Frontend `VITE_API_URL=http://localhost:3000/api` (no WordPress)
- Environment: `.env.local`

**Staging** (Cloudflare Workers)
- Nitro build with Cloudflare preset
- Supabase staging project
- Environment: `.env.staging`

**Production** (Cloudflare Workers)
- Nitro build with Cloudflare preset
- Supabase production project
- Environment: `.env.production`

### Secrets Management

**Supabase**
- `SUPABASE_URL` - Project URL
- `SUPABASE_ANON_KEY` - Anonymous access key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access key
- `DATABASE_URL` - PostgreSQL connection string

**Authentication**
- `JWT_SECRET` - JWT signing secret
- `EA_API_KEY` - MT5 EA authentication key (validated as `X-EA-API-Key`)

**Cloudflare**
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token

> **Removed (2026-07-17):** `WORDPRESS_API_URL` / `WORDPRESS_API_KEY` — WordPress is permanently down.

### Cloudflare Workers Deployment

**Build Configuration**
```bash
# Build for Cloudflare Workers
NITRO_PRESET=cloudflare-module npm run build

# Deploy to Cloudflare
npx wrangler deploy
```

**Configuration**
- `wrangler.jsonc` - Cloudflare Workers configuration
- `nitro.config.ts` - Nitro preset override
- Environment variables via Cloudflare secrets

**DNS Configuration**
- API domain: `api.smartfib.com`
- CNAME to Cloudflare Workers
- SSL/TLS via Cloudflare
- DNS failover to WordPress during cutover

### Monitoring & Logging

**Application Monitoring**
- Datadog APM for performance monitoring
- Custom metrics for API endpoints
- Database query performance tracking
- Error rate and latency monitoring

**Error Tracking**
- Sentry for error aggregation
- Stack trace collection
- User context tracking
- Alert configuration

**Log Aggregation**
- Cloudflare Workers logs
- Supabase query logs
- Application logs via structured JSON
- Log retention policy (30 days)

**Health Checks**
- `/api/health` endpoint
- Database connectivity check
- External service availability (MT5 EA reachability, optional)
- Automated health checks every 30 seconds

### CI/CD Pipeline

**GitHub Actions Workflow**
```yaml
# .github/workflows/backend-deploy.yml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm install
      - name: Type check
        run: npm run typecheck
      - name: Integration tests
        run: npm run test:integration

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Cloudflare Staging
        run: npx wrangler deploy --env staging

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main' && github.event_name == 'release'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Cloudflare Production
        run: npx wrangler deploy --env production
```

**Deployment Safety**
- Automatic tests must pass before deployment
- Staging deployment required before production
- Manual approval for production deployments
- Rollback capability on deployment failure

---

## Risk Management

### Critical Risks

**Risk 1: Phase 4 Parity Gate Fails**
- **Impact**: Backend migration blocked, timeline delayed
- **Mitigation**: Complete BACKEND-0/BACKEND-1 in parallel, pause at BACKEND-2
- **Contingency**: Focus resources on MT5 engine fixes, resume backend later

**Risk 2: Shadow Mode Parity Issues**
- **Impact**: Cutover delayed, data inconsistency
- **Mitigation**: Extended shadow mode (14+ days), comprehensive validation
- **Contingency**: Fix parity issues before cutover, extend shadow mode

**Risk 3: Cutover Failure**
- **Impact**: Downtime, user impact, data loss
- **Mitigation**: Comprehensive rollback procedures, maintenance window
- **Contingency**: Immediate rollback to WordPress, investigate failure

**Risk 4: Performance Degradation**
- **Impact**: Poor user experience, system instability
- **Mitigation**: Load testing, performance monitoring, gradual migration
- **Contingency**: Scale infrastructure, optimize queries, rollback if needed

### Risk Mitigation Timeline

**Immediate Phase** (Week 1-2)
- Complete BACKEND-0/BACKEND-1 to establish foundation
- No dependency on Phase 4 completion
- Low risk, high value work

**Medium Phase** (Week 3-6)
- BACKEND-2/BACKEND-3 gated on Phase 4 completion
- Shadow mode provides safety net
- Medium risk, medium value work

**Long Term Phase** (Week 7-12)
- Cutover and decommission highest risk
- Comprehensive rollback procedures
- High risk, high value work

---

## Success Metrics

### Technical Metrics

**Backend Foundation** (Week 1-2)
- Integration tests: 39+ passing
- Type checking: 0 errors
- API documentation: 100% coverage
- Health check: 100% uptime

**Shadow Mode** (Week 6)
- Data parity: 100%
- Sync frequency: Every 5 minutes
- Error rate: <0.1%
- Validation endpoint: Operational

**Cutover** (Week 8)
- Downtime: <5 minutes
- Error rate: <1%
- Response time p95: <200ms
- Rollback success: 100%

**Post-Migration** (Week 12)
- Performance: Targets met
- Security: Audit passes
- Monitoring: Operational
- Documentation: Complete

### Business Metrics

**User Impact**
- Zero data loss
- Minimal downtime (<5 minutes)
- No feature regression
- Improved performance

**Operational Impact**
- Reduced infrastructure costs
- Simplified architecture
- Improved developer experience
- Enhanced security posture

**Strategic Impact**
- Platform modernization
- Scalability improvements
- Technical debt reduction
- Future-readiness for new features

---

## Next Actions

### Immediate (This Week)
1. Complete provider wiring (Supabase client, connection pooling, health check)
2. Create API documentation for BACKEND-1 endpoints
3. Prepare staging environment for live-DB validation
4. Monitor Phase 4 progress
5. Begin BACKEND-2 implementation planning

### Short Term (Next 2 Weeks)
1. Monitor Phase 4 progress
2. Prepare BACKEND-2 implementation plan
3. Set up staging environment
4. Configure CI/CD pipeline
5. Begin WordPress client implementation

### Medium Term (Next 4-6 Weeks)
1. Execute BACKEND-2 (after Phase 4 gate passes)
2. Execute BACKEND-3
3. Implement shadow mode sync
4. Configure monitoring and alerting
5. Test rollback procedures

### Long Term (Next 8-12 Weeks)
1. Execute gradual endpoint migration
2. Perform data migration
3. Execute cutover
4. Decommission WordPress
5. Complete architecture refactoring

---

## Appendix

### Current Implementation Status

**BACKEND-0**: 90% Complete
- ✅ Database layer (Drizzle ORM, Supabase schema, migrations)
- ✅ Database queries (fib-levels, users, ea-sessions, refresh-sessions)
- ✅ Integration tests (47 passing)
- ✅ Shared contracts package (already authored in packages/contracts; runtime adoption gated on Phase 5/6 per migration-status.md)
- ⏳ Provider wiring (Supabase client, connection pooling, health check)

**BACKEND-1**: 100% Complete
- ✅ Auth utilities (JWT, password hashing, middleware)
- ✅ Auth endpoints (login, register, me, refresh)
- ✅ EA endpoints (fib-levels submission)
- ✅ Market data endpoints (fib-levels retrieval)
- ✅ Settings endpoint (GET/PUT/POST/PATCH /api/user/settings, transaction with row-locking `SELECT ... FOR UPDATE` + application deep merge, 47/47 tests)
- ⏳ API documentation (deferred to deployment phase)

**BACKEND-2 (WordPress-Free Restoration)**: IN-PROGRESS (started 2026-07-17) — 7 sub-phases, 15–23 days. See [`backend-2-restoration-plan.md`](./backend-2-restoration-plan.md).
**BACKEND-3 / BACKEND-4 / BACKEND-5**: SUPERSEDED — folded into BACKEND-2 (signal endpoints, service layer, data migration); no WordPress cutover/decommission phase.

### Key Dependencies

**External Dependencies**
- Supabase (PostgreSQL database)
- Cloudflare Workers (serverless platform)

**Internal Dependencies**
- Phase 4 MT5 fib engine (separate validation track; backend restoration does not wait for it)
- Frontend dashboard (requires backend API contracts via `VITE_API_URL`)
- MT5 EA (requires backend endpoints; read-only ingest first)

### Documentation References

- `docs/architecture/BACKEND_MIGRATION_IMPLEMENTATION_PLAN.md` - Detailed implementation plan
- `backend/README.md` - Backend setup and configuration
- `.github/migration-status.md` - Overall migration status
- `AGENTS.md` - Agent operating model and skill governance

### Contact & Escalation

**Backend Migration Lead**: admin
**Phase 4 MT5 Lead**: admin
**Infrastructure Lead**: TBD

**Escalation Path**
1. Technical issues → Backend Migration Lead
2. Phase 4 coordination → Project Manager
3. Infrastructure issues → Infrastructure Lead
4. Business decisions → Project Stakeholders

---

**Last Updated**: 2026-07-17
**Next Review**: 2026-07-24
**Status**: Immediate Phase in progress — BACKEND-1 settings endpoint COMPLETE (PR #430); remaining: API documentation, auth hardening
