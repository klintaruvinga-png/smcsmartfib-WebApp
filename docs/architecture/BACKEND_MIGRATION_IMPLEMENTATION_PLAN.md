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

> Canonical source of truth: `backend/src/db/migrations/001_init.sql`. The
> snippet below mirrors it. Note: there is **no** `market_data` table — the
> dashboard reads directly from `fib_levels` (grouped by timeframe → family →
> ratio), which matches WordPress parity exactly.

```sql
-- backend/src/db/migrations/001_init.sql

-- Users (extends Supabase auth.users)
CREATE TABLE public.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT UNIQUE NOT NULL,
  username     TEXT UNIQUE,
  full_name    TEXT,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'user'
                 CHECK (role IN ('user', 'admin', 'ea')),
  ea_api_key   TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_ea_api_key ON public.users(ea_api_key);

-- Fib Levels (EA submissions). Granularity matches WordPress wp_smc_sf_fib_levels.
-- UNIQUE KEY fib_lookup excludes calculated_at so the ingest endpoint upserts
-- (ON CONFLICT DO UPDATE) the latest value per (user, symbol, tf, family, ratio)
-- — mirroring WordPress wpdb->replace semantics.
CREATE TABLE public.fib_levels (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ea_api_key    TEXT NOT NULL REFERENCES public.users(ea_api_key)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  symbol        VARCHAR(24) NOT NULL,
  timeframe     VARCHAR(16) NOT NULL
                  CHECK (timeframe IN ('M15', 'H1', 'H4', 'D1')),
  family        VARCHAR(16) NOT NULL
                  CHECK (family IN ('LTF_SF', 'HTF_AF')),
  ratio         DECIMAL(10, 4) NOT NULL
                  CHECK (ratio IN (-200,-162.5,-100,-62.5,-25,0,25,50,62.5,75,100,125,162.5,200,262.5,300)),
  price         DECIMAL(20, 8) NOT NULL,
  source        VARCHAR(20) NOT NULL DEFAULT 'mt5',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fib_lookup UNIQUE (user_id, symbol, timeframe, family, ratio)
);

CREATE INDEX idx_fib_levels_lookup
  ON public.fib_levels (user_id, symbol, timeframe, family, calculated_at DESC);
CREATE INDEX idx_fib_levels_symbol_time
  ON public.fib_levels (user_id, symbol, calculated_at DESC);

-- EA Sessions (connection / heartbeat tracking)
CREATE TABLE public.ea_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_api_key   TEXT NOT NULL REFERENCES public.users(ea_api_key)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address   INET,
  user_agent   TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'connected'
                 CHECK (status IN ('connected', 'disconnected', 'error'))
);

CREATE INDEX idx_ea_sessions_ea ON public.ea_sessions(ea_api_key, status);

-- RLS
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fib_levels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_sessions ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper avoids infinite recursion on public.users policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE POLICY "users_read_own" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_admin_read_all" ON public.users
  FOR SELECT USING (public.is_admin());

CREATE POLICY "fib_levels_owner_read" ON public.fib_levels
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "fib_levels_admin_read" ON public.fib_levels
  FOR SELECT USING (public.is_admin());

CREATE POLICY "ea_sessions_owner_read" ON public.ea_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ea_sessions_admin_read" ON public.ea_sessions
  FOR SELECT USING (public.is_admin());
```

> **Security note (EA writes):** EA ingest uses the Supabase **service role**
> key server-side, which bypasses RLS — there are deliberately **no** client-side
> INSERT policies on `fib_levels`. Authenticating EA writes via RLS
> (`source = 'ea'` or `auth.uid()` alone) is not secure; the X-EA-API-Key flow
> validates the EA server-side and writes with the service role.

### 0.3 Local Dev Environment
- [ ] Install Supabase CLI: `npm i -g supabase`
- [ ] Link project: `supabase link --project-ref <ref>`
- [ ] Push migrations: `supabase db push`
- [ ] Generate types: `supabase gen types typescript --local > backend/src/lib/db/types.ts`
- [ ] Install Drizzle ORM: `npm i drizzle-orm @supabase/supabase-js` (in backend)

---

## Phase 1: Database Layer & Types (Day 1-2)

### 1.1 Database Client & Schema (backend/src/lib/db/)

```
backend/src/lib/db/
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

**backend/src/lib/db/index.ts**
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
```

**backend/src/lib/db/schema.ts** (Drizzle schema matching Supabase)

### 1.2 Database Queries (backend/src/lib/db/queries/)

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

### 2.1 Auth Utilities (backend/src/lib/auth/)

