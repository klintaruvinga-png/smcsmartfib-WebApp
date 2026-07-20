-- Migration 004: Add user settings JSONB column
-- Stores structured user preferences (notifications, theme, watchlist, risk),
-- normalizing the WordPress wp_usermeta key/value store into a single JSONB
-- object for TanStack. The shadow-sync phase (gated) maps usermeta keys here.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
