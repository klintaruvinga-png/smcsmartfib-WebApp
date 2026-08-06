# E2E Deployment Guide - SMC SuperFIB Dashboard

**Date**: 2026-08-06  
**Status**: Ready for Manual Deployment Steps  
**Build Status**: ✅ Backend built successfully, ✅ Frontend built successfully

---

## Summary of Automated Steps Completed

### ✅ What I've Already Done:
1. **Pulled latest main** - EA compile fix (PR #444) and lint cleanup (PR #445) are now included
2. **Created railway.json** - Backend deployment configuration scaffolded
3. **Created supabase/config.toml** - Supabase CLI configuration template with project reference
4. **Built backend** - Nitro backend built successfully to `.output/server/index.mjs`
5. **Built frontend** - TanStack Start frontend built successfully to `dist/`

### ✅ Build Verification:
- **Backend**: `node node_modules/nitro/dist/cli/index.mjs build` - SUCCESS (1.29 MB total, 290 kB gzip)
- **Frontend**: `npm run build` - SUCCESS (Client: 1.17 MB, Server: 406 KB)
- **EA Fix**: Verified `string userId` present in `mt5/FibEngine.mqh` lines 82, 220

---

## Manual Steps Required from You

### Phase 1: Supabase Database Setup

#### 1.1 Link Supabase Project
```bash
cd backend
supabase link --project-ref yfodcdqpkgpbrzdpeqtb
```

#### 1.2 Verify Schema Match
```bash
# Compare local migrations with live schema
supabase db diff --use-migrations --schema public
```

**Expected migrations to apply:**
- `001_init.sql` - users, fib_levels, ea_sessions
- `002_add_refresh_sessions.sql` - refresh_sessions
- `003_drop_users_auth_fk.sql`
- `004_add_user_settings.sql`
- `005_add_trades_risk.sql` - trades, risk_limits

#### 1.3 Apply Migrations (if needed)
```bash
supabase db push
```

#### 1.4 Create EA User
Execute in Supabase SQL Editor:
```sql
-- Create EA user with secure API key
-- Generate your EA_API_KEY externally (e.g., openssl rand -hex 32) and store it
-- in your secret manager (Railway secrets, 1Password, etc.) before running this.
INSERT INTO public.users (id, email, username, role, ea_api_key, password_hash)
VALUES (
  gen_random_uuid(),
  'ea@smcsuperfib.local',
  'ea_system',
  'ea',
  '[your-secure-api-key-from-secret-manager]',  -- Reference only; never log plaintext
  crypt('[your-secure-api-key-from-secret-manager]', gen_salt('bf'))
) ON CONFLICT (email) DO NOTHING;

-- Capture only the generated UUID
SELECT id FROM public.users WHERE role = 'ea';
```

**Save these values:**
- `EA_API_KEY` - store securely in Railway environment variables (source from secret manager)
- `id` (UUID) - for EA UserId configuration

---

### Phase 2: Railway Backend Deployment

#### 2.1 Railway Authentication
```bash
# If not already authenticated
railway login
```

#### 2.2 Create Railway Project
```bash
cd backend
railway init
```

#### 2.3 Set Environment Variables
In Railway dashboard, set these variables:

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://postgres:[PASSWORD]@db.yfodcdqpkgpbrzdpeqtb.supabase.co:6543/postgres` | Supabase pooler URL |
| `SUPABASE_URL` | `https://yfodcdqpkgpbrzdpeqtb.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` (JWT format) | Supabase dashboard → Settings → API → service_role (JWT). Backend uses @supabase/supabase-js v2.45.0 which requires the legacy JWT service-role key, not the newer sb_secret_ format. Rotate via Supabase dashboard if compromised. |
| `JWT_SECRET` | `[≥32-char random string]` | Generate secure secret |
| `EA_API_KEY` | `[from secret manager]` | Must match users.ea_api_key; never log plaintext |

#### 2.5 Deploy Backend
```bash
railway up
```

#### 2.6 Verify Backend Health
```bash
# Get the Railway deployment URL
railway domain

# Test health endpoint
curl https://[your-railway-url].railway.app/api/health
```

**Expected response:** `{"status":"ok"}`

---

### Phase 3: Cloudflare Worker Deployment

#### 3.1 Cloudflare Authentication
```bash
wrangler login
```

#### 3.2 Set Worker Environment Variable
In Cloudflare dashboard (Workers & Pages → smcsuperfibwebapp → Settings → Variables):

| Variable | Value |
|----------|-------|
| `RAILWAY_BACKEND_URL` | `https://[your-railway-url].railway.app` |

#### 3.3 Deploy Worker
```bash
# From root directory
wrangler deploy
```

#### 3.4 Verify Worker
```bash
curl https://smcsuperfibwebapp.klintaruvinga.workers.dev/api/health
```

**Expected response:** `{"status":"ok"}` (proxied through Railway)

---

### Phase 4: MT5 EA Configuration

#### 4.1 Recompile EA in MetaEditor
1. Open MetaEditor
2. Open `mt5/FibEngine.mqh` (should have `string userId` on lines 82, 220)
3. Compile - expect **zero errors**
4. Open your EA that includes `FibEngine.mqh`
5. Compile the EA

#### 4.2 Configure EA Inputs
In MT5 Terminal → Experts → Inputs:

| Input | Value |
|-------|-------|
| `WebhookURL` | `https://smcsuperfibwebapp.klintaruvinga.workers.dev/api/ea/market-stream` |
| `ApiKey` | `[EA_API_KEY from Phase 1.4]` |
| `UserId` | `[UUID from Phase 1.4]` |
| `wpUserId` | `[UUID from Phase 1.4]` |

#### 4.3 Attach EA to Chart
1. Attach EA to a chart (e.g., EURUSD M15)
2. Enable "Allow live trading"
3. Monitor Experts log for successful webhook POSTs

---

### Phase 5: End-to-End Validation

#### 5.1 Verify EA Data Ingest
```bash
# Check for fib_levels in database
# In Supabase SQL Editor:
SELECT * FROM public.fib_levels ORDER BY received_at DESC LIMIT 10;
```

#### 5.2 Verify Dashboard Access
1. Open `https://smcsuperfibwebapp.klintaruvinga.workers.dev`
2. Should load the dashboard UI
3. API calls should route through Worker → Railway → Supabase

#### 5.3 Check EA Session
```bash
# Verify EA session is recorded
SELECT * FROM public.ea_sessions WHERE status = 'connected';
```

---

## Troubleshooting

### Backend Build Issues
- **Error**: `Cannot find module '<repo-root>\nitro\dist\cli\index.mjs'`
- **Fix**: Use `node node_modules/nitro/dist/cli/index.mjs build` instead of `npm run build`

### EA Compile Errors
- **Error**: Missing `string userId` parameter
- **Fix**: Ensure you pulled latest main: `git pull origin main`

### Supabase Connection Issues
- **Error**: Connection refused on port 5432
- **Fix**: Use pooler URL on port 6543 with `prepare:false` (already set in code)

### Railway Environment Variables
- **Error**: `DATABASE_URL` not found
- **Fix**: Set all required vars in Railway dashboard before deployment

### Worker Proxy Issues
- **Error**: 502 Bad Gateway from Worker
- **Fix**: Verify `RAILWAY_BACKEND_URL` is set correctly in Worker env vars

---

## Deployment Architecture

```
Browser
  ↓
Cloudflare Worker (smcsuperfibwebapp.klintaruvinga.workers.dev)
  - Serves frontend from dist/client
  - Proxies /api/* to Railway
  ↓
Railway (Nitro backend)
  - EA endpoints: /api/ea/*
  - Auth endpoints: /api/auth/*
  - Market data: /api/market-data/*
  ↓
Supabase PostgreSQL (yfodcdqpkgpbrzdpeqtb)
  - users, fib_levels, ea_sessions
  - Direct connection via pooler (port 6543)
```

---

## What I Still Need From You

### Critical Configuration (Non-Secret):
The deployment requires the following environment variables. Configure them directly in Railway's dashboard or secret manager. **Do not share credential values in chat or commit them to the repository.**

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | JWT service-role key | Supabase dashboard → Settings → API (copy service_role key) |
| `DATABASE_URL` | Pooler connection string | Supabase dashboard → Settings → Database → Connection pooling (port 6543) |
| `JWT_SECRET` | Backend auth secret | Generate: `openssl rand -hex 32` |
| `EA_API_KEY` | EA authentication key | Generate: `openssl rand -hex 32`, store in secret manager |

**Security Notice**: If any credentials were previously shared in this conversation or committed to the repository, rotate them immediately via the Supabase dashboard and Railway environment settings.

### Confirmation Points:
1. **Railway Account** - Confirm you have a Railway account, or indicate if an alternative like Render is preferred

---

## Next Steps

After configuring the environment variables in Railway:
1. Deploy the backend via `railway up`
2. Verify the health endpoint returns `{"status":"ok"}`
3. Complete Phase 3 (Cloudflare Worker) and Phase 4 (MT5 EA) as documented above
4. Run end-to-end validation to confirm data flow from EA → Railway → Supabase

---

**Build Artifacts Location:**
- Backend: `backend/.output/server/index.mjs`
- Frontend: `dist/client/` and `dist/server/`

**Configuration Files Created:**
- `backend/railway.json` - Railway deployment config
- `backend/supabase/config.toml` - Supabase CLI config template
