# Backend Migration Implementation Plan

**Status**: Ready for Implementation  
**Scope**: Phase 4 Critical Endpoints + Core Auth/Session (6 endpoints total)  
**Strategy**: Shadow Mode → WordPress Parity Validation → Cutover  
**Database**: PostgreSQL via Supabase (immediate setup)  
**Deployment**: Local Nitro Dev Server → Cloudflare Workers (post-Phase 4)  
**Security**: X-EA-API-Key for Phase 4 → HMAC-SHA256 post-cutover

---

## Phase 0: Prerequisites & Setup (Day 0-1)

### 0.1 Supabase Project Setup
- [ ] Create Supabase project at supabase.com
- [ ] Note project URL, anon key, service role key
- [ ] Enable Database, Auth, and Realtime
- [ ] Configure Auth: Email/Password provider enabled, JWT expiry 1h
- [ ] Save credentials to `.env.local` (never commit)

```bash
# .env.local (gitignored)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
EA_API_KEY=ea-secure-key-change-in-production
JWT_SECRET=super-secret-change-in-production
```

### 0.2 Database Schema Migration (PostgreSQL)

```sql
-- supabase/migrations/001_initial_schema.sql

-- Users (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'ea')),
  ea_api_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fib Levels (EA submissions)
CREATE TABLE public.fib_levels (
  id BIGSERIAL PRIMARY KEY,
  ea_api_key TEXT NOT NULL REFERENCES public.users(ea_api_key),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  fib_data JSONB NOT NULL,
  current_price DECIMAL(20,8),
  trend TEXT CHECK (trend IN ('bullish', 'bearish', 'neutral')),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ea_api_key, symbol, timeframe, calculated_at)
);

CREATE INDEX idx_fib_levels_lookup ON fib_levels(symbol, timeframe, calculated_at DESC);
CREATE INDEX idx_fib_levels_ea ON fib_levels(ea_api_key, received_at DESC);

-- Market Data (Dashboard fetches)
CREATE TABLE public.market_data (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  fib_levels JSONB NOT NULL,
  current_price DECIMAL(20,8),
  trend TEXT CHECK (trend IN ('bullish', 'bearish', 'neutral')),
  source TEXT DEFAULT 'ea' CHECK (source IN ('ea', 'manual', 'calculated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timeframe, created_at)
);

CREATE INDEX idx_market_data_lookup ON market_data(symbol, timeframe, created_at DESC);

-- EA Sessions (for tracking active EAs)
CREATE TABLE public.ea_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_api_key TEXT NOT NULL REFERENCES public.users(ea_api_key),
  ip_address INET,
  user_agent TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_ping TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error'))
);

CREATE INDEX idx_ea_sessions_ea ON ea_sessions(ea_api_key, status);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fib_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all users" ON public.users
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "EA can insert own fib levels" ON public.fib_levels
  FOR INSERT WITH CHECK (ea_api_key = (SELECT ea_api_key FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can read market data" ON public.market_data
  FOR SELECT USING (true);
CREATE POLICY "EA can insert market data" ON public.market_data
  FOR INSERT WITH CHECK (source = 'ea');
```

### 0.3 Local Dev Environment
- [ ] Install Supabase CLI: `npm i -g supabase`
- [ ] Link project: `supabase link --project-ref <ref>`
- [ ] Push migrations: `supabase db push`
- [ ] Generate types: `supabase gen types typescript --local > apps/web/src/lib/db/types.ts`
- [ ] Install Drizzle ORM: `npm i drizzle-orm @supabase/supabase-js` (in apps/web)

---

## Phase 1: Database Layer & Types (Day 1-2)

### 1.1 Database Client & Schema (apps/web/src/lib/db/)

```
apps/web/src/lib/db/
├── index.ts              # Drizzle client + Supabase connection
├── schema.ts             # Drizzle schema (mirrors Supabase tables)
├── types.ts              # TypeScript types (from supabase gen types)
├── queries/
│   ├── fib-levels.ts     # Fib level CRUD
│   ├── market-data.ts    # Market data queries
│   ├── users.ts          # User/profile queries
│   └── ea-sessions.ts    # EA session tracking
└── migrations/           # Drizzle migrations (mirror Supabase)
```

