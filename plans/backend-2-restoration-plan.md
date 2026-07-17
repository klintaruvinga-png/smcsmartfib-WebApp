# BACKEND-2 Restoration Plan: WordPress-Free Architecture

> Canonical copy of the Windsurf plan `backend-2-restoration-plan-9f2579.md`.
> Authored 2026-07-17. Supersedes the prior shadow-mode / dual-write BACKEND-2 scope
> (WordPress-as-fallback, `GET /api/admin/shadow-validation`).

Restore the SMC SuperFIB dashboard to working condition by implementing critical
endpoints in dependency order, removing all WordPress dependencies, and establishing
a service-oriented architecture for long-term maintainability.

## Executive Summary

WordPress backend is permanently down; frontend cannot function. This plan implements
a phased endpoint restoration strategy that prioritizes app boot capability first, then
core trading features, then advanced features. All WordPress references are removed,
JWT authentication is standardized, and the backend is refactored around domain
services rather than endpoint-first logic.

## Current State

**Working:**
- TanStack Start backend with auth (login, register, me, refresh)
- Settings endpoint (GET/PUT/PATCH user settings)
- Basic fib-levels ingestion and retrieval
- PostgreSQL schema (users, fib_levels, ea_sessions, refresh_sessions)
- 47 integration tests passing

**Broken:**
- WordPress backend at `https://trader.stokvelsociety.co.za/wp-json` is down
- Frontend points to WordPress via `VITE_SNIPER_BACKEND_URL`
- ~20+ critical endpoints missing (snapshot, charts, signals, ladders, positions, orders, telemetry, etc.)
- MT5 EA cannot write data (WordPress endpoint gone)
- No service layer architecture (current handlers are endpoint-specific)

## Revised BACKEND-2 Scope

**Objective:** Restore frontend functionality with service-oriented architecture, zero
WordPress dependencies.

**Deliverables:**
1. Remove all WordPress references from codebase and configuration
2. Implement Phase 1 endpoints (app boot: auth, settings, snapshot, market-data, charts)
3. Implement Phase 2 endpoints (core trading: signals, ladders, fib-levels, regime, telemetry)
4. Establish domain service layer (SnapshotService, SignalService, ChartService, etc.)
5. Configure frontend to use new backend via `VITE_API_URL`
6. Implement MT5 ingestion pipeline (read-only, no execution)
7. Migrate production data if backup exists, otherwise seed test data
8. Standardize on JWT authentication (no WordPress compatibility)

## Implementation Phases

### Phase 1: Architecture Cleanup & Configuration

**Objective:** Remove WordPress dependencies and configure frontend for new backend.

**Tasks:**
1. Update frontend configuration:
   - Rename `VITE_SNIPER_BACKEND_URL` to `VITE_API_URL` in `.env.example`
   - Update `sniperClient.ts` to use `VITE_API_URL`
   - Remove WordPress nonce fallback logic from `sniperClient.ts`
   - Remove `resolveDefaultBackendUrl()` function (hardcode to `VITE_API_URL`)
   - Update `.env.example` to point to `http://localhost:3000/api` for dev

2. Remove WordPress backend references:
   - Remove `WORDPRESS_API_URL` and `WORDPRESS_API_KEY` from `backend/.env.example`
   - Remove WordPress config from `backend/nitro.config.ts`
   - Remove WordPress sync code from implementation docs
   - Update migration documentation to reflect WordPress-free architecture

3. Database schema additions:
   - Add missing tables for Phase 1/2 endpoints (snapshots, signals, ladders, regimes, telemetry)
   - Create migration `005_add_phase1_tables.sql`
   - Update Drizzle schema accordingly

**Acceptance Criteria:**
- Frontend builds and runs with `VITE_API_URL` configuration
- No runtime or configuration dependency on WordPress remains in the codebase
- Database schema supports Phase 1/2 data models
- Migration documentation updated

### Phase 2: Service Layer Foundation

**Objective:** Establish domain service architecture before implementing endpoints.

**Tasks:**
1. Create service structure:

   ```text
   backend/src/lib/services/
   ├── snapshot/
   │   ├── index.ts           # SnapshotService
   │   ├── queries.ts         # Database queries
   │   └── validators.ts      # Business logic validation
   ├── signal/
   │   ├── index.ts           # SignalService
   │   ├── queries.ts
   │   └── validators.ts
   ├── chart/
   │   ├── index.ts           # ChartService
   │   ├── queries.ts
   │   └── validators.ts
   ├── market/
   │   ├── index.ts           # MarketDataService
   │   ├── queries.ts
   │   └── validators.ts
   └── telemetry/
       ├── index.ts           # TelemetryService
       ├── queries.ts
       └── validators.ts
   ```

2. Implement base service pattern:
   - Each service owns its database access
   - Each service owns its business logic
   - Each service owns its validation
   - Services return domain objects, not database rows
   - Services are testable in isolation

3. Refactor existing handlers to use services:
   - Move `market-data/handlers.ts` logic to `MarketDataService`
   - Move `ea/handlers.ts` logic to appropriate services
   - Update route handlers to be thin wrappers around services

**Acceptance Criteria:**
- Service layer structure created
- Base service pattern established
- Existing handlers refactored to use services
- Integration tests updated to test services directly

### Phase 3: App-Boot Endpoints

**Objective:** Implement endpoints required for app initialization.

**Endpoints to Implement:**

1. `GET /api/snapshot/unified`
   - Returns: `{ prices: PairPrice[], regimes: RegimeState[], gates: GateState[], diagnostics: SymbolDiagnostic[] }`
   - Service: `SnapshotService.getUnifiedSnapshot(userId)`
   - Database: Query latest prices, regimes, gates for user's watchlist

2. `GET /api/charts`
   - Query params: `symbol`, `timeframe`
   - Returns: `{ symbol, timeframe, candles: Candle[], fibLevels: FibLevel[], updatedAt, state }`
   - Service: `ChartService.getChartSnapshot(userId, symbol, timeframe)`
   - Database: Query candles and fib levels for symbol/timeframe

3. `GET /api/session`
   - Returns: `{ name, openUtc, closeUtc, state }`
   - Service: Market session detection logic
   - Database: Optional caching of session state

**Database Schema Additions:**

```sql
-- Snapshots (current market state)
CREATE TABLE market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(24) NOT NULL,
  bid DECIMAL(20,8),
  ask DECIMAL(20,8),
  mid DECIMAL(20,8),
  spread INTEGER,
  change_pct_1d DECIMAL(12,6),
  state VARCHAR(32) DEFAULT 'offline',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Regimes (market regime state)
CREATE TABLE market_regimes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(24) NOT NULL,
  regime VARCHAR(32),
  confidence DECIMAL(5,4),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Gates (signal gate state)
CREATE TABLE signal_gates (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(24) NOT NULL,
  gate VARCHAR(32),
  state VARCHAR(16),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Candles (OHLC data)
CREATE TABLE candles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(24) NOT NULL,
  timeframe VARCHAR(16) NOT NULL,
  candle_time TIMESTAMPTZ NOT NULL,
  open DECIMAL(20,8),
  high DECIMAL(20,8),
  low DECIMAL(20,8),
  close DECIMAL(20,8),
  volume DECIMAL(24,8),
  UNIQUE(user_id, symbol, timeframe, candle_time)
);
```

**Acceptance Criteria:**
- All Phase 1 endpoints implemented and tested
- Frontend can boot and load initial data
- Integration tests pass for all endpoints
- Database schema supports snapshot/regime/gate/candle data

### Phase 4: Core Trading Endpoints

**Objective:** Implement endpoints for market analysis and trading signals.

**Endpoints to Implement:**

1. `GET /api/signals`
   - Query params: `board_size`, `scope` (watchlist|global)
   - Returns: `{ signals: SignalCandidate[], polledAt, meta: { boardSize, totalActive } }`
   - Service: `SignalService.getLiveSignals(userId, options)`
   - Database: Query active signals with filtering

2. `GET /api/ladders`
   - Query params: `symbol` (optional)
   - Returns: `TradePlan[]`
   - Service: `SignalService.getLadders(userId, symbol?)`
   - Database: Query trade plans for user

3. `GET /api/health` (engine health)
   - Returns: `EngineHealth`
   - Service: `TelemetryService.getEngineHealth(userId)`
   - Database: Query latest engine run status

4. `GET /api/account-telemetry`
   - Query params: `account_id`, `terminal_id` (select which connected MT5 account/terminal; optional — returns the latest/primary record when omitted)
   - Returns: `AccountTelemetry` (singular record for the selected account/terminal; `account_telemetry` stores one row per `user_id` + `account_id` + `terminal_id`)
   - Service: `TelemetryService.getAccountTelemetry(userId, accountId?, terminalId?)`
   - Database: Query the matching account/terminal row from `account_telemetry` (EA sessions)

**Database Schema Additions:**

```sql
-- Signals
CREATE TABLE signals (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(24) NOT NULL,
  direction VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL,
  verdict VARCHAR(4) NOT NULL,
  confluence TEXT NOT NULL,
  engine JSONB NOT NULL,
  backend_confirmed SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade Plans (ladders)
CREATE TABLE trade_plans (
  signal_id VARCHAR(64) PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Engine Runs
CREATE TABLE engine_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32),
  symbols_processed INTEGER,
  candles_processed INTEGER,
  signals_generated INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Account Telemetry
CREATE TABLE account_telemetry (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id VARCHAR(64) NOT NULL,
  terminal_id VARCHAR(96) NOT NULL,
  balance DECIMAL(20,8),
  equity DECIMAL(20,8),
  margin DECIMAL(20,8),
  free_margin DECIMAL(20,8),
  margin_level DECIMAL(20,8),
  floating_pl DECIMAL(20,8),
  currency VARCHAR(32),
  leverage INTEGER,
  ea_version VARCHAR(64),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, account_id, terminal_id)
);
```

**Acceptance Criteria:**
- All Phase 4 (core-trading) endpoints implemented and tested
- Frontend can display signals, ladders, and engine health
- Integration tests pass for all endpoints
- Database schema supports signals/trade-plans/engine telemetry

### Phase 5: MT5 Ingestion Pipeline (Read-Only)

**Objective:** Establish MT5 → API data flow without trading execution.

**Database Schema Additions:**

```sql
-- Broker symbol registry (MT5 EA reported symbol list)
CREATE TABLE broker_symbols (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(24) NOT NULL,
  broker VARCHAR(64),
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);
```

**Endpoints to Implement:**

1. `POST /api/ea/market-stream`
   - Auth: `X-EA-API-Key` header
   - Body: Market data snapshot (prices, spreads, sessions)
   - Service: `MarketDataService.ingestMarketStream(eaApiKey, data)`
   - Database: Update market_snapshots table

2. `POST /api/ea/heartbeat`
   - Auth: `X-EA-API-Key` header
   - Body: `{ account_id, terminal_id, status }`
   - Service: `TelemetryService.recordHeartbeat(eaApiKey, data)`
   - Database: Update ea_sessions table

3. `POST /api/ea/account-sync`
   - Auth: `X-EA-API-Key` header
   - Body: Account telemetry data
   - Service: `TelemetryService.syncAccount(eaApiKey, data)`
   - Database: Update account_telemetry table

4. `POST /api/ea/symbol-sync`
   - Auth: `X-EA-API-Key` header
   - Body: List of broker symbols
   - Service: `MarketDataService.syncSymbols(eaApiKey, symbols)`
   - Database: Upsert into `broker_symbols` (per user, by symbol)

**MT5 EA Configuration:**
- Update MT5 EA to point to new backend URL
- Keep execution paused (no order endpoints yet)
- Verify data flow: MT5 → API → Database → Frontend
- Monitor for data consistency and errors

**Acceptance Criteria:**
- MT5 can successfully write market data to new backend
- Heartbeat and account sync working
- Frontend displays real-time MT5 data
- No trading execution (read-only pipeline verified)

### Phase 6: Data Migration Strategy

**Objective:** Handle production data migration or seed test data.

**Option A: WordPress Database Backup Exists**
1. Create migration script:
   - Export WordPress database tables
   - Transform schema to match new PostgreSQL structure
   - Import into Supabase
   - Validate data integrity
   - Create rollback plan

2. Data mapping:
   - `wp_users` → `auth.users` + `public.users`
   - `wp_usermeta` → `public.users.settings` (JSONB)
   - `wp_smc_sf_fib_levels` → `public.fib_levels`
   - Custom WordPress tables → corresponding new schema

**Option B: No WordPress Backup (Seed Data)**
1. Create seed script:
   - Generate test users with realistic settings
   - Generate sample watchlists
   - Generate sample fib levels for major pairs
   - Generate sample signals and trade plans
   - Generate sample market snapshots

2. Seed data categories:
   - User accounts (admin, regular users)
   - Market data (EURUSD, GBPUSD, XAUUSD, etc.)
   - Historical signals and ladders
   - Engine run history
   - Account telemetry

**Acceptance Criteria:**
- Production data migrated OR test data seeded
- Data validation scripts pass
- Frontend can display migrated/seeded data
- Rollback procedure documented (if migration)

### Phase 7: Testing & Validation

**Objective:** Comprehensive testing of restored functionality.

**Testing Tasks:**
1. Integration tests:
   - Test all Phase 1 endpoints
   - Test all Phase 2 endpoints
   - Test all MT5 ingestion endpoints
   - Test service layer independently
   - Test error handling and edge cases

2. End-to-end tests:
   - Frontend boot sequence
   - User login flow
   - Data loading from MT5
   - Signal display and interaction
   - Settings persistence

3. Performance tests:
   - Endpoint response times
   - Database query performance
   - Concurrent user load
   - MT5 data ingestion rate

4. Security tests:
   - JWT token validation
   - EA API key authentication
   - SQL injection prevention
   - XSS prevention
   - CORS configuration