```
backend/src/lib/auth/
├── index.ts              # JWT utilities, password hashing
├── middleware.ts         # Auth middleware for API routes
├── ea-auth.ts           # X-EA-API-Key validation
└── session.ts           # Session management
```

**backend/src/lib/auth/ea-auth.ts**
```typescript
import { db } from '../db';
import { users, eaSessions } from '../db/schema';
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

  // Upsert EA session using composite key (ea_api_key, user_id) to refresh
  // existing connected sessions instead of creating duplicates. Update lastPing
  // and status on repeated requests. Stale sessions (lastPing older than 5 min)
  // should be cleaned up periodically via a scheduled task.
  await db.insert(eaSessions).values({
    eaApiKey: apiKey,
    userId: user.id,
    status: 'connected',
    lastPing: new Date(),
  }).onConflictDoUpdate({
    target: [eaSessions.eaApiKey, eaSessions.userId],
    set: {
      status: 'connected',
      lastPing: new Date(),
    },
  });
  
  return { valid: true, user };
}

export function extractEaApiKey(request: Request): string | null {
  return request.headers.get('X-EA-API-Key') || 
         request.headers.get('x-ea-api-key') ||
         null;
}
```

**backend/src/lib/auth/middleware.ts**
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

### 2.2 Auth API Routes (backend/src/routes/api/auth/)

```
backend/src/routes/api/auth/
├── login.ts      # POST /api/auth/login
├── register.ts   # POST /api/auth/register
└── me.ts         # GET /api/auth/me
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

### 3.1 EA Fib Levels Submission (backend/src/routes/api/ea/fib-levels.ts)

**POST /api/ea/fib-levels** — Matches WordPress `POST /wp-json/smc/v1/ea/fib-levels`

```typescript
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { db } from '../../lib/db';
import { fibLevels } from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { eaAuthMiddleware } from '../../lib/auth/middleware';

// Mirrors WordPress wp_smc_sf_fib_levels payload + 16-ratio whitelist.
const VALID_RATIOS = [
  -200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300,
];
const levelEntrySchema = z.object({
  ratio: z.number(),
  price: z.number(),
});
const tfEntrySchema = z.object({
  timeframe: z.enum(['M15', 'H1', 'H4', 'D1']),
  ltf_sf: z.array(levelEntrySchema).default([]),
  htf_af: z.array(levelEntrySchema).default([]),
});
const fibLevelSchema = z.object({
  symbol: z.string().min(1).max(24),
  levels: z.array(tfEntrySchema),
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
    const { symbol, levels, calculatedAt } = parsed.data;
    const when = calculatedAt ? new Date(calculatedAt) : new Date();

    let inserted = 0;
    let failed = 0;

    for (const tfEntry of levels) {
      const famMap: Record<string, { ratio: number; price: number }[]> = {
        LTF_SF: tfEntry.ltf_sf,
        HTF_AF: tfEntry.htf_af,
      };
      for (const [family, entries] of Object.entries(famMap)) {
        for (const { ratio, price } of entries) {
          if (!VALID_RATIOS.includes(ratio)) { failed++; continue; }
          try {
            // Upsert parity: fib_lookup is (user_id, symbol, timeframe, family,
            // ratio) — ON CONFLICT DO UPDATE overwrites the latest value, mirroring
            // WordPress wpdb->replace (calculated_at is intentionally excluded).
            await db.insert(fibLevels).values({
              userId: eaUser.id,
              eaApiKey: eaUser.eaApiKey,
              symbol: symbol.toUpperCase(),
              timeframe: tfEntry.timeframe,
              family,
              ratio: String(ratio) as unknown as number,
              price: String(price) as unknown as number,
              source: 'mt5',
              calculatedAt: when,
            }).onConflictDoUpdate({
              target: [fibLevels.userId, fibLevels.symbol, fibLevels.timeframe, fibLevels.family, fibLevels.ratio],
              set: { price: String(price) as unknown as number, calculatedAt: when, source: 'mt5' },
            });
            inserted++;
          } catch {
            failed++;
          }
        }
      }
    }

    return c.json({
      ok: failed === 0,
      symbol: symbol.toUpperCase(),
      levels_written: inserted,
      levels_failed: failed,
    }, failed === 0 ? 201 : 207);
  }
);
```

### 3.2 Market Data Fetch (backend/src/routes/api/market-data/fib-levels.ts)

**GET /api/market-data/fib-levels** — Matches WordPress `GET /wp-json/smc/v1/market-data/fib-levels`

```typescript
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { db } from '../../lib/db';
import { fibLevels } from '../../lib/db/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import { userAuthMiddleware } from '../../lib/auth/middleware';

const querySchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: z.enum(['M15', 'H1', 'H4', 'D1']).optional(),
  family: z.enum(['LTF_SF', 'HTF_AF']).optional(),
  since: z.string().datetime().optional(),
});

const factory = createFactory();

export const getFibLevelsRoute = factory.createHandlers(
  userAuthMiddleware, // JWT required - route filters by c.get('user').sub
  async (c) => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.flatten() }, 400);
    }
    const { symbol, timeframe, family, since } = parsed.data;

    const conditions = [eq(fibLevels.userId, c.get('user').sub)];
    conditions.push(eq(fibLevels.symbol, symbol.toUpperCase()));
    if (timeframe) conditions.push(eq(fibLevels.timeframe, timeframe));
    if (family) conditions.push(eq(fibLevels.family, family));
    if (since) conditions.push(gte(fibLevels.calculatedAt, new Date(since)));

    const rows = await db
      .select()
      .from(fibLevels)
      .where(and(...conditions))
      .orderBy(desc(fibLevels.calculatedAt))
      .limit(2000);

    // Group by timeframe -> family -> levels[] (matches WordPress response shape)
    const fibs: Record<string, Record<string, { ratio: number; price: number; calculated_at: string }[]>> = {};
    for (const row of rows) {
      fibs[row.timeframe] ??= {};
      fibs[row.timeframe][row.family] ??= [];
      fibs[row.timeframe][row.family].push({
        ratio: Number(row.ratio),
        price: Number(row.price),
        calculated_at: row.calculatedAt.toISOString(),
      });
    }

    return c.json({ ok: true, symbol: symbol.toUpperCase(), fibs, anchor_debug: {} });
  }
);
```

---

## Phase 4: User Profile & Session Endpoints (Day 4-5)

### 4.1 User Routes (backend/src/routes/api/users/)

**GET /api/users/:id** — User profile for dashboard

```typescript
// backend/src/routes/api/users/[id].ts
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

### 5.1 WordPress → TanStack Sync Service (backend/src/lib/sync/)

```
backend/src/lib/sync/
├── wordpress-client.ts   # WordPress REST API client
├── sync-service.ts       # Sync orchestration
├── fib-level-sync.ts     # Fib level sync logic
└── scheduler.ts          # Cron scheduler
```