**apps/web/src/lib/db/index.ts**
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
```

**apps/web/src/lib/db/schema.ts** (Drizzle schema matching Supabase)

### 1.2 Database Queries (apps/web/src/lib/db/queries/)

Key queries needed:
- `createFibLevel(eaApiKey, symbol, timeframe, fibData, currentPrice, trend)`
- `getLatestFibLevels(symbol, timeframe, limit?)`
- `getMarketData(symbol, timeframe, limit?)`
- `createUser(email, password, role, eaApiKey?)`
- `getUserByApiKey(eaApiKey)`
- `getUserById(id)`
- `createEaSession(eaApiKey, ip, userAgent)`
- `updateEaSessionPing(eaApiKey)`

---

## Phase 2: Authentication & EA Middleware (Day 2-3)

### 2.1 Auth Utilities (apps/web/src/lib/auth/)

```
apps/web/src/lib/auth/
├── index.ts              # JWT utilities, password hashing
├── middleware.ts         # Auth middleware for API routes
├── ea-auth.ts           # X-EA-API-Key validation
└── session.ts           # Session management
```

**apps/web/src/lib/auth/ea-auth.ts**
```typescript
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function validateEaApiKey(apiKey: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.eaApiKey, apiKey))
    .limit(1);
  
  if (!user || user.role !== 'ea') {
    return { valid: false, user: null };
  }
  
  // Update last ping
  await db.insert(eaSessions).values({
    eaApiKey: apiKey,
    status: 'connected',
    lastPing: new Date(),
  }).onConflictDoUpdate({
    target: eaSessions.eaApiKey,
    set: { lastPing: new Date(), status: 'connected' }
  });
  
  return { valid: true, user };
}

export function extractEaApiKey(request: Request): string | null {
  return request.headers.get('X-EA-API-Key') || 
         request.headers.get('x-ea-api-key') ||
         null;
}
```

**apps/web/src/lib/auth/middleware.ts**
```typescript
import { createMiddleware } from 'hono/factory';
import { validateEaApiKey, extractEaApiKey } from './ea-auth';
import { createJwt, verifyJwt } from './index';

export const eaAuthMiddleware = createMiddleware(async (c, next) => {
  const apiKey = extractEaApiKey(c.req.raw);
  if (!apiKey) {
    return c.json({ error: 'Missing X-EA-API-Key header' }, 401);
  }
  
  const { valid, user } = await validateEaApiKey(apiKey);
  if (!valid) {
    return c.json({ error: 'Invalid or expired EA API Key' }, 401);
  }
  
  c.set('eaUser', user);
  return next();
});

export const userAuthMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  
  const token = authHeader.slice(7);
  const payload = await verifyJwt(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  
  c.set('user', payload);
  return next();
});
```

### 2.2 Auth API Routes (apps/web/src/routes/api/auth/)

```
apps/web/src/routes/api/auth/
├── login.ts      # POST /api/auth/login
├── register.ts   # POST /api/auth/register
├── me.ts         # GET /api/auth/me
└── logout.ts     # POST /api/auth/logout
```

**login.ts**
```typescript
import { createFactory } from 'hono/factory';
import { db } from '../../lib/db';
import { users } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, createJwt } from '../../lib/auth';

const factory = createFactory();

export const loginRoute = factory.createHandlers(async (c) => {
  const { email, password } = await c.req.json();
  
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  const token = await createJwt({ sub: user.id, email: user.email, role: user.role });
  return c.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});
```

---

## Phase 3: Phase 4 Critical Endpoints (Day 3-4)

### 3.1 EA Fib Levels Submission (apps/web/src/routes/api/ea/fib-levels.ts)

**POST /api/ea/fib-levels** — Matches WordPress `POST /wp-json/smc/v1/ea/fib-levels`

```typescript
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { db } from '../../lib/db';
import { fibLevels, marketData } from '../../lib/db/schema';
import { eaAuthMiddleware } from '../../lib/auth/middleware';

