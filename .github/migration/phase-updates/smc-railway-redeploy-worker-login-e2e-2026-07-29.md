# SMC Task Execution — Railway Redeploy + Worker/Railway Login E2E

**Date**: 2026-07-29
**Owner**: klintaruvinga-png / KudzBot verification
**Stack**: Cloudflare Worker (`smcsuperfibwebapp.klintaruvinga.workers.dev`) → Railway (`smcsmartfib-webapp-production.up.railway.app`)

## Repo Context Scan — WordPress/Lovable/Runtime Migration State

### WordPress migration state
- `docs/architecture/BACKEND_MIGRATION_IMPLEMENTATION_PLAN.md` and `docs/backend-migration-plan.md` state WordPress is **permanently down**.
- Active backend auth code uses a fully custom JWT flow over `public.users`; login does **not** call WordPress or `auth.users`.
- `backend/.env.example` still lists legacy `WORDPRESS_API_URL` / `WORDPRESS_API_KEY` as retired reference values only.

### Lovable migration remnants
- Frontend tests/mocks still reference old hosts/shapes, e.g. `backend.example/wp-json`, `smcsmartfib.lovable.app`.
- Active production API defaults are now:
  - `src/routes/login.tsx` -> Worker origin fallback
  - `src/lib/api/sniperClient.ts` -> Worker origin fallback
  - `src/lib/api/journalClient.ts` -> Worker origin fallback
- Test files are not runtime code. They confirm prior migration sources, not live behavior.

### Backend login/runtime path in current repo
- Backend login route: `backend/src/routes/api/auth/login.ts`
- Backend login implementation: `backend/src/lib/auth/handlers.ts`
- Login effectiveness depends on:
  - Nitro runtime reading `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`
  - Drizzle client `backend/src/lib/db/index.ts` connecting with `postgres-js`
  - `users` table being present and containing `email`, `role`, `password_hash`
- `backend/railway.json` uses:
  - `rootDirectory="."`
  - `startCommand="node .output/server/index.mjs"`
  - `healthcheckPath="/api/health"`

## Completed actions today
- Confirmed Worker-to-Railway proxy code exists in repo: `cloudflare/api-proxy-worker.js` + `wrangler.jsonc`
- Set Wrangler secret `RAILWAY_BACKEND_URL` via local repo CLI
- Built and redeployed Worker; `/api/health`, `/api/auth/login` preflight, and dashboard root are reachable through the Worker
- Fixed frontend hardcoded `localhost:3000` fallbacks in:
  - `src/routes/login.tsx`
  - `src/lib/api/sniperClient.ts`
  - `src/lib/api/journalClient.ts`
- Inspected Railway production environment for service `smcsmartfib-WebApp`
  - Project confirmed: `SMC Smartfib WebApp`
  - Service confirmed: `smcsmartfib-WebApp`
  - Env vars present: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `EA_API_KEY`
- Inspected Railway production logs for login failures
  - Found explicit backend error: `PostgresError: password authentication failed for user "postgres"`
  - Also found backend method-allow errors: `HTTP method is not allowed.` traces around `_routes/api/auth/login.mjs`

## Current live state
- Worker: `https://smcsuperfibwebapp.klintaruvinga.workers.dev`
  - `GET /api/health` -> 200 OK, proxied from Railway
  - `OPTIONS /api/auth/login` -> 204 No Content, CORS headers present
  - `GET /` -> 200 OK dashboard HTML/SSR
- Frontend login no longer targets `localhost:3000` by default
- Live login path still failing with **500**:
  - `https://smcsmartfib-webapp-production.up.railway.app/api/auth/login`
  - Railway logs indicate the failure is database authentication failure for user `postgres`

## Root-cause assessment
- The 500 is no longer “unknown.” Railway logs show `28P01 FATAL: password authentication failed for user "postgres"`.
- That points to a Postgres credential mismatch for the `postgres` user in `DATABASE_URL`, not a frontend, Worker, or login-handler bug.
- Secondary concern: Railway logs also show `405 method not allowed` traces for the login route. That may indicate a method/route allowlist mismatch in built Nitro config; needs route-config verification only after DB auth is fixed.

## Verified commands today
```bash
npm exec wrangler --version
./node_modules/.bin/wrangler.cmd secret put RAILWAY_BACKEND_URL
npm run build
./node_modules/.bin/wrangler.cmd deploy
curl -si https://smcsuperfibwebapp.klintaruvinga.workers.dev/api/health
curl -si -X OPTIONS https://smcsuperfibwebapp.klintaruvinga.workers.dev/api/auth/login \
  -H 'Origin: https://smcsuperfibwebapp.klintaruvinga.workers.dev' \
  -H 'Access-Control-Request-Method: POST'
railway status --project "SMC Smartfib WebApp" --environment production
railway variable list --service smcsmartfib-WebApp --project "SMC Smartfib WebApp" --environment production
railway logs --service smcsmartfib-WebApp --project "SMC Smartfib WebApp" --environment production --lines 200 --filter '@level:error OR @level:warn'
railway logs --service smcsmartfib-WebApp --project "SMC Smartfib WebApp" --environment production --http --status '>=400' --lines 100
```
- `npm run lint` still fails on pre-existing issues outside this task’s files
- `git status` shows modified tracked files plus many `.github` report artifacts

## Next actions
1. Verify the correct Supabase Postgres user/password for this app and correct Railway `DATABASE_URL` if it is stale.
2. Re-test `/api/auth/login` after credential fix.
3. If login still 500s after DB auth is fixed, verify Nitro auth route method contract for `/api/auth/**`.

## Risk
- Cannot complete login E2E until the Postgres auth failure is resolved.
- Docs/reports lag code if not updated alongside fixes.
- Do not change Railway DB credentials without confirming source of truth first.
