# Backend Migration — Next Steps & Decisions

**Date**: 2025-07-16  
**Branch**: `main` (target: feature branch for migration)  
**Context**: Post-research, pre-implementation — decisions recorded for Phase 0 kickoff

> **SUPERSEDED (2026-07-17) — WordPress-Free BACKEND-2.**
> WordPress is **permanently down**. The shadow-mode / dual-write / WordPress-as-fallback
> decisions and infrastructure below are obsolete. The authoritative plan is now
> [`backend-2-restoration-plan.md`](./backend-2-restoration-plan.md): service-oriented,
> zero-WordPress, `VITE_API_URL`, JWT-only auth. Key revisions:
> - Decision 4 (Shadow mode) → removed; no WordPress source to validate against.
> - Decision 5 (EA auth) → `X-EA-API-Key` retained for `/api/ea/*`; no HMAC-for-cutover needed.
> - `WORDPRESS_API_URL` / `WORDPRESS_API_KEY` → dropped.
> - Shadow sync service / `shadow-validation` endpoint → removed (BACKEND-2 Phase 6 = data migration/seed).
> This file is retained as a historical Phase 0 kickoff record (BACKEND-0/1 now complete).

---

## Decision Summary

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | **Migration Scope** | **Option C** — Phase 4 endpoints + core auth/session (6 total) | Phase 4 needs 2 endpoints; dashboard needs 4 auth endpoints. 6 is manageable in 1-2 weeks; 40+ remaining endpoints migrate incrementally after cutover. |
| 2 | **Database** | **Option A** — Supabase PostgreSQL immediately | Approved plan specifies PostgreSQL. Supabase provides Auth + Postgres + Realtime in one setup (~15 min). Avoids SQLite → Postgres migration debt. Phase 4 load tests need real concurrency. |
| 3 | **Deployment** | **Option B** — Local Nitro dev server first, Cloudflare Workers after Phase 4 | `npm run dev` works instantly. Cloudflare Workers config (`wrangler deploy`) is a separate step once API surface is validated. Repo already has `nitro.config.ts` with `preset: 'cloudflare'`. |
| 4 | **Transition Strategy** | ~~Option C — Shadow mode with parity validation~~ **SUPERSEDED** | WordPress permanently down; no shadow mode, cutover, or fallback. Direct WordPress-free restoration (see `backend-2-restoration-plan.md`). |
| 5 | **EA Authentication** | **Option B** — Simple `X-EA-API-Key` header for `/api/ea/*`; HMAC-SHA256 deferred | `X-EA-API-Key` (role `ea`) retained. HMAC replay protection is a later hardening step, not part of the restoration. No WordPress cookie/nonce path. |

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
  # WordPress removed (2026-07-17): WORDPRESS_API_URL / WORDPRESS_API_KEY dropped
  ```

### Database Schema (Day 0-1)
Run via Supabase SQL Editor or `supabase db push`:

```sql
-- Canonical source of truth: backend/src/db/migrations/001_init.sql
-- No market_data table — the dashboard reads directly from fib_levels.

-- users (extends auth.users)
CREATE TABLE public.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT UNIQUE NOT NULL,
  username     TEXT UNIQUE,
  full_name    TEXT,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','ea')),
  ea_api_key   TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_ea_api_key ON public.users(ea_api_key);

-- fib_levels (EA submissions; granularity matches WordPress wp_smc_sf_fib_levels)
CREATE TABLE public.fib_levels (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ea_api_key    TEXT NOT NULL REFERENCES public.users(ea_api_key) ON UPDATE CASCADE ON DELETE CASCADE,
  symbol        VARCHAR(24) NOT NULL,
  timeframe     VARCHAR(16) NOT NULL CHECK (timeframe IN ('M15','H1','H4','D1')),
  family        VARCHAR(16) NOT NULL CHECK (family IN ('LTF_SF','HTF_AF')),
  ratio         DECIMAL(10,4) NOT NULL CHECK (ratio IN (-200,-162.5,-100,-62.5,-25,0,25,50,62.5,75,100,125,162.5,200,262.5,300)),
  price         DECIMAL(20,8) NOT NULL,
  source        VARCHAR(20) NOT NULL DEFAULT 'mt5',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fib_lookup UNIQUE (user_id, symbol, timeframe, family, ratio)
);

CREATE INDEX idx_fib_levels_lookup ON public.fib_levels (user_id, symbol, timeframe, family, calculated_at DESC);
CREATE INDEX idx_fib_levels_symbol_time ON public.fib_levels (user_id, symbol, calculated_at DESC);

-- ea_sessions (EA connection tracking)
CREATE TABLE public.ea_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_api_key   TEXT NOT NULL REFERENCES public.users(ea_api_key) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address   INET,
  user_agent   TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected','error'))
);

CREATE INDEX idx_ea_sessions_ea ON public.ea_sessions(ea_api_key, status);

-- RLS
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fib_levels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_sessions ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper avoids infinite recursion on public.users policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE POLICY "users_read_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_admin_read_all" ON public.users FOR SELECT USING (public.is_admin());

CREATE POLICY "fib_levels_owner_read" ON public.fib_levels FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "fib_levels_admin_read" ON public.fib_levels FOR SELECT USING (public.is_admin());

CREATE POLICY "ea_sessions_owner_read" ON public.ea_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ea_sessions_admin_read" ON public.ea_sessions FOR SELECT USING (public.is_admin());

-- EA writes use the Supabase service role key server-side (RLS bypassed);
-- there are deliberately NO client-side INSERT policies on fib_levels.
```

### Local Dev Environment (Day 1)
- [ ] `npm i -g supabase` → `supabase link --project-ref <ref>` → `supabase db push`
- [ ] `supabase gen types typescript --local > backend/src/lib/db/types.ts`
- [ ] `npm i drizzle-orm @supabase/supabase-js postgres` (in `backend`)
- [ ] Verify `npm run dev` starts Nitro on `http://localhost:3000`

---

## Implementation Sequence (6 Endpoints)

| Phase | Endpoint | Method | Path | Auth | Priority |
|-------|----------|--------|------|------|----------|
| 1 | EA Fib Submission | POST | `/api/ea/fib-levels` | `X-EA-API-Key` | **P0** — Phase 4 blocker |
| 2 | Market Data Fetch | GET | `/api/market-data/fib-levels` | JWT (required) | **P0** — Phase 4 blocker |
| 3 | User Login | POST | `/api/auth/login` | — | **P1** — Dashboard auth |
| 4 | User Register | POST | `/api/auth/register` | — | **P1** — Dashboard auth |
| 5 | Current User | GET | `/api/auth/me` | JWT | **P1** — Dashboard auth |
| 6 | User Profile | GET | `/api/users/:id` | JWT | **P1** — Dashboard auth |

### Supporting Infrastructure
- [ ] Drizzle schema + queries (`backend/src/lib/db/`)
- [ ] Auth utilities: JWT sign/verify, password hash, `X-EA-API-Key` middleware
- [ ] Domain services (`backend/src/lib/services/{snapshot,signal,chart,market,telemetry}/`) — see `backend-2-restoration-plan.md`
- [ ] Integration tests for all endpoints (Vitest + Supertest)
- [ ] ~~Shadow sync service / shadow-validation endpoint~~ — REMOVED (WordPress down)

---

## Validation Gates

| Gate | Criteria | Command |
|------|----------|---------|
| **Phase 0 Complete** | Supabase live, schema pushed, `npm run dev` serves API | `curl localhost:3000/api/health` |
| **Phase 1-2 Complete** | EA can POST fib levels; Dashboard GET returns data | Cypress Phase 4 tests pass against local |
| **Shadow Mode** | ~~`/api/admin/shadow-validation` returns `match: true`~~ — REMOVED (no WordPress source) | Superseded by BACKEND-2 Phase 6 data migration / seed |
| **Cutover Ready** | ~~Zero mismatches, MT5 EA URL updated, DNS switched~~ — N/A (no WordPress cutover) | Manual verification of `VITE_API_URL` + MT5 EA URL |

---

## File Structure (New)

```
backend/
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
│   │   └── services/
│   │       ├── snapshot/  signal/  chart/  market/  telemetry/
│   │       └── (replaces lib/sync + endpoint-first handlers)
│   └── routes/
│       └── api/
│           ├── auth/
│           │   ├── login.ts
│           │   ├── register.ts
│           │   └── me.ts
│           ├── ea/
│           │   └── fib-levels.ts
│           ├── market-data/
│           │   └── fib-levels.ts
│           └── users/
│               └── [id].ts
├── nitro.config.ts
├── package.json (updated scripts)
└── .env.local (gitignored)
```

---

## Scripts to Add (`backend/package.json`)

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
    "sync:data": "tsx scripts/data-migration.ts",
    "seed:test": "tsx scripts/seed-test-data.ts",
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
- [Phase 4 Cypress Tests](../backend/tests/e2e/) — validates the 2 critical endpoints