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

## Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/login` | — | Email + password → access/refresh tokens |
| POST | `/api/auth/register` | — | Create user (Supabase auth + profile) |
| GET | `/api/auth/me` | Bearer | Current user view |
| POST | `/api/auth/refresh` | Refresh token | Rotate to a new token pair |
| POST | `/api/ea/fib-levels` | X-EA-API-Key (role `ea`) | EA ingest: fib levels |
| POST | `/api/ea/heartbeat` | X-EA-API-Key (role `ea`) | EA session heartbeat |
| GET | `/api/ea/license-check` | X-EA-API-Key (role `ea`) | EA license/terminal allowlist check |
| GET | `/api/market-data/fib-levels` | Bearer | Fib levels grouped by timeframe → family |
| GET / PUT | `/api/user/settings` | Bearer | Read / PATCH user preferences (JSONB) |

> `user_id` passed from the EA is now the UUID from `public.users.id`, not an integer WordPress user ID.

## Scripts

| Script              | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Nitro dev server on :3000                                |
| `npm run build`     | Production build (Node preset unless `NITRO_PRESET` set) |
| `npm run typecheck` | `tsc --noEmit`                                           |
| `npm run db:push`   | Deploy SQL migration to Supabase                         |

## EA Bridge Status

The EA (MetaTrader 4/5 Expert Advisor) talks to the backend over HTTPS using a
shared secret in the `X-EA-API-Key` header (not a JWT). Every EA route is
authenticated by `requireEaAuth`, which SHA-256-hashes the incoming key and
matches it against `users.ea_api_key` with `role = 'ea'`.

| Route | Auth | Status | Notes |
|-------|------|--------|-------|
| `POST /api/ea/fib-levels` | X-EA-API-Key (role `ea`) | **Implemented** | zod-validated payload, partial-write resilient, dedup by (family, ratio). Tested in `tests/integration/ea-bridge.contract.test.ts`. |
| `POST /api/ea/heartbeat` | X-EA-API-Key | **Not yet built** | DB queries (`ea-sessions.createEaSession` / `updateEaSessionPing`) exist and are orphaned. Follow-up task. |
| `POST /api/ea/license-check` | X-EA-API-Key | **Not yet built** | Contract documented in `CONTEXT.md` / EA config migration checklist. Follow-up task. |
| `POST /api/ea/market-stream`, `account-sync`, `symbol-sync` | X-EA-API-Key | **Roadmap** | Per `docs/backend-migration-plan.md` (BACKEND-2e). Not started. |

SMC-03 (EA/backend bridge) audited the implemented `fib-levels` route, locked
its contract with offline integration tests, and documented the gaps above. The
missing routes are deferred to separate follow-up tasks (see `projects.json`).

See `reports/ea-live-e2e-checklist.md` for the manual live-EA verification
steps (the agent shell cannot drive the MT4/5 EA, so end-to-end proof is a
human-run checklist, not an automated test).

## Environment (`.env.local`, gitignored)

See `.env.local` for the full list. Minimum required for Phase 0:
`DATABASE_URL`, `SUPABASE_URL`, `EA_API_KEY`.
