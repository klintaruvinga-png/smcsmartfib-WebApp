-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  backend_url TEXT,
  api_key_status VARCHAR(50),
  refresh_interval_sec INTEGER DEFAULT 30,
  stale_threshold_sec INTEGER DEFAULT 300,
  watchlist TEXT[],
  risk_allocation JSONB,
  signal_board_size INTEGER DEFAULT 3
);

-- User risk profiles table
CREATE TABLE IF NOT EXISTS user_risk_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(50) DEFAULT 'bronze',
  max_concurrent_trades INTEGER DEFAULT 3,
  per_trade_pct DECIMAL(5, 2) DEFAULT 1.0,
  daily_max_pct DECIMAL(5, 2) DEFAULT 3.0,
  dd_cap_pct DECIMAL(5, 2) DEFAULT 10.0,
  cooldown_min INTEGER DEFAULT 15,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Twelve Data API keys table
CREATE TABLE IF NOT EXISTS twelve_data_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  api_key TEXT,
  status VARCHAR(50) DEFAULT 'missing',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
