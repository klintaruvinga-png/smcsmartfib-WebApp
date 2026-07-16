# Backend Migration — Next Steps & Decisions

**Date**: 2025-07-16  
**Branch**: `main` (target: feature branch for migration)  
**Context**: Post-research, pre-implementation — decisions recorded for Phase 0 kickoff

---

## Decision Summary

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | **Migration Scope** | **Option C** — Phase 4 endpoints + core auth/session (6 total) | Phase 4 needs 2 endpoints; dashboard needs 4 auth endpoints. 6 is manageable in 1-2 weeks; 40+ remaining endpoints migrate incrementally after cutover. |
| 2 | **Database** | **Option A** — Supabase PostgreSQL immediately | Approved plan specifies PostgreSQL. Supabase provides Auth + Postgres + Realtime in one setup (~15 min). Avoids SQLite → Postgres migration debt. Phase 4 load tests need real concurrency. |
| 3 | **Deployment** | **Option B** — Local Nitro dev server first, Cloudflare Workers after Phase 4 | `npm run dev` works instantly. Cloudflare Workers config (`wrangler deploy`) is a separate step once API surface is validated. Repo already has `nitro.config.ts` with `preset: 'cloudflare'`. |
| 4 | **Transition Strategy** | **Option C** — Shadow mode with parity validation | WordPress stays live. TanStack Start receives EA data in parallel. Validation endpoint (`GET /api/admin/shadow-validation`) compares row counts & field parity. Cutover only after 24h zero mismatches. |
| 5 | **EA Authentication** | **Option B** — Simple `X-EA-API-Key` header for Phase 4; HMAC-SHA256 later | WordPress uses `X-EA-API-Key` today. Keep parity for Phase 4. Implement HMAC-SHA256 with nonces/timestamps in post-cutover increment. |

---

## Phase 0 Kickoff Checklist

### Supabase Setup (Day 0)
- [ ] Create Supabase project at `supabase.com`
- [ ] Enable **Database**, **Auth** (Email/Password), **Realtime**
- [ ] Configure Auth: JWT expiry 1h, email confirm off (dev), invite links on
- [ ] Save credentials to `.env.local` (gitignored):
  ```bash
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_ANON_KEY=eyJ...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
  EA_API_KEY=ea-secure-key-change-in-production
  JWT_SECRET=super-secret-change-in-production
  WORDPRESS_API_URL=https://smartfib.com/wp-json/smc/v1
  WORDPRESS_API_KEY=wp-api-key-for-shadow-sync
  ```

### Database Schema (Day 0-1)
Run via Supabase SQL Editor or `supabase db push`:

```sql
-- users (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user','admin','ea')),
  ea_api_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- fib_levels (EA submissions log)
CREATE TABLE public.fib_levels (
  id BIGSERIAL PRIMARY KEY,
  ea_api_key TEXT NOT NULL REFERENCES public.users(ea_api_key),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  fib_data JSONB NOT NULL,
  current_price DECIMAL(20,8),
  trend TEXT CHECK (trend IN ('bullish','bearish','neutral')),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ea_api_key, symbol, timeframe, calculated_at)
);
CREATE INDEX idx_fib_levels_lookup ON fib_levels(symbol, timeframe, calculated_at DESC);
CREATE INDEX idx_fib_levels_ea ON fib_levels(ea_api_key, received_at DESC);

-- market_data (Dashboard read path)
CREATE TABLE public.market_data (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  fib_levels JSONB NOT NULL,
  current_price DECIMAL(20,8),
  trend TEXT CHECK (trend IN ('bullish','bearish','neutral')),
  source TEXT DEFAULT 'ea' CHECK (source IN ('ea','manual','calculated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timeframe, created_at)
);
CREATE INDEX idx_market_data_lookup ON market_data(symbol, timeframe, created_at DESC);

-- ea_sessions (EA connection tracking)
CREATE TABLE public.ea_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_api_key TEXT NOT NULL REFERENCES public.users(ea_api_key),
  ip_address INET,
  user_agent TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_ping TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected','disconnected','error'))
);
CREATE INDEX idx_ea_sessions_ea ON ea_sessions(ea_api_key, status);

-- RLS Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fib_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins read all users" ON public.users FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "EA inserts own fib levels" ON public.fib_levels FOR INSERT WITH CHECK (ea_api_key = (SELECT ea_api_key FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Public reads market data" ON public.market_data FOR SELECT USING (true);
CREATE POLICY "EA inserts market data" ON public.market_data FOR INSERT WITH CHECK (source = 'ea');
```

### Local Dev Environment (Day 1)
- [ ] `npm i -g supabase` → `supabase link --project-ref <ref>` → `supabase db push`
- [ ] `supabase gen types typescript --local > apps/web/src/lib/db/types.ts`
- [ ] `npm i drizzle-orm @supabase/supabase-js postgres` (in `apps/web`)
- [ ] Verify `npm run dev` starts Nitro on `http://localhost:3000`

