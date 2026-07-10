-- Daybook 0002 — module data tables
-- Every row is owned by a user (user_id = users.uid). Every query MUST scope by user_id.

-- ── Tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  notes      TEXT,
  due_date   TEXT,                         -- YYYY-MM-DD or null
  priority   INTEGER NOT NULL DEFAULT 1,   -- 0 low, 1 normal, 2 high
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due  ON tasks (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_done ON tasks (user_id, done);

-- ── Habits (recurring) + logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'bool', -- 'bool' | 'count'
  target     REAL NOT NULL DEFAULT 1,      -- count target when kind='count'
  cadence    TEXT NOT NULL DEFAULT 'daily',-- 'daily' | 'weekdays' | 7-char mask e.g. 'MTWTF__'
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits (user_id, active);

CREATE TABLE IF NOT EXISTS habit_logs (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  date     TEXT NOT NULL,                  -- YYYY-MM-DD
  value    REAL NOT NULL DEFAULT 1,
  UNIQUE (user_id, habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habitlogs_user_date ON habit_logs (user_id, date);

-- ── Journal (one entry per day) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,                -- YYYY-MM-DD
  mood       INTEGER,                      -- 1..5
  energy     INTEGER,                      -- 1..5
  text       TEXT,
  gratitude  TEXT,
  win        TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal (user_id, date);

-- ── Health: numeric metrics (weight, ldl, sleep…) ────────────────────────────
CREATE TABLE IF NOT EXISTS metrics (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,                   -- YYYY-MM-DD
  metric  TEXT NOT NULL,                   -- 'weight' | 'ldl' | 'sleep' | ...
  value   REAL NOT NULL,
  UNIQUE (user_id, date, metric)
);
CREATE INDEX IF NOT EXISTS idx_metrics_user_metric ON metrics (user_id, metric, date);

-- ── Health: boolean daily check-ins (meals, hydration cups, session…) ─────────
CREATE TABLE IF NOT EXISTS checkins (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,                   -- YYYY-MM-DD
  key     TEXT NOT NULL,                   -- 'meal:m1' | 'hyd:1_3' | 'session' | ...
  done    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date, key)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins (user_id, date);

-- ── Money: transactions + recurring bills ────────────────────────────────────
CREATE TABLE IF NOT EXISTS money_txns (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,                -- YYYY-MM-DD
  amount     REAL NOT NULL,                -- negative = spend, positive = income
  category   TEXT,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txns_user_date ON money_txns (user_id, date);

CREATE TABLE IF NOT EXISTS bills (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  amount     REAL NOT NULL,
  due_day    INTEGER,                      -- day-of-month 1..31
  recurrence TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'yearly' | 'weekly'
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills (user_id, active);

-- ── Family: milestones, events, birthdays ────────────────────────────────────
CREATE TABLE IF NOT EXISTS family (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'event',-- 'milestone' | 'event' | 'birthday'
  person     TEXT,
  title      TEXT NOT NULL,
  date       TEXT,                         -- YYYY-MM-DD (for birthdays, year may be nominal)
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_user_date ON family (user_id, date);
