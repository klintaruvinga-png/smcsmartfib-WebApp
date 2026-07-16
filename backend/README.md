# SMC SuperFIB — TanStack Start Backend

Standalone Nitro server that replaces the WordPress REST backend for Phase 4
fib-engine testing. Runs locally on `http://localhost:3000` (Nitro dev server)
and deploys to Cloudflare Workers for production.

## Phase 0 — Infrastructure (current)

- Supabase PostgreSQL schema: `src/db/migrations/001_init.sql`
- Drizzle ORM schema + client: `src/db/schema.ts`, `src/db/index.ts`
- Nitro config: `nitro.config.ts`
- Health route: `src/routes/api/health.ts`

## Setup

```bash
# 1. Create a Supabase project, then fill in backend/.env.local
cp .env.example .env.local   # copy the template, then replace placeholder values

# 2. Push the database schema
supabase db push          # or paste 001_init.sql into the Supabase SQL editor

# 3. Install deps + run locally
npm install
npm run dev               # http://localhost:3000

# 4. Verify Phase 0 acceptance
curl localhost:3000/api/health
# => {"status":"ok","service":"smc-superfib-backend",...}
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Nitro dev server on :3000 |
| `npm run build` | Production build (Node preset unless `NITRO_PRESET` set) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Deploy SQL migration to Supabase |

## Environment (`.env.local`, gitignored)

See `.env.local` for the full list. Minimum required for Phase 0:
`DATABASE_URL`, `SUPABASE_URL`, `EA_API_KEY`.