---

## Implementation Sequence (6 Endpoints)

| Phase | Endpoint | Method | Path | Auth | Priority |
|-------|----------|--------|------|------|----------|
| 1 | EA Fib Submission | POST | `/api/ea/fib-levels` | `X-EA-API-Key` | **P0** — Phase 4 blocker |
| 2 | Market Data Fetch | GET | `/api/market-data/fib-levels` | JWT (optional) | **P0** — Phase 4 blocker |
| 3 | User Login | POST | `/api/auth/login` | — | **P1** — Dashboard auth |
| 4 | User Register | POST | `/api/auth/register` | — | **P1** — Dashboard auth |
| 5 | Current User | GET | `/api/auth/me` | JWT | **P1** — Dashboard auth |
| 6 | User Profile | GET | `/api/users/:id` | JWT | **P1** — Dashboard auth |

### Supporting Infrastructure
- [ ] Drizzle schema + queries (`apps/web/src/lib/db/`)
- [ ] Auth utilities: JWT sign/verify, password hash, `X-EA-API-Key` middleware
- [ ] Shadow sync service: WordPress → TanStack Start (5-min cron)
- [ ] Shadow validation endpoint: `GET /api/admin/shadow-validation`
- [ ] Integration tests for all 6 endpoints (Vitest + Supertest)

---

## Validation Gates

| Gate | Criteria | Command |
|------|----------|---------|
| **Phase 0 Complete** | Supabase live, schema pushed, `npm run dev` serves API | `curl localhost:3000/api/health` |
| **Phase 1-2 Complete** | EA can POST fib levels; Dashboard GET returns data | Cypress Phase 4 tests pass against local |
| **Shadow Mode** | `/api/admin/shadow-validation` returns `match: true` for 24h | `curl -H "Authorization: Bearer <admin>" localhost:3000/api/admin/shadow-validation` |
| **Cutover Ready** | Zero mismatches, MT5 EA URL updated, DNS switched | Manual verification |

---

## File Structure (New)

```
apps/web/
├── src/
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts          # Drizzle client
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   ├── types.ts          # Supabase generated types
│   │   │   └── queries/
│   │   │       ├── fib-levels.ts
│   │   │       ├── market-data.ts
│   │   │       ├── users.ts
│   │   │       └── ea-sessions.ts
│   │   ├── auth/
│   │   │   ├── index.ts          # JWT, password hash
│   │   │   ├── middleware.ts     # Hono middleware
│   │   │   ├── ea-auth.ts        # X-EA-API-Key validation
│   │   │   └── session.ts        # Session helpers
│   │   └── sync/
│   │       ├── wordpress-client.ts
│   │       ├── fib-level-sync.ts
│   │       └── scheduler.ts
│   └── routes/
│       └── api/
│           ├── auth/
│           │   ├── login.ts
│           │   ├── register.ts
│           │   ├── me.ts
│           │   └── logout.ts
│           ├── ea/
│           │   └── fib-levels.ts
│           ├── market-data/
│           │   └── fib-levels.ts
│           ├── users/
│           │   └── [id].ts
│           └── admin/
│               └── shadow-validation.ts
├── nitro.config.ts
├── package.json (updated scripts)
└── .env.local (gitignored)
```

---

## Scripts to Add (`apps/web/package.json`)

```json
{
  "scripts": {
    "dev": "nitropack dev",
    "build": "nitropack build",
    "preview": "nitropack preview",
    "db:push": "supabase db push",
    "db:types": "supabase gen types typescript --local > src/lib/db/types.ts",
    "sync:shadow": "tsx scripts/shadow-sync.ts",
    "validate:shadow": "tsx scripts/validate-shadow.ts",
    "test:integration": "vitest run tests/integration"
  }
}
```

---

## Next Action

**Create feature branch** and begin Phase 0:

```bash
git checkout -b feat/backend-migration-phase0
# ... implement Supabase setup, schema, local dev ...
git add -A && git commit -m "feat: Phase 0 - Supabase setup & database schema"
git push origin feat/backend-migration-phase0
gh pr create --fill
```

Then proceed sequentially through Phases 1-6 above.

---

## References

- [Approved Backend Migration Plan](../docs/backend-migration-plan.md)
- [Architecture Implementation Plan](../docs/architecture/BACKEND_MIGRATION_IMPLEMENTATION_PLAN.md)
- [WordPress REST API Endpoints](../wordpress-rest-api.php) — 45+ endpoints to eventually migrate
- [Phase 4 Cypress Tests](../apps/web/tests/e2e/) — validates the 2 critical endpoints