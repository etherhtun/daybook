-- Daybook 0001 — core identity + settings
-- D1 (SQLite). Idempotent. TEXT primary keys (app-minted). ISO-8601 date/datetime strings.

CREATE TABLE IF NOT EXISTS users (
  uid          TEXT PRIMARY KEY,          -- surrogate id; all user data keys off this
  email        TEXT UNIQUE NOT NULL,      -- from Cloudflare Access
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
  status       TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'disabled'
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- One config blob per user: enabled modules, their order, and per-module params
-- (meal schedule, workout split, budget categories, etc). JSON in TEXT.
CREATE TABLE IF NOT EXISTS settings (
  user_id    TEXT PRIMARY KEY,
  config     TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
