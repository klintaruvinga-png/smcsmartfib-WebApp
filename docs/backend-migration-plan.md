# SMC SuperFib WebApp Backend Migration Plan (WordPress to TanStack Start)

**Status**: PROPOSED  
**Date**: 2026-07-06  
**Target Architecture**: Full-Stack TanStack Start / Nitro application running on Cloudflare Workers/Pages  

---

## 1. Overview & Objective

With WordPress closed off, the SMC SuperFib WebApp requires a new backend hosting model. Rather than deploying a separate API service, we will migrate all REST endpoints and ingestion handlers directly into the existing **TanStack Start** codebase. 

Because TanStack Start compiles to a serverless Nitro server, it runs natively on **Cloudflare Workers** (matching the current wrangler configuration). This creates a single unified repository and deployment pipeline for both frontend and backend.

---

## 2. Architectural Decisions Required

### A. Database Options (Select One)
We must choose the database backend to replace the WordPress MySQL instance:
1. **Cloudflare D1 (SQLite) [Recommended]**: Edge-native database. Fully managed, zero maintenance, integrated with wrangler. Excellent match for a Cloudflare Pages/Workers deployment.
2. **Supabase / Neon (PostgreSQL)**: Managed PostgreSQL. Ideal if advanced pg-specific extensions or a built-in user authentication service are required.

### B. Authentication Model
We will replace WordPress cookie/nonce auth with:
- **Dashboard Users**: JWT (JSON Web Tokens) stored in HttpOnly, secure cookies (issued via `/api/auth/login`).
- **MT5 EA Ingestion**: Header-based API keys (`X-EA-API-Key`) verified against database settings or runtime secrets.

---

## 3. Database Schema Mapping (SQLite Reference)

Below is the DDL required for the SQLite (D1) database, translated from the original WordPress database prefix (`wp_smc_sf_`):

```sql
-- User Settings & Integration Secrets
CREATE TABLE smc_sf_user_settings (
    user_id TEXT PRIMARY KEY,
    settings TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE smc_sf_integrations (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    encrypted_secret TEXT NULL,
    key_status TEXT NOT NULL DEFAULT 'missing',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
);

-- Market Data (Candles & Price Snapshots)
CREATE TABLE smc_sf_candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    candle_time DATETIME NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT NOT NULL DEFAULT 'twelve-data',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol, timeframe, candle_time)
);

CREATE TABLE smc_sf_snapshots (
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    bid REAL NOT NULL DEFAULT 0,
    ask REAL NOT NULL DEFAULT 0,
    mid REAL NOT NULL DEFAULT 0,
    spread INTEGER NOT NULL DEFAULT 0,
    change_pct_1d REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'twelve-data',
    state TEXT NOT NULL DEFAULT 'offline',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, symbol)
);

CREATE TABLE smc_sf_fib_levels (
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    family TEXT NOT NULL,
    ratio REAL NOT NULL,
    label TEXT NOT NULL,
    price REAL NOT NULL,
    role TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, symbol, family, ratio)
);

-- Signals & Trade Lifecycle
CREATE TABLE smc_sf_signals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    status TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confluence TEXT NOT NULL,
    engine TEXT NOT NULL,
    backend_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE smc_sf_trade_plans (
    signal_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE smc_sf_trade_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    signal_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending-sync',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- MT5 EA Ingestion Telemetry
CREATE TABLE smc_sf_account_telemetry (
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    equity REAL NOT NULL DEFAULT 0,
    margin REAL NOT NULL DEFAULT 0,
    free_margin REAL NOT NULL DEFAULT 0,
    margin_level REAL NOT NULL DEFAULT 0,
    floating_pl REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 0,
    ea_version TEXT NOT NULL,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, account_id, terminal_id)
);

CREATE TABLE smc_sf_trade_positions (
    deterministic_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    position_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    normalized_symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    current_price REAL NOT NULL,
    sl REAL NOT NULL,
    tp REAL NOT NULL,
    volume REAL NOT NULL,
    profit REAL NOT NULL,
    swap REAL NOT NULL DEFAULT 0,
    commission REAL NOT NULL DEFAULT 0,
    magic INTEGER NOT NULL,
    comment TEXT,
    opened_at DATETIME,
    state TEXT NOT NULL DEFAULT 'open',
    ea_version TEXT NOT NULL,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. REST Endpoint API Mapping

The endpoints registered in WordPress (`/wp-json/sniper/v1/*`) will be implemented as file-based routes inside `src/routes/api/`:

| WordPress Endpoints | Target Start API Path | Description |
|---------------------|-----------------------|-------------|
| `GET /health` | `GET /api/health` | Dashboard status check |
| `GET /admin/soak-report` | `GET /api/admin/soak-report` | Retrieve soak test metrics |
| `GET /snapshot/unified` | `GET /api/snapshot/unified` | Unified market snapshot |
| `GET /ladders` | `GET /api/ladders` | Active SF entry/SL/TP ladders |
| `POST /user/settings` | `POST /api/user/settings` | Save user specific dashboard preferences |
| `POST /ea/market-stream` | `POST /api/ea/market-stream` | Ingest live MT5 candles/quotes |
| `POST /ea/heartbeat` | `POST /api/ea/heartbeat` | Health check heartbeat from terminal |
| `POST /ea/account-sync` | `POST /api/ea/account-sync` | Synchronize current equity/margin status |
| `POST /ea/symbol-sync` | `POST /api/ea/symbol-sync` | Synchronize broker symbol properties |

---

## 5. Migration Execution Checklist

- [ ] **Step 1**: Initialize database (D1 bindings in `wrangler.jsonc` or Supabase key configurations).
- [ ] **Step 2**: Create table schemas by running migrations.
- [ ] **Step 3**: Implement `/api/auth/login` and auth session middleware.
- [ ] **Step 4**: Port MT5 EA endpoints (`/api/ea/market-stream`, `/api/ea/heartbeat`, etc.).
- [ ] **Step 5**: Port Dashboard read/write endpoints.
- [ ] **Step 6**: Update `src/lib/api/sniperClient.ts` to call `/api` instead of `trader.stokvelsociety.co.za/wp-json`.
- [ ] **Step 7**: Run integration validation to confirm MT5-to-backend parity.