const fibLevelSchema = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']),
  fibData: z.object({
    levels: z.array(z.object({
      level: z.number(),
      price: z.number(),
      label: z.string().optional(),
    })),
    high: z.number(),
    low: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
  }),
  currentPrice: z.number().optional(),
  calculatedAt: z.string().datetime().optional(),
});

const factory = createFactory();

export const createFibLevelRoute = factory.createHandlers(
  eaAuthMiddleware,
  async (c) => {
    const body = await c.req.json();
    const parsed = fibLevelSchema.safeParse(body);
    
    if (!parsed.success) {
      return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
    }
    
    const eaUser = c.get('eaUser');
    const { symbol, timeframe, fibData, currentPrice, calculatedAt } = parsed.data;
    
    // Insert into fib_levels (EA submission log)
    const [fibLevel] = await db.insert(fibLevels).values({
      eaApiKey: eaUser.eaApiKey,
      symbol: symbol.toUpperCase(),
      timeframe,
      fibData,
      currentPrice: currentPrice ?? fibData.fibData?.levels?.[0]?.price ?? null,
      trend: fibData.trend,
      calculatedAt: calculatedAt ? new Date(calculatedAt) : new Date(),
    }).returning();
    
    // Upsert into market_data (dashboard read path)
    await db.insert(marketData).values({
      symbol: symbol.toUpperCase(),
      timeframe,
      fibLevels: fibData,
      currentPrice: currentPrice ?? fibData.fibData?.levels?.[0]?.price ?? null,
      trend: fibData.trend,
      source: 'ea',
    }).onConflictDoUpdate({
      target: [marketData.symbol, marketData.timeframe],
      set: {
        fibLevels: fibData,
        currentPrice: currentPrice ?? fibData.fibData?.levels?.[0]?.price ?? null,
        trend: fibData.trend,
        createdAt: new Date(),
      },
    });
    
    return c.json({ 
      success: true, 
      id: fibLevel.id,
      message: 'Fib levels received and processed' 
    }, 201);
  }
);
```

### 3.2 Market Data Fetch (apps/web/src/routes/api/market-data/fib-levels.ts)

**GET /api/market-data/fib-levels** — Matches WordPress `GET /wp-json/smc/v1/market-data/fib-levels`

```typescript
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { db } from '../../lib/db';
import { marketData } from '../../lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { userAuthMiddleware } from '../../lib/auth/middleware';

const querySchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  timeframe: z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  since: z.string().datetime().optional(),
});

const factory = createFactory();

export const getFibLevelsRoute = factory.createHandlers(
  userAuthMiddleware, // Optional: make public for dashboard, auth for admin
  async (c) => {
    const query = c.req.query();
    const parsed = querySchema.safeParse(query);
    
    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.flatten() }, 400);
    }
    
    const { symbol, timeframe, limit, since } = parsed.data;
    
    const conditions = [];
    if (symbol) conditions.push(eq(marketData.symbol, symbol.toUpperCase()));
    if (timeframe) conditions.push(eq(marketData.timeframe, timeframe));
    if (since) conditions.push(gte(marketData.createdAt, new Date(since)));
    
    const results = await db
      .select()
      .from(marketData)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(marketData.createdAt))
      .limit(limit);
    
    return c.json({
      data: results.map(r => ({
        symbol: r.symbol,
        timeframe: r.timeframe,
        fibLevels: r.fibLevels,
        currentPrice: r.currentPrice,
        trend: r.trend,
        timestamp: r.createdAt,
      })),
      count: results.length,
    });
  }
);
```

---

## Phase 4: User Profile & Session Endpoints (Day 4-5)

### 4.1 User Routes (apps/web/src/routes/api/users/)

**GET /api/users/:id** — User profile for dashboard

```typescript
// apps/web/src/routes/api/users/[id].ts
import { createFactory } from 'hono/factory';
import { db } from '../../../lib/db';
import { users } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { userAuthMiddleware } from '../../../lib/auth/middleware';

const factory = createFactory();

