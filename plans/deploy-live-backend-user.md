# Deploy Live: Backend (Node host) + One Live User

**Date**: 2026-07-28
**Branch**: `feat/live-deploy-backend-user` (off `docs/sync-tracker-smc-02-unblock`)
**Owner**: KudzBot (acting as owner, per standing direction)

## Objective

Stand up a live, working deployment so all future SMC dev and testing runs against one
real, logged-in user. Backend runs on a Node host. Frontend deploys to the EXISTING Vercel
project Kudzie already has (`klintaruvinga-pngs-projects/smcsmartfib-web-app-vn7j`).

This unblocks SMC-02 (Pine/MT5 FIB parity) which is currently blocked on "backend live + login".

## Decision (confirmed with Kudzie, 2026-07-28)

- Backend target: **Node host** (Railway / Render / Fly). Keep `postgres.js`, `node-server`
  Nitro preset, zero code change. Frontend reaches it over HTTPS via `VITE_API_URL`.
- Live database: linked Supabase "SMC SmartFib App Dev" (ref `yfodcdqpkgpbrzdpeqtb`).
  WordPress DB was never exported, so this Supabase project is the source of truth.
- Frontend target: **existing Vercel project** (no new Cloudflare Worker; `wrangler login`
  no longer required). Vercel auto-detects TanStack Start and applies its own preset at build,
  so no `vercel.json` change is needed. `VITE_API_URL` (backend prod URL) is supplied as a
  Vercel build env var.

## Architecture (post-deploy)

```
Browser
  -> Vercel (frontend, TanStack Start; VITE_API_URL = https://<backend-host>/api)
  -> Node host (backend, Nitro node-server :PORT)
       -> Supabase Postgres (dev project, pooler 6543 for runtime, 5432 for migrations)
       -> Custom auth (jose JWTs, passwords in public.users.password_hash)
```

## Sequencing

1. Install deps (root: bun, backend: npm) [DONE]
2. Build backend (node-server preset) [DONE — .output/server/index.mjs]
3. Build frontend (Cloudflare-shaped dist; Vercel re-packaged at deploy) [DONE — dist/]
4. Scaffold backend/.env.local + migration runner + railway.json [DONE — pending secrets]
5. Apply migrations 001-005 to live Supabase [gated on DATABASE_URL]
6. Run backend against live Supabase; register ONE user; verify login + /me via curl
7. Deploy backend to Node host (gated on host account + secrets)
8. Set VITE_API_URL in Vercel = backend prod URL; deploy frontend (gated on Vercel repo link)
9. Update TRACKER / AGENTS; open PR

## Required from Kudzie (gating step 5, 7, 8)

- Supabase `SUPABASE_URL` (https://yfodcdqpkgpbrzdpeqtb.supabase.co)
- `SUPABASE_ANON_KEY` (for runtime queries if needed)
- `DATABASE_URL` (pooler 6543) + `DIRECT_DATABASE_URL` (5432) for postgres.js
- `JWT_SECRET` (session signing)
- `EA_API_KEY` (keep dev value; not needed for user creation)
- Node-host account (Railway preferred; Render/Fly alternative) authenticated
- Confirm Vercel project is linked to this GitHub repo (so push = deploy)

## Verification gates

| Gate               | Command                                                                     | Expected                                      |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------------- |
| Backend compiles   | `cd backend && npm run build`                                               | `.output/server/index.mjs` exists             |
| Frontend compiles  | `npm run build`                                                             | `dist/server/server.js` + `dist/client` exist |
| Migrations applied | `cd backend && node scripts/apply-migrations.mjs` (DIRECT_DATABASE_URL set) | all 6 tables present                          |
| One live user      | `curl -X POST .../api/auth/register`                                        | 200 + accessToken                             |
| Login works        | `curl -X POST .../api/auth/login`                                           | 200 + accessToken                             |
| /me works          | `curl .../api/auth/me -H Bearer`                                            | 200 + user view                               |
| Health             | `curl .../api/health`                                                       | `{"status":"ok",...}`                         |
| Frontend live      | Vercel deploy of this branch                                                | app loads, login reaches backend              |

## Notes / risks

- `postgres.js` + Supabase pooler requires `prepare:false` (already set in db/index.ts).
- `register` uses custom auth flow (jose JWTs, passwords in public.users.password_hash); no
  Supabase Auth service-role key is needed for registration (see backend/src/lib/auth/handlers.ts
  lines 109-114: "NO Supabase Auth user is created").
- `VITE_API_URL` is build-time: backend must be deployed and its URL known before the
  production frontend build/deploy. Dev default stays `http://localhost:3000/api`.
- Vercel CLI is not installed/auth'd in this environment and cannot complete interactive
  OAuth; deploy will rely on the Vercel repo link (push → auto build) OR a Vercel token
  Kudzie provides. Backend deploy similarly needs a host token or Kudzie's dashboard action.
- No `[DEMO]` placeholders. The single live user is a real account, real data.
