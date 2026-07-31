-- SMC-06: trade journal + risk limits
-- Migration 005 — adds trades and risk_limits tables.

CREATE TABLE IF NOT EXISTS trades (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  symbol varchar(24) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price numeric(20, 8) NOT NULL,
  exit_price numeric(20, 8),
  lot_size numeric(12, 4) NOT NULL,
  pnl numeric(20, 4),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_user ON trades (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (user_id, status);

CREATE TABLE IF NOT EXISTS risk_limits (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  daily_loss_limit numeric(20, 4) NOT NULL DEFAULT 0,
  max_open_positions numeric(6, 0) NOT NULL DEFAULT 5,
  max_position_size numeric(12, 4) NOT NULL DEFAULT 0,
  max_per_symbol_exposure numeric(12, 4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