export const getUserRoute = factory.createHandlers(
  userAuthMiddleware,
  async (c) => {
    const id = c.req.param('id');
    const currentUser = c.get('user');
    
    // Users can only view own profile unless admin
    if (currentUser.sub !== id && currentUser.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }
    
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, id)).limit(1);
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json({ user });
  }
);
```

---

## Phase 5: Shadow Mode & Data Sync (Day 5-6)

### 5.1 WordPress → TanStack Sync Service (apps/web/src/lib/sync/)

```
apps/web/src/lib/sync/
├── wordpress-client.ts   # WordPress REST API client
├── sync-service.ts       # Sync orchestration
├── fib-level-sync.ts     # Fib level sync logic
└── scheduler.ts          # Cron scheduler
```

**apps/web/src/lib/sync/wordpress-client.ts**
```typescript
const WP_BASE = process.env.WORDPRESS_API_URL!; // e.g. https://smartfib.com/wp-json/smc/v1
const WP_API_KEY = process.env.WORDPRESS_API_KEY!;

export async function fetchWpFibLevels(params: { symbol?: string; timeframe?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params.symbol) search.set('symbol', params.symbol);
  if (params.timeframe) search.set('timeframe', params.timeframe);
  if (params.limit) search.set('per_page', String(params.limit));
  
  const res = await fetch(`${WP_BASE}/market-data/fib-levels?${search}`, {
    headers: { 'Authorization': `Bearer ${WP_API_KEY}` },
  });
  
  if (!res.ok) throw new Error(`WP fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchWpFibLevelById(id: number) {
  const res = await fetch(`${WP_BASE}/ea/fib-levels/${id}`, {
    headers: { 'Authorization': `Bearer ${WP_API_KEY}` },
  });
  return res.json();
}
```

**apps/web/src/lib/sync/fib-level-sync.ts**
```typescript
import { db } from '../db';
import { fibLevels, marketData } from '../db/schema';
import { fetchWpFibLevels } from './wordpress-client';
import { eq, and } from 'drizzle-orm';

export async function syncFibLevelsFromWordPress(since?: Date) {
  let page = 1;
  let hasMore = true;
  let synced = 0;
  
  while (hasMore) {
    const wpData = await fetchWpFibLevels({ 
      limit: 100, 
      // WordPress uses page-based pagination
    });
    
    if (!wpData.data?.length) break;
    
    for (const item of wpData.data) {
      const calculatedAt = new Date(item.calculated_at || item.date);
      if (since && calculatedAt <= since) {
        hasMore = false;
        break;
      }
      
      // Check if already exists
      const [existing] = await db.select()
        .from(fibLevels)
        .where(and(
          eq(fibLevels.symbol, item.symbol),
          eq(fibLevels.timeframe, item.timeframe),
          eq(fibLevels.calculatedAt, calculatedAt)
        ))
        .limit(1);
      
      if (!existing) {
        await db.insert(fibLevels).values({
          eaApiKey: item.ea_api_key,
          symbol: item.symbol,
          timeframe: item.timeframe,
          fibData: item.fib_data,
          currentPrice: item.current_price,
          trend: item.trend,
          calculatedAt,
          receivedAt: new Date(item.received_at || item.date),
        });
        
        // Also upsert market_data for dashboard
        await db.insert(marketData).values({
          symbol: item.symbol,
          timeframe: item.timeframe,
          fibLevels: item.fib_data,
          currentPrice: item.current_price,
          trend: item.trend,
          source: 'ea',
          createdAt: calculatedAt,
        }).onConflictDoUpdate({
          target: [marketData.symbol, marketData.timeframe],
          set: { fibLevels: item.fib_data, currentPrice: item.current_price, trend: item.trend },
        });
        
        synced++;
      }
    }
    
    page++;
    if (wpData.data.length < 100) hasMore = false;
  }
  
  return { synced, timestamp: new Date() };
}
```

### 5.2 Sync Scheduler (apps/web/src/lib/sync/scheduler.ts)

```typescript
import { syncFibLevelsFromWordPress } from './fib-level-sync';

// Run every 5 minutes in development
export function startShadowSync(intervalMs = 5 * 60 * 1000) {
  let lastSync = new Date(Date.now() - intervalMs);
  
  const runSync = async () => {
    try {
      const result = await syncFibLevelsFromWordPress(lastSync);
      console.log(`[Shadow Sync] ${result.synced} records synced at ${result.timestamp}`);
      lastSync = result.timestamp;
    } catch (err) {
      console.error('[Shadow Sync] Failed:', err);
    }
  };
  
  // Initial sync
  runSync();
  
  // Interval
  const interval = setInterval(runSync, intervalMs);
  
  return () => clearInterval(interval);
}
```

### 5.3 Shadow Mode Validation Endpoint

**GET /api/admin/shadow-validation** — Compare WP vs TanStack data

```typescript
// apps/web/src/routes/api/admin/shadow-validation.ts
export const shadowValidationRoute = factory.createHandlers(
  userAuthMiddleware,
  async (c) => {
    const user = c.get('user');
    if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    
    const { symbol, timeframe, limit = 20 } = c.req.query();
    
    // Fetch from both sources
    const [wpData, tsData] = await Promise.all([
      fetchWpFibLevels({ symbol, timeframe, limit }),
      db.select().from(marketData)
        .where(and(
          symbol ? eq(marketData.symbol, symbol.toUpperCase()) : undefined,
          timeframe ? eq(marketData.timeframe, timeframe) : undefined,
        ))
        .orderBy(desc(marketData.createdAt))
        .limit(limit),
    ]);
    
    // Compare
    const mismatches = [];
    for (let i = 0; i < Math.max(wpData.data.length, tsData.length); i++) {
      const wp = wpData.data[i];
      const ts = tsData[i];
      
      if (!wp && ts) mismatches.push({ type: 'extra_in_tanstack', ts });
      else if (wp && !ts) mismatches.push({ type: 'missing_in_tanstack', wp });
      else if (JSON.stringify(wp.fib_data) !== JSON.stringify(ts.fibLevels)) {
        mismatches.push({ type: 'data_mismatch', wp, ts });
      }
    }
    
    return c.json({
      wordpressCount: wpData.data.length,
      tanstackCount: tsData.length,
      match: mismatches.length === 0,
      mismatches,
    });
  }
);
```

---

## Phase 6: Local Dev Configuration (Day 6)

### 6.1 Nitro Dev Server Config (apps/web/nitro.config.ts)

```typescript
import { defineNitroConfig } from 'nitropack/config';

export default defineNitroConfig({
  devServer: {
    port: 3000,
    host: '0.0.0.0',
  },
  routeRules: {
    '/api/**': { cors: true },
  },
  plugins: ['~/server/plugins/db.ts'],
  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: process.env.DATABASE_URL,
    eaApiKey: process.env.EA_API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    wordpressApiUrl: process.env.WORDPRESS_API_URL,
    wordpressApiKey: process.env.WORDPRESS_API_KEY,
  },
});
```

### 6.2 Database Plugin (apps/web/server/plugins/db.ts)

```typescript
import { db } from '~/lib/db';

export default defineNitroPlugin(() => {
  // Database connection is lazy-initialized via Drizzle
  console.log('[Nitro] Database plugin loaded');
});
```

### 6.3 Package.json Scripts (apps/web/package.json)

```json
{
  "scripts": {
    "dev": "nitropack dev",
    "build": "nitropack build",
    "preview": "nitropack preview",
    "db:push": "supabase db push",
    "db:types": "supabase gen types typescript --local > src/lib/db/types.ts",
    "sync:shadow": "tsx scripts/shadow-sync.ts",
    "validate:shadow": "tsx scripts/validate-shadow.ts"
  }
}
```

---

## Phase 7: Integration Tests (Day 6-7)

### 7.1 Test Setup (apps/web/tests/)

```
apps/web/tests/
├── setup.ts              # Vitest setup
├── integration/
│   ├── auth.test.ts      # Login, register, me
│   ├── ea-fib-levels.test.ts  # POST /api/ea/fib-levels
│   ├── market-data.test.ts    # GET /api/market-data/fib-levels
│   ├── users.test.ts     # GET /api/users/:id
│   └── shadow-sync.test.ts    # Sync validation
└── utils/
    ├── test-db.ts        # Test database helpers
    └── auth-helpers.ts   # Test auth utilities
```

### 7.2 Example Integration Test

```typescript
// apps/web/tests/integration/ea-fib-levels.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, testEaApiKey } from '../utils/test-client';
import { db } from '../../src/lib/db';
import { fibLevels, marketData } from '../../src/lib/db/schema';

describe('POST /api/ea/fib-levels', () => {
  let client: ReturnType<typeof createTestClient>;
  
  beforeAll(async () => {
    client = createTestClient();
    await db.delete(fibLevels);
    await db.delete(marketData);
  });
  
  it('accepts valid EA fib level submission', async () => {
    const payload = {
      symbol: 'EURUSD',
      timeframe: 'H1',
      fibData: {
        levels: [
          { level: 0, price: 1.0850, label: '0%' },
          { level: 0.236, price: 1.0820, label: '23.6%' },
          { level: 0.382, price: 1.0800, label: '38.2%' },
          { level: 0.5, price: 1.0780, label: '50%' },
          { level: 0.618, price: 1.0760, label: '61.8%' },
          { level: 1, price: 1.0720, label: '100%' },
        ],
        high: 1.0850,
        low: 1.0720,
        trend: 'bullish',
      },
      currentPrice: 1.0800,
    };
    
    const res = await client.post('/api/ea/fib-levels', payload, {
      headers: { 'X-EA-API-Key': testEaApiKey },
    });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();
    
    // Verify market_data upsert
    const [market] = await db.select()
      .from(marketData)
      .where(eq(marketData.symbol, 'EURUSD'))
      .limit(1);
    
    expect(market).toBeDefined();
    expect(market.fibLevels.levels).toHaveLength(6);
    expect(market.trend).toBe('bullish');
  });
  
  it('rejects invalid API key', async () => {
    const res = await client.post('/api/ea/fib-levels', {}, {
      headers: { 'X-EA-API-Key': 'invalid-key' },
    });
    
    expect(res.status).toBe(401);
  });
  
  it('validates required fields', async () => {
    const res = await client.post('/api/ea/fib-levels', {
      symbol: 'EURUSD',
      // missing timeframe, fibData
    }, { headers: { 'X-EA-API-Key': testEaApiKey } });
    
    expect(res.status).toBe(400);
  });
});
```

---

## Phase 8: Phase 4 Test Execution & Validation (Day 7-8)

### 8.1 Update Cypress Tests (apps/web/tests/e2e/)

Update base URL in `cypress.config.ts`:
```typescript
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    // ...
  },
});
```

### 8.2 Test Data Seeding Script

```typescript
// apps/web/scripts/seed-phase4-test-data.ts
import { db } from '../src/lib/db';
import { fibLevels, marketData, users } from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/auth';

export async function seedPhase4TestData() {
  // Create test EA user
  const [eaUser] = await db.insert(users).values({
    email: 'ea-test@smartfib.com',
    passwordHash: await hashPassword('testpass123'),
    role: 'ea',
    eaApiKey: 'ea-test-key-phase4',
  }).returning();
  
  // Seed fib levels for Cypress tests
  const testData = [
    { symbol: 'EURUSD', timeframe: 'H1', trend: 'bullish', price: 1.0850 },
    { symbol: 'GBPUSD', timeframe: 'H1', trend: 'bearish', price: 1.2650 },
    { symbol: 'USDJPY', timeframe: 'H4', trend: 'neutral', price: 149.50 },
  ];
  
  for (const d of testData) {
    const fibData = generateFibData(d.price, d.trend);
    
    await db.insert(fibLevels).values({
      eaApiKey: eaUser.eaApiKey,
      symbol: d.symbol,
      timeframe: d.timeframe,
      fibData,
      currentPrice: d.price,
      trend: d.trend,
    });
    
    await db.insert(marketData).values({
      symbol: d.symbol,
      timeframe: d.timeframe,
      fibLevels: fibData,
      currentPrice: d.price,
      trend: d.trend,
      source: 'ea',
    });
  }
  
  console.log('Phase 4 test data seeded');
  return eaUser.eaApiKey;
}
```

### 8.3 Validation Checklist

| Check | Command | Expected |
|-------|---------|----------|
| Local dev server starts | `npm run dev` | `http://localhost:3000` |
| Supabase connection | `npm run db:types` | Types generated |
| Auth endpoints | `npm run test:integration -- auth` | All pass |
| EA fib submission | `npm run test:integration -- ea-fib-levels` | All pass |
| Market data fetch | `npm run test:integration -- market-data` | All pass |
| Shadow sync runs | `npm run sync:shadow` | Logs show sync |
| Shadow validation | `npm run validate:shadow` | `match: true` |
| Cypress Phase 4 | `npm run test:e2e -- --spec "phase4*"` | All pass |

---

## Phase 9: Cloudflare Workers Deployment (Post-Phase 4)

### 9.1 Wrangler Config (apps/web/wrangler.toml)

```toml
name = "smartfib-api"
main = "./output/server/index.mjs"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "smartfib-prod"
database_id = "xxx"

[assets]
directory = "./output/public"
binding = "ASSETS"
```

### 9.2 Cloudflare D1 Migration (Post-Phase 4)
- Export Supabase schema to D1-compatible SQL
- Update Drizzle config for libsql/turso driver
- Deploy: `wrangler deploy`

---

## File Structure Summary

```
apps/web/
├── src/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── index.ts
│   │   │   ├── middleware.ts
│   │   │   ├── ea-auth.ts
│   │   │   └── session.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   ├── types.ts
│   │   │   ├── queries/
│   │   │   └── migrations/
│   │   └── sync/
│   │       ├── wordpress-client.ts
│   │       ├── sync-service.ts
│   │       ├── fib-level-sync.ts
│   │       └── scheduler.ts
│   ├── routes/
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login.ts
│   │       │   ├── register.ts
│   │       │   ├── me.ts
│   │       │   └── logout.ts
│   │       ├── ea/
│   │       │   └── fib-levels.ts
│   │       ├── market-data/
│   │       │   └── fib-levels.ts
│   │       ├── users/
│   │       │   └── [id].ts
│   │       └── admin/
│   │           └── shadow-validation.ts
│   └── server/
│       └── plugins/
│           └── db.ts
├── tests/
│   ├── integration/
│   └── e2e/
├── scripts/
│   ├── seed-phase4-test-data.ts
│   ├── shadow-sync.ts
│   └── validate-shadow.ts
├── nitro.config.ts
├── wrangler.toml
├── drizzle.config.ts
└── package.json
```

---

## Dependencies to Add

```bash
# Database
npm i drizzle-orm @supabase/supabase-js postgres
npm i -D drizzle-kit @types/pg

# Auth
npm i jose bcryptjs
npm i -D @types/bcryptjs

# Validation
npm i zod

# Testing
npm i -D vitest @vitest/coverage-v8 supertest

# Dev
npm i -D tsx
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Supabase connection issues local | Use Supabase CLI local dev (`supabase start`) |
| WordPress API changes | Shadow mode validates parity before cutover |
| EA API key mismatch | Validate key format in middleware, log failures |
| Data loss during sync | Upsert with conflict resolution, idempotent sync |
| Phase 4 tests fail | Seed script ensures deterministic test data |
| Cloudflare Workers limits | Develop locally first, migrate after validation |

---

## Success Criteria

- [ ] All 6 API endpoints return 200/201 for valid requests
- [ ] All 6 API endpoints return 400/401/403 for invalid requests
- [ ] Shadow sync runs every 5min without errors for 24h
- [ ] Shadow validation shows 0 mismatches for 100+ records
- [ ] All Phase 4 Cypress tests pass against TanStack Start
- [ ] Auth flow works: register → login → me → logout
- [ ] EA can submit fib levels, dashboard can fetch them

---

## Next Steps After Approval

1. **Day 0-1**: Supabase setup + schema push
2. **Day 1-2**: Database layer + types
3. **Day 2-3**: Auth middleware + endpoints
4. **Day 3-4**: Phase 4 critical endpoints
4. **Day 4-5**: User endpoints
5. **Day 5-6**: Shadow sync + validation
6. **Day 6-7**: Integration tests + seed scripts
7. **Day 7-8**: Cypress Phase 4 execution + validation

**Estimated: 8 working days to Phase 4 validation**