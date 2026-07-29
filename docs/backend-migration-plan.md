# SMC SuperFib WebApp Backend Migration Plan (WordPress to TanStack Start)

**Status**: APPROVED (With Revisions)  
**Date**: 2026-07-06  
**Target Architecture**: Full-Stack TanStack Start / Nitro application running on Cloudflare Workers/Pages  
**Database**: PostgreSQL (Supabase, Neon, or Managed PostgreSQL)

> **STRATEGY UPDATE (2026-07-17) — WordPress-Free.**
> WordPress is **permanently down**, so the WordPress dual-write / shadow-sync / cutover
> framing in this plan no longer applies. The authoritative plan is now
> [`plans/backend-2-restoration-plan.md`](../plans/backend-2-restoration-plan.md): a
> service-oriented, zero-WordPress restoration using `VITE_API_URL`, JWT-only auth, and
> domain services (`SnapshotService`, `SignalService`, `ChartService`, `MarketDataService`,
> `TelemetryService`). This document remains useful for its layered architecture, EA
> ingestion security notes, and endpoint mapping, but the dual-write strategy and the
> HMAC post-cutover item are deferred/out of scope.

---

## 1. Overview & Objective

With WordPress **permanently down**, the SMC SuperFib WebApp requires a new backend hosting model. Rather than deploying a separate API service, we will migrate all REST endpoints and ingestion handlers directly into the existing **TanStack Start** codebase. The new WordPress-free plan ([plans/backend-2-restoration-plan.md](../plans/backend-2-restoration-plan.md)) prioritizes restoring frontend functionality via a service-oriented architecture.

Because TanStack Start compiles to a serverless Nitro server, it runs natively on **Cloudflare Workers** (matching the current wrangler configuration). This creates a single unified repository and deployment pipeline for both frontend and backend.

---

## 2. Revised Architectural Design

We will follow a strict layered architectural pattern to decouple transport, business logic, database queries, and persistence:

```
[ HTTP/EA Client ]
       │
       ▼
 [ API Routes ] (Routing, Zod Parsing, CORS, Auth Validation)
       │
       ▼
 [ Services ] (Business Logic, Parity Gates, Validation Rules)
       │
       ▼
[ Repositories ] (Data Access Object / Query Mapping)
       │
       ▼
 [ Database ] (PostgreSQL Instance via Pool Connection)
```

1. **Routes Layer (`src/routes/api/`)**:
   - Handles HTTP transport details, header extraction, Zod schema validation.
   - Delegates business execution to the corresponding Services.
2. **Services Layer (`backend/src/lib/services/`)**:
   - Encapsulates trading domain rules, SF ladder calculations, and heartbeat state transitions.
   - Owns its database access, validation, and business logic directly (per the canonical BACKEND-2 restoration plan — no separate repository layer).
   - Each service returns domain objects, not database rows, and is testable in isolation.
3. **Database Layer (PostgreSQL)**:
   - Primary data storage using Supabase, Neon, or a managed PostgreSQL instance.

---

## 3. Cryptographic EA Ingestion Security

> **Status (2026-07-17):** The HMAC-SHA256 scheme below is **deferred**. The WordPress-free
> BACKEND-2 restoration keeps the existing `X-EA-API-Key` header (validated server-side
> against the `users` table, role `ea`) for `/api/ea/*` ingestion, plus JWT (Bearer) for
> user routes. HMAC replay protection can be added later as a hardening step, not as part
> of the initial restoration.

To prevent replay attacks and secure MT5 EA telemetry writes, we document an HMAC-SHA256 signature verification middleware below — **non-active; deferred hardening** (the live scheme is `X-EA-API-Key` for `/api/ea/*` plus JWT Bearer for user routes):

### Authentication Parameters & Headers:

- `X-Client-ID`: Unique identifier for the MT5 terminal installation.
- `X-Timestamp`: Current UTC epoch timestamp (requests with timestamps older than 5 minutes / 300 seconds are rejected).
- `X-Nonce`: A single-use random UUID to prevent replay attacks (checked against a database cache to ensure uniqueness).
- `X-Signature`: HMAC-SHA256 signature generated using the client's shared API Secret.

### Signature Validation Protocol (non-active — future hardening):

```text
Message = X-Client-ID + ":" + X-Timestamp + ":" + X-Nonce + ":" + Request_Body_String
Expected_Signature = HMAC_SHA256(Message, API_Secret)
Validate(Received_Signature === Expected_Signature)
```

---

## 4. Revised Database Schema (PostgreSQL DDL & Indexing)

> **Naming convention (2026-07-17):** The DDL below uses **unprefixed table names** as the
> canonical standard for the dedicated application database — matching PostgreSQL best
> practice and the WordPress-free BACKEND-2 plan
> ([plans/backend-2-restoration-plan.md](../plans/backend-2-restoration-plan.md)), e.g.
> `users`, `fib_levels`, `candles`, `market_snapshots`, `signals`, `trade_plans`,
> `engine_runs`, `account_telemetry`. Author migration `005_add_phase1_tables.sql` using
> these unprefixed names.

Below is the DDL required for the PostgreSQL database, translating old SQLite types to PostgreSQL types (`SERIAL`, `TIMESTAMP`, `JSONB`, etc.) and adding indexes for query performance.

```sql
-- 1. Users and Profiles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE integrations (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL,
    encrypted_secret TEXT,
    key_status VARCHAR(32) NOT NULL DEFAULT 'missing',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
);

-- 2. Market Data
CREATE TABLE candles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(24) NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    candle_time TIMESTAMP WITH TIME ZONE NOT NULL,
    open DECIMAL(20,8) NOT NULL,
    high DECIMAL(20,8) NOT NULL,
    low DECIMAL(20,8) NOT NULL,
    close DECIMAL(20,8) NOT NULL,
    volume DECIMAL(24,8),
    source VARCHAR(20) NOT NULL DEFAULT 'twelve-data',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol, timeframe, candle_time)
);

CREATE TABLE snapshots (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(24) NOT NULL,
    bid DECIMAL(20,8) NOT NULL DEFAULT 0,
    ask DECIMAL(20,8) NOT NULL DEFAULT 0,
    mid DECIMAL(20,8) NOT NULL DEFAULT 0,
    spread INTEGER NOT NULL DEFAULT 0,
    change_pct_1d DECIMAL(12,6) NOT NULL DEFAULT 0,
    source VARCHAR(20) NOT NULL DEFAULT 'twelve-data',
    state VARCHAR(32) NOT NULL DEFAULT 'offline',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, symbol)
);

CREATE TABLE fib_levels (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(24) NOT NULL,
    family VARCHAR(32) NOT NULL,
    ratio DECIMAL(10,4) NOT NULL,
    label VARCHAR(32) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    role VARCHAR(32) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, symbol, family, ratio)
);

-- 3. Signals & Trade Lifecycle
CREATE TABLE signals (
    id VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(24) NOT NULL,
    direction VARCHAR(8) NOT NULL,
    status VARCHAR(16) NOT NULL,
    verdict VARCHAR(4) NOT NULL,
    confluence TEXT NOT NULL,
    engine JSONB NOT NULL,
    backend_confirmed SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trade_plans (
    signal_id VARCHAR(64) PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trade_queue (
    id VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signal_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'pending-sync',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. EA Telemetry
CREATE TABLE account_telemetry (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id VARCHAR(64) NOT NULL,
    terminal_id VARCHAR(96) NOT NULL,
    balance DECIMAL(20,8) NOT NULL DEFAULT 0,
    equity DECIMAL(20,8) NOT NULL DEFAULT 0,
    margin DECIMAL(20,8) NOT NULL DEFAULT 0,
    free_margin DECIMAL(20,8) NOT NULL DEFAULT 0,
    margin_level DECIMAL(20,8) NOT NULL DEFAULT 0,
    floating_pl DECIMAL(20,8) NOT NULL DEFAULT 0,
    currency VARCHAR(32) NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 0,
    ea_version VARCHAR(64) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, account_id, terminal_id)
);

CREATE TABLE trade_positions (
    deterministic_key VARCHAR(191) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id VARCHAR(64) NOT NULL,
    terminal_id VARCHAR(96) NOT NULL,
    position_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(96) NOT NULL,
    normalized_symbol VARCHAR(64) NOT NULL,
    direction VARCHAR(32) NOT NULL,
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8) NOT NULL,
    sl DECIMAL(20,8) NOT NULL,
    tp DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL,
    profit DECIMAL(20,8) NOT NULL,
    swap DECIMAL(20,8) NOT NULL DEFAULT 0,
    commission DECIMAL(20,8) NOT NULL DEFAULT 0,
    magic BIGINT NOT NULL,
    comment TEXT,
    opened_at TIMESTAMP WITH TIME ZONE,
    state VARCHAR(32) NOT NULL DEFAULT 'open',
    ea_version VARCHAR(64) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Auditing & Security Logs
CREATE TABLE audit_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE used_nonces (
    nonce VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Performance Indexes
CREATE INDEX idx_candles_lookup ON candles (user_id, symbol, timeframe, candle_time DESC);
CREATE INDEX idx_snapshots_user_symbol ON snapshots (user_id, symbol);
CREATE INDEX idx_signals_user_status ON signals (user_id, status, created_at DESC);
CREATE INDEX idx_positions_user_state ON trade_positions (user_id, state);
CREATE INDEX idx_audit_user_event ON audit_events (user_id, event_type, created_at DESC);
CREATE INDEX idx_used_nonces_ttl ON used_nonces (created_at);
```

---

## 5. REST Endpoint API Mapping

All REST API paths are implemented as TS endpoints nested inside `src/routes/api/`. The
**Legacy WP route** column is historical (WordPress is permanently down); the **Start API
Path** is the live target, and **Service** shows the owning domain service from the
BACKEND-2 plan.

| Legacy WP route (down)   | Start API Path                          | Service / Handler                                   |
| ------------------------ | --------------------------------------- | --------------------------------------------------- |
| `GET /health`            | `GET /api/health`                       | `TelemetryService.getEngineHealth`                  |
| `GET /admin/soak-report` | `GET /api/admin/soak-report`            | Admin/soak service                                  |
| `GET /snapshot/unified`  | `GET /api/snapshot/unified`             | `SnapshotService.getUnifiedSnapshot` (BACKEND-2c)   |
| `GET /charts`            | `GET /api/charts`                       | `ChartService.getChartSnapshot` (BACKEND-2c)        |
| `GET /session`           | `GET /api/session`                      | Market session detection (BACKEND-2c)               |
| `GET /live-signals`      | `GET /api/signals`                      | `SignalService.getLiveSignals` (BACKEND-2d)         |
| `GET /ladders`           | `GET /api/ladders`                      | `SignalService.getLadders` (BACKEND-2d)             |
| `GET /account-telemetry` | `GET /api/account-telemetry`            | `TelemetryService.getAccountTelemetry` (BACKEND-2d) |
| `POST /user/settings`    | `GET/PUT/POST/PATCH /api/user/settings` | Settings service (BACKEND-1, done)                  |
| `POST /ea/market-stream` | `POST /api/ea/market-stream`            | `MarketDataService.ingestMarketStream` (BACKEND-2e) |
| `POST /ea/heartbeat`     | `POST /api/ea/heartbeat`                | `TelemetryService.recordHeartbeat` (BACKEND-2e)     |
| `POST /ea/account-sync`  | `POST /api/ea/account-sync`             | `TelemetryService.syncAccount` (BACKEND-2e)         |
| `POST /ea/symbol-sync`   | `POST /api/ea/symbol-sync`              | `MarketDataService.syncSymbols` (BACKEND-2e)        |

---

## 6. Migration Execution Checklist

- [ ] **Step 1**: Initialize PostgreSQL connection pooling in `backend/src/lib/db/`.
- [ ] **Step 2**: Execute SQL schema migrations on PostgreSQL (Supabase/Neon).
- [ ] **Step 3**: Implement authentication session services (JWT Bearer-token validation). (EA HMAC verification is **deferred** — future hardening, not part of the initial restoration; `X-EA-API-Key` is the live EA auth.)
- [ ] **Step 4**: Code the database repository Layer (`backend/src/lib/db/`).
- [ ] **Step 5**: Code business logic layer (`backend/src/lib/services/`).
- [ ] **Step 6**: Code the HTTP request endpoints transport layer (`src/routes/api/`).
- [ ] **Step 7**: Update frontend API client (`src/lib/api/sniperClient.ts`) to request relative `/api` paths.
- [ ] **Step 8**: Perform MT5 integration tests & parity audits to guarantee parity.
