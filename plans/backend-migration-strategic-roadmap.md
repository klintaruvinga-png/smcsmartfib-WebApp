# Backend Migration Strategic Roadmap

This roadmap coordinates the WordPress → Node.js/TanStack Start backend migration with Phase 4 MT5 fib engine validation, providing a phased approach that minimizes context switching while ensuring safe cutover from the legacy WordPress backend.

---

## Executive Summary

**Current State**: Phase 4 MT5 fib engine is in read-only testing mode (parity gate not yet passed). Backend migration BACKEND-0 is ~90% complete (database layer, shared contracts already authored, provider wiring done; minor TypeScript config remains) and BACKEND-1 is ~90% complete (auth, critical endpoints, and settings endpoint done; API documentation remaining).

**Strategic Approach**: Complete backend foundation in parallel with Phase 4 validation, then execute shadow-mode sync and controlled cutover after Phase 4 gate passes. This prevents debugging two major systems simultaneously while maintaining project momentum.

**Key Dependencies**: 
- BACKEND-2 through BACKEND-5 are gated on Phase 4 completion
- WordPress cutover requires successful shadow-mode parity validation
- Final migration blocked until MT5 engine is proven stable

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
- ✅ Execute BACKEND-2 (MT5 integration)
- ✅ Execute BACKEND-3 (signal endpoints)
- ✅ Begin shadow-mode sync
- ✅ Plan controlled cutover

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

- [ ] **Provider Wiring** (Priority: HIGH)
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
  - `PUT /api/user/settings` - update user preferences (jsonb PATCH-merge)
  - Schema: notifications, theme, watchlist defaults, risk parameters
  - Integration with existing WordPress usermeta table parity (mapping owned by gated shadow-sync phase)
  - **Evidence**: 8 new integration tests; full suite 47/47 green; `npm run typecheck` clean

- [ ] **Authentication Hardening** (Priority: MEDIUM)
  - Add rate limiting to auth endpoints
  - Implement refresh token rotation validation
  - Add session management middleware
  - Configure JWT expiry policies (access: 15m, refresh: 7d)
  - **Evidence**: Security audit passes, load tests pass

- [ ] **API Documentation** (Priority: MEDIUM)
  - Document all BACKEND-1 endpoints with OpenAPI/Swagger
  - Add request/response examples
  - Document error codes and recovery procedures
  - **Evidence**: `/docs/api` endpoint available

**Success Criteria**:
- All BACKEND-0/BACKEND-1 integration tests passing (39+ tests)
- Shared contracts package consumable by frontend
- Settings endpoint achieves WordPress parity
- Health check confirms DB connectivity
- Type checking passes without errors

---

### Medium Phase (Weeks 3-6): Integration & Shadow Mode

**Objective**: Execute BACKEND-2 and BACKEND-3, establish shadow-mode sync with WordPress.

#### BACKEND-2: MT5 Integration (Week 3-4)
**Dependency**: Phase 4 gate MUST PASS before starting

- [ ] **MT5 Dual-Write Configuration** (Priority: CRITICAL)
  - Configure MT5 EA to write to both WordPress and TanStack endpoints
  - Implement fallback mechanism (WordPress primary, TanStack secondary)
  - Add write confirmation and retry logic
  - Configure dual-write monitoring and alerts
  - **Evidence**: MT5 logs show successful dual-writes, error rates <1%

- [ ] **EA Bridge Endpoints** (Priority: HIGH)
  - `POST /api/ea/heartbeat` - MT5 heartbeat ingestion
  - `POST /api/ea/account-sync` - account metadata sync
  - `POST /api/ea/symbol-sync` - broker symbol sync
  - `GET /api/ea/license-check` - license validation
  - Parity with existing WordPress EA routes
  - **Evidence**: Integration tests pass, MT5 EA connects successfully

- [ ] **Telemetry Pipeline** (Priority: MEDIUM)
  - Implement MT5 → backend telemetry ingestion
  - Add candle data streaming endpoints
  - Configure freshness monitoring
  - Add stale-data detection and alerting
  - **Evidence**: Real-time telemetry dashboard operational

#### BACKEND-3: Signal & Plan Endpoints (Week 5-6)
**Dependency**: BACKEND-2 complete

- [ ] **Signal Processing Endpoints** (Priority: HIGH)
  - `POST /api/signals/generate` - signal generation requests
  - `GET /api/signals/:id` - signal retrieval
  - `GET /api/signals/history` - signal history
  - Integration with MT5 signal engine
  - **Evidence**: Signal generation matches MT5 output

- [ ] **Trade Planning Endpoints** (Priority: HIGH)
  - `POST /api/trade-plans` - create trade plan
  - `GET /api/trade-plans/:id` - retrieve trade plan
  - `PUT /api/trade-plans/:id` - update trade plan
  - `DELETE /api/trade-plans/:id` - delete trade plan
  - Integration with dashboard plan cards
  - **Evidence**: Dashboard plan cards functional

- [ ] **Regime & Chop Data** (Priority: MEDIUM)
  - `GET /api/market-data/regime` - regime classification
  - `GET /api/market-data/chop-score` - chop score calculation
  - Integration with MT5 regime engine
  - **Evidence**: Regime data matches MT5 calculations

#### Shadow Mode Setup (Week 6)
**Dependency**: BACKEND-3 complete

- [ ] **WordPress Client Implementation** (Priority: CRITICAL)
  - Create `backend/src/lib/sync/wordpress-client.ts`
  - Implement authenticated WordPress REST API client
  - Add timeout and retry logic
  - Configure rate limiting
  - **Evidence**: Successful WordPress API calls in logs

- [ ] **Shadow Sync Service** (Priority: CRITICAL)
  - Create `backend/src/lib/sync/fib-level-sync.ts`
  - Implement WordPress → TanStack fib level sync
  - Add incremental sync (since timestamp)
  - Configure sync frequency (5min intervals)
  - **Evidence**: Sync logs show record counts matching WordPress

- [ ] **Sync Scheduler** (Priority: HIGH)
  - Create `backend/src/lib/sync/scheduler.ts`
  - Implement cron-based sync scheduling
  - Add error handling and retry logic
  - Configure sync monitoring and alerts
  - **Evidence**: Scheduled syncs running every 5 minutes

- [ ] **Shadow Validation Endpoint** (Priority: HIGH)
  - `GET /api/admin/shadow-validation` - parity comparison
  - Implement bidirectional parity checks
  - Add mismatch reporting and alerting
  - Configure validation thresholds
  - **Evidence**: Validation endpoint returns 100% parity

**Success Criteria**:
- MT5 dual-write operational with <1% error rate
- All signal/plan endpoints functional
- Shadow sync achieves 100% parity with WordPress
- Validation endpoint confirms data consistency
- No data loss during sync operations

---

### Long Term Phase (Weeks 7-12): Cutover & Decommission

**Objective**: Execute BACKEND-4 and BACKEND-5, perform controlled cutover, retire WordPress.

#### BACKEND-4: Transition & Cutover (Week 7-8)
**Dependency**: Shadow mode parity 100% for 7+ days

- [ ] **Gradual Endpoint Migration** (Priority: CRITICAL)
  - Migrate read-only endpoints first (market data, user profile)
  - Monitor error rates and performance
  - Add feature flags for rollback capability
  - Configure DNS failover
  - **Evidence**: Gradual migration plan approved, rollback tested

- [ ] **Data Migration** (Priority: CRITICAL)
  - Migrate historical data from WordPress to Supabase
  - Validate data integrity post-migration
  - Configure data backup and recovery
  - Test data rollback procedures
  - **Evidence**: Data validation passes, backup confirmed

- [ ] **Cutover Execution** (Priority: CRITICAL)
  - Schedule maintenance window (low-traffic period)
  - Execute final WordPress → TanStack sync
  - Switch DNS to point to TanStack backend
  - Monitor system health and error rates
  - **Evidence**: Successful cutover, <5min downtime

- [ ] **Rollback Procedures** (Priority: HIGH)
  - Document rollback triggers and procedures
  - Test rollback to WordPress
  - Configure automated rollback on critical errors
  - **Evidence**: Rollback tested and documented

#### BACKEND-5: Architecture Refactoring (Week 9-10)
**Dependency**: BACKEND-4 complete, WordPress cutover successful

- [ ] **WordPress Decommission** (Priority: HIGH)
  - Disable WordPress write endpoints
  - Archive WordPress database
  - Remove WordPress from load balancer
  - Clean up WordPress infrastructure
  - **Evidence**: WordPress infrastructure decommissioned

- [ ] **Hexagonal Architecture Implementation** (Priority: MEDIUM)
  - Refactor to hexagonal architecture (ports/adapters)
  - Implement domain layer separation
  - Add dependency injection
  - **Evidence**: Architecture review passes

- [ ] **Performance Optimization** (Priority: MEDIUM)
  - Database query optimization
  - Add caching layers (Redis)
  - Implement connection pooling
  - Configure CDN for static assets
  - **Evidence**: Performance benchmarks meet targets

- [ ] **Security Hardening** (Priority: HIGH)
  - Implement HMAC-SHA256 for EA authentication
  - Add request signing validation
  - Configure WAF rules
  - Implement security audit logging
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

## WordPress Integration Strategy

### Shadow Mode Architecture

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

### Rollback Strategy

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

### Cutover Checklist

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

### Decommission Checklist

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
- Mock WordPress for testing
- Environment: `.env.local`

**Staging** (Cloudflare Workers)
- Nitro build with Cloudflare preset
- Supabase staging project
- WordPress staging instance
- Environment: `.env.staging`

**Production** (Cloudflare Workers)
- Nitro build with Cloudflare preset
- Supabase production project
- WordPress production (during shadow mode)
- Environment: `.env.production`

### Secrets Management

**Supabase**
- `SUPABASE_URL` - Project URL
- `SUPABASE_ANON_KEY` - Anonymous access key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access key
- `DATABASE_URL` - PostgreSQL connection string

**Authentication**
- `JWT_SECRET` - JWT signing secret
- `EA_API_KEY` - MT5 EA authentication key

**WordPress Integration**
- `WORDPRESS_API_URL` - WordPress REST API URL
- `WORDPRESS_API_KEY` - WordPress API key for sync

**Cloudflare**
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token

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
- External service availability (WordPress API)
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
1. Complete shared contracts package
2. Fix npm scripts (typecheck, test:integration)
3. Implement settings endpoint
4. Add authentication hardening
5. Create API documentation

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

**BACKEND-0**: 75% Complete
- ✅ Database layer (Drizzle ORM, Supabase schema, migrations)
- ✅ Database queries (fib-levels, users, ea-sessions, refresh-sessions)
- ✅ Integration tests (47 passing)
- ✅ Shared contracts package (already authored in packages/contracts; runtime adoption gated on Phase 5/6 per migration-status.md)
- ⏳ Provider wiring

**BACKEND-1**: 70% Complete
- ✅ Auth utilities (JWT, password hashing, middleware)
- ✅ Auth endpoints (login, register, me, refresh)
- ✅ EA endpoints (fib-levels submission)
- ✅ Market data endpoints (fib-levels retrieval)
- ✅ Settings endpoint (GET/PUT /api/user/settings, jsonb PATCH-merge, 47/47 tests)
- ⏳ API documentation

**BACKEND-2 through BACKEND-5**: NOT STARTED

### Key Dependencies

**External Dependencies**
- Supabase (PostgreSQL database)
- Cloudflare Workers (serverless platform)
- WordPress (legacy backend during transition)

**Internal Dependencies**
- Phase 4 MT5 fib engine (must pass parity gate)
- Frontend dashboard (requires backend API contracts)
- MT5 EA (requires backend endpoints)

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
