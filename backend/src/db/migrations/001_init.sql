-- =============================================================================
-- SMC SuperFIB — TanStack Start Backend Schema (Phase 0)
-- Mirrors WordPress wp_smc_sf_fib_levels granularity for Phase 4 parity.
-- Deploy via Supabase SQL Editor or `supabase db push`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users: extends Supabase auth.users with EA identity + role.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
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

CREATE INDEX IF NOT EXISTS idx_users_ea_api_key ON public.users(ea_api_key);

-- -----------------------------------------------------------------------------
-- fib_levels: EA submissions. Granularity matches WordPress exactly so the
-- GET /market-data/fib-levels response groups identically (tf -> family -> ratio).
-- WordPress source family values: 'LTF_SF' | 'HTF_AF'
-- WordPress valid timeframes: M15, H1, H4, D1
-- WordPress valid ratios (16): -200,-162.5,-100,-62.5,-25,0,25,50,62.5,75,100,125,162.5,200,262.5,300
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fib_levels (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ea_api_key    TEXT NOT NULL REFERENCES public.users(ea_api_key),
  symbol        VARCHAR(24) NOT NULL,
  timeframe     VARCHAR(16) NOT NULL
                  CHECK (timeframe IN ('M15', 'H1', 'H4', 'D1')),
  family        VARCHAR(16) NOT NULL
                  CHECK (family IN ('LTF_SF', 'HTF_AF')),
  ratio         DECIMAL(10, 4) NOT NULL
                  CHECK (ratio IN (-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300)),
  price         DECIMAL(20, 8) NOT NULL,
  source        VARCHAR(20) NOT NULL DEFAULT 'mt5',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol, timeframe, family, ratio, calculated_at)
);

CREATE INDEX IF NOT EXISTS idx_fib_levels_lookup
  ON public.fib_levels (user_id, symbol, timeframe, family, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fib_levels_symbol_time
  ON public.fib_levels (user_id, symbol, calculated_at DESC);

-- -----------------------------------------------------------------------------
-- ea_sessions: EA connection / heartbeat tracking.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ea_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_api_key   TEXT NOT NULL REFERENCES public.users(ea_api_key),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address   INET,
  user_agent   TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'connected'
                 CHECK (status IN ('connected', 'disconnected', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_ea_sessions_ea ON public.ea_sessions(ea_api_key, status);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fib_levels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_sessions ENABLE ROW LEVEL SECURITY;

-- Users: read own profile; admins read all.
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_admin_read_all" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- fib_levels: owner reads own rows; EA service role writes (server-side, uses
-- supabase service role key so RLS bypasses for ingest).
CREATE POLICY "fib_levels_owner_read" ON public.fib_levels
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "fib_levels_admin_read" ON public.fib_levels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ea_sessions: owner reads own sessions.
CREATE POLICY "ea_sessions_owner_read" ON public.ea_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ea_sessions_admin_read" ON public.ea_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