**Acceptance Criteria:**
- All integration tests passing
- E2E tests cover critical user flows
- Performance meets requirements (<500ms for most endpoints)
- Security audit passes
- MT5 data pipeline stable for 24h+

## Database Schema Summary

**New Tables Required:**
- `market_snapshots` - Current market state
- `market_regimes` - Regime analysis
- `signal_gates` - Signal gate states
- `candles` - OHLC candle data
- `signals` - Trading signals
- `trade_plans` - Ladders/trade plans
- `engine_runs` - Engine execution history
- `account_telemetry` - Account metrics

**Existing Tables (Already Implemented):**
- `users` - User profiles and settings
- `fib_levels` - Fib level data
- `ea_sessions` - EA connection tracking
- `refresh_sessions` - JWT refresh tokens

## Service Layer Architecture

**Service Responsibilities:**
- **SnapshotService**: Unified market state (prices, regimes, gates)
- **SignalService**: Signal generation, ladders, trade plans
- **ChartService**: Candle data, fib levels for charts
- **MarketDataService**: Price ingestion, symbol management
- **TelemetryService**: Engine health, account metrics, heartbeats
- **AuthService**: User authentication, session management
- **SettingsService**: User preferences and configuration

**Service Pattern:**

```typescript
// Example service structure
class SnapshotService {
  async getUnifiedSnapshot(userId: string): Promise<UnifiedSnapshot> {
    // 1. Validate user has access
    // 2. Query database for latest data
    // 3. Apply business logic (filtering, transformation)
    // 4. Return domain object
  }

  async updateSnapshot(userId: string, data: SnapshotInput): Promise<Snapshot> {
    // 1. Validate input
    // 2. Apply business rules
    // 3. Persist to database
    // 4. Return updated domain object
  }
}
```

## Frontend Integration

**Configuration Changes:**

```env
# .env.example
VITE_API_URL=http://localhost:3000/api
VITE_SNIPER_MOCK_MODE=false
```

**Client Updates:**
- Remove WordPress-specific logic
- Update API base URL handling
- Ensure JWT token management
- Update error handling for new endpoints

## Migration Documentation Updates

**Files to Update:**
Update `.github/migration-status.md`:
- Mark BACKEND-1 as complete
- Redefine BACKEND-2 scope (this plan)
- Remove WordPress shadow sync references
- Update phase blockers and dependencies
- Add service architecture notes

Update `docs/backend-migration-plan.md`:
- Remove WordPress dual-write strategy
- Update architecture diagrams
- Add service layer documentation
- Update endpoint mapping table

Update `docs/architecture/BACKEND_MIGRATION_IMPLEMENTATION_PLAN.md`:
- Remove shadow sync phases
- Update to match new phased approach
- Add service layer implementation details

## Success Criteria

**Phase 1 Complete:**
- Frontend boots without errors
- User can login
- Settings load and persist
- Basic market data displays

**Phase 2 Complete:**
- Signals display correctly
- Ladders load and render
- Engine health visible
- MT5 data flowing to frontend

**Overall BACKEND-2 Complete:**
- App fully functional for core trading workflows
- Zero WordPress dependencies
- Service layer architecture established
- MT5 ingestion pipeline stable
- Production data migrated or test data seeded
- All tests passing
- Documentation updated

## Timeline Estimate

- **Phase 1 (Architecture Cleanup):** 1-2 days
- **Phase 2 (Service Layer):** 2-3 days
- **Phase 3 (Phase 1 Endpoints):** 3-4 days
- **Phase 4 (Phase 2 Endpoints):** 4-5 days
- **Phase 5 (MT5 Ingestion):** 2-3 days
- **Phase 6 (Data Migration):** 1-3 days (depends on backup availability)
- **Phase 7 (Testing):** 2-3 days

**Total:** 15-23 days

## Risks & Mitigations

**Risk 1: MT5 EA Configuration Complexity**
- Mitigation: Start with read-only pipeline, defer execution
- Fallback: Manual data entry if MT5 integration fails

**Risk 2: Data Migration Issues**
- Mitigation: Create comprehensive migration scripts with rollback
- Fallback: Seed test data and rebuild from scratch

**Risk 3: Service Layer Over-Engineering**
- Mitigation: Keep services simple, evolve as needed
- Fallback: Direct database access if services add complexity

**Risk 4: Frontend Integration Breaking Changes**
- Mitigation: Maintain API compatibility where possible
- Fallback: Update frontend to match new API contracts

## Next Steps

1. Review and approve this plan
2. Begin Phase 1 (Architecture Cleanup)
3. Establish service layer foundation
4. Implement Phase 1 endpoints
5. Validate frontend can boot
6. Continue with Phase 2 endpoints
7. Establish MT5 ingestion
8. Complete data migration
9. Comprehensive testing
10. Deploy and monitor