**backend/src/lib/sync/wordpress-client.ts**
```typescript
const WP_BASE = process.env.WORDPRESS_API_URL!; // e.g. https://smartfib.com/wp-json/smc/v1
const WP_API_KEY = process.env.WORDPRESS_API_KEY!;
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchWpFibLevels(params: {
  symbol?: string;
  timeframe?: string;
  page?: number;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params.symbol) search.set('symbol', params.symbol);
  if (params.timeframe) search.set('timeframe', params.timeframe);
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('per_page', String(params.limit));

  // Bounded timeout so a hung WordPress call can't stall the sync loop.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${WP_BASE}/market-data/fib-levels?${search}`, {
      headers: { Authorization: `Bearer ${WP_API_KEY}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`WP fetch failed: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
```

**backend/src/lib/sync/fib-level-sync.ts**
```typescript
import { db } from '../db';
import { fibLevels } from '../db/schema';
import { fetchWpFibLevels } from './wordpress-client';
import { and, eq } from 'drizzle-orm';

// WordPress GET /market-data/fib-levels returns:
//   { ok, symbol, fibs: { [tf]: { LTF_SF: [{ratio,price,calculated_at}], HTF_AF: [...] } }, anchor_debug }
// Explode that into ratio-level rows in fib_levels (matches the EA ingest path;
// there is NO market_data table in the canonical schema).
export async function syncFibLevelsFromWordPress(since?: Date) {
  const PAGE_SIZE = 100;
  let page = 1;
  let hasMore = true;
  let synced = 0;

  while (hasMore) {
    const wpData = await fetchWpFibLevels({ page, limit: PAGE_SIZE });
    const fibs = wpData?.fibs ?? {};
    const tfKeys = Object.keys(fibs);
    if (tfKeys.length === 0) break;

    let recordsThisPage = 0;
    for (const tf of tfKeys) {
      for (const family of ['LTF_SF', 'HTF_AF'] as const) {
        const levels = fibs[tf]?.[family] ?? [];
        recordsThisPage += levels.length;
        for (const lvl of levels) {
          const calculatedAt = new Date(lvl.calculated_at ?? lvl.date);
          if (since && calculatedAt <= since) continue;

          try {
            await db.insert(fibLevels).values({
              // Shadow sync writes under the configured EA user for the symbol.
              userId: process.env.SHADOW_SYNC_USER_ID!,
              eaApiKey: process.env.SHADOW_SYNC_EA_API_KEY!,
              symbol: String(wpData.symbol).toUpperCase(),
              timeframe: tf,
              family,
              ratio: String(lvl.ratio) as unknown as number,
              price: String(lvl.price) as unknown as number,
              source: 'mt5',
              calculatedAt,
            }).onConflictDoUpdate({
              target: [fibLevels.userId, fibLevels.symbol, fibLevels.timeframe, fibLevels.family, fibLevels.ratio],
              set: { price: String(lvl.price) as unknown as number, calculatedAt, source: 'mt5' },
            });
            synced++;
          } catch (err) {
            console.error('[Shadow Sync] insert failed', err);
          }
        }
      }
    }

    page++;
    // Determine hasMore from total nested level records, or WordPress pagination
    // metadata if available (wpData.total, wpData.hasMore, etc.), rather than
    // timeframe key count which maxes at 4.
    hasMore = recordsThisPage >= PAGE_SIZE || (wpData.hasMore ?? false);
  }

  return { synced, timestamp: new Date() };
}
```

### 5.2 Sync Scheduler (backend/src/lib/sync/scheduler.ts)

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
// backend/src/routes/api/admin/shadow-validation.ts
export const shadowValidationRoute = factory.createHandlers(
  userAuthMiddleware,
  async (c) => {
    const user = c.get('user');
    if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    
    const { symbol, timeframe, limit = 20 } = c.req.query();

    // Fetch from both sources. WordPress returns { ok, symbol, fibs: { tf: {
    // LTF_SF: [{ratio,price,calculated_at}], HTF_AF: [...] } }, anchor_debug }.
    // TanStack stores the same data at ratio-level granularity in fib_levels.
    const [wpData, tsRows] = await Promise.all([
      fetchWpFibLevels({ symbol, timeframe, limit }),
      db.select().from(fibLevels)
        .where(and(
          symbol ? eq(fibLevels.symbol, symbol.toUpperCase()) : undefined,
          timeframe ? eq(fibLevels.timeframe, timeframe) : undefined,
        ))
        .orderBy(desc(fibLevels.calculatedAt))
        .limit(limit),
    ]);

    // Group TanStack rows into the WordPress tf -> family -> levels shape.
    const tsFibs: Record<string, Record<string, { ratio: number; price: number }[]>> = {};
    for (const row of tsRows) {
      tsFibs[row.timeframe] ??= {};
      tsFibs[row.timeframe][row.family] ??= [];
      tsFibs[row.timeframe][row.family].push({ ratio: Number(row.ratio), price: Number(row.price) });
    }

    // Compare parity bidirectionally: normalize tf/family/ratio/price on both sides.
    const mismatches: unknown[] = [];
    const wpFibs = wpData?.fibs ?? {};
    let wpRecordCount = 0;

    // Check WordPress → TanStack (missing in TanStack)
    for (const [tf, families] of Object.entries(wpFibs)) {
      for (const [family, levels] of Object.entries(families)) {
        const tsLevels = tsFibs[tf]?.[family] ?? [];
        for (const lvl of levels) {
          wpRecordCount++;
          const hit = tsLevels.find(
            (t) => Number(t.ratio) === Number(lvl.ratio) && Number(t.price) === Number(lvl.price)
          );
          if (!hit) mismatches.push({ type: 'missing_in_tanstack', tf, family, lvl });
        }
      }
    }

    // Check TanStack → WordPress (unexpected in TanStack)
    for (const [tf, families] of Object.entries(tsFibs)) {
      for (const [family, levels] of Object.entries(families)) {
        const wpLevels = wpFibs[tf]?.[family] ?? [];
        for (const lvl of levels) {
          const hit = wpLevels.find(
            (w: any) => Number(w.ratio) === Number(lvl.ratio) && Number(w.price) === Number(lvl.price)
          );
          if (!hit) mismatches.push({ type: 'unexpected_in_tanstack', tf, family, lvl });
        }
      }
    }

    return c.json({
      wordpressCount: wpRecordCount,
      tanstackCount: tsRows.length,
      match: mismatches.length === 0,
      mismatches,
    });
  }
);
```

---

## Phase 6: Local Dev Configuration (Day 6)

### 6.1 Nitro Dev Server Config (backend/nitro.config.ts)

```typescript
import { defineNitroConfig } from 'nitro/config';

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

### 6.2 Database Plugin (backend/server/plugins/db.ts)

```typescript
import { db } from '~/lib/db';

export default defineNitroPlugin(() => {
  // Database connection is lazy-initialized via Drizzle
  console.log('[Nitro] Database plugin loaded');
});
```

### 6.3 Package.json Scripts (backend/package.json)

```json
{
  "scripts": {
    "dev": "nitro dev",
    "build": "nitro build",
    "preview": "nitro preview",
    "start": "node .output/server/index.mjs",
    "db:push": "supabase db push",
    "db:types": "supabase gen types typescript --local > src/lib/db/types.ts",
    "typecheck": "tsc --noEmit",
    "sync:shadow": "tsx scripts/shadow-sync.ts",
    "validate:shadow": "tsx scripts/validate-shadow.ts",
    "test:integration": "vitest run tests/integration"
  }
}
```

---

## Phase 7: Integration Tests (Day 6-7)

### 7.1 Test Setup (backend/tests/)

```
backend/tests/
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
// backend/tests/integration/ea-fib-levels.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, testEaApiKey } from '../utils/test-client';
import { db } from '../../src/lib/db';
import { fibLevels } from '../../src/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('POST /api/ea/fib-levels', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    client = createTestClient();
    await db.delete(fibLevels);
  });

  it('accepts valid EA fib level submission', async () => {
    // WordPress-shaped payload: levels[] -> { timeframe, ltf_sf[], htf_af[] }.
    // Use only canonical VALID_RATIOS from line 324-326 above.
    const payload = {
      symbol: 'EURUSD',
      levels: [
        {
          timeframe: 'H1',
          ltf_sf: [
            { ratio: 0, price: 1.0850 },
            { ratio: 25, price: 1.0820 },
            { ratio: 50, price: 1.0800 },
            { ratio: 62.5, price: 1.0780 },
            { ratio: 75, price: 1.0760 },
            { ratio: 100, price: 1.0720 },
          ],
          htf_af: [],
        },
      ],
    };

    const res = await client.post('/api/ea/fib-levels', payload, {
      headers: { 'X-EA-API-Key': testEaApiKey },
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    // Verify ratio-level rows written to fib_levels (6 valid ratios submitted).
    const rows = await db.select().from(fibLevels).where(eq(fibLevels.symbol, 'EURUSD'));
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.family === 'LTF_SF')).toBe(true);
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

### 8.1 E2E Test Setup

Note: No Cypress configuration exists yet in the repository. E2E validation will be
performed via integration tests (`npm run test:integration`) and manual QA until
a dedicated E2E framework is configured.

### 8.2 Test Data Seeding Script

```typescript
// backend/scripts/seed-phase4-test-data.ts
import { db } from '../src/lib/db';
import { fibLevels, users } from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/auth';

const VALID_RATIOS = [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300];

export async function seedPhase4TestData() {
  // Create test EA user
  const [eaUser] = await db.insert(users).values({
    email: 'ea-test@smartfib.com',
    passwordHash: await hashPassword('testpass123'),
    role: 'ea',
    eaApiKey: 'ea-test-key-phase4',
  }).returning();

  // Seed ratio-level fib rows for Cypress tests (no market_data table).
  const testData = [
    { symbol: 'EURUSD', timeframe: 'H1', price: 1.0850 },
    { symbol: 'GBPUSD', timeframe: 'H1', price: 1.2650 },
    { symbol: 'USDJPY', timeframe: 'H4', price: 149.50 },
  ];

  for (const d of testData) {
    const rows = VALID_RATIOS.map((ratio) => ({
      userId: eaUser.id,
      eaApiKey: eaUser.eaApiKey,
      symbol: d.symbol,
      timeframe: d.timeframe,
      family: 'LTF_SF' as const,
      ratio: String(ratio) as unknown as number,
      price: String(d.price * (1 + ratio / 100)) as unknown as number,
      source: 'mt5' as const,
    }));
    await db.insert(fibLevels).values(rows);
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
| E2E Phase 4 tests | Manual QA or integration tests | All pass |

---

## Phase 9: Cloudflare Workers Deployment (Post-Phase 4)

### 9.1 Wrangler Config (backend/wrangler.toml)

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
backend/
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
│   │       │   └── me.ts
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
- [ ] Auth flow works: register → login → me
- [ ] EA can submit fib levels, dashboard can fetch them

---

## Next Steps After Approval

1. **Day 0-1**: Supabase setup + schema push
2. **Day 1-2**: Database layer + types
3. **Day 2-3**: Auth middleware + endpoints
4. **Day 3-4**: Phase 4 critical endpoints
5. **Day 4-5**: User endpoints
6. **Day 5-6**: Shadow sync + validation
7. **Day 6-7**: Integration tests + seed scripts
8. **Day 7-8**: Cypress Phase 4 execution + validation

**Estimated: 8 working days to Phase 4 validation**