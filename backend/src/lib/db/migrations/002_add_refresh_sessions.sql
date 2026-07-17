-- refresh_sessions: server-side refresh tokens for JWT rotation (Phase 2).
CREATE TABLE IF NOT EXISTS public.refresh_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent   TEXT,
  ip_address   INET
);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON public.refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires ON public.refresh_sessions(expires_at);

ALTER TABLE public.refresh_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refresh_sessions_user_read" ON public.refresh_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "refresh_sessions_user_delete" ON public.refresh_sessions
  FOR DELETE USING (user_id = auth.uid());
