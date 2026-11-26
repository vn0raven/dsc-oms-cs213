-- CS 213 SA 3 additive migration: local password/session authentication and Operations Data Mart.
-- Preserves all existing M1-M3.5 and Finalization tables, triggers, and records (0001-0009).

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 100000 CHECK (iterations >= 100000),
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id, revoked_at);

-- Operations Analytics Data Mart (Star Schema)
CREATE TABLE dm_dim_month (
  month_key TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  label TEXT NOT NULL
);

CREATE TABLE dm_dim_department (
  department_key TEXT PRIMARY KEY REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  department_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Inactive'))
);

CREATE TABLE dm_fact_department_monthly_tasks (
  month_key TEXT NOT NULL REFERENCES dm_dim_month(month_key) ON DELETE RESTRICT,
  department_key TEXT NOT NULL REFERENCES dm_dim_department(department_key) ON DELETE RESTRICT,
  active_task_count INTEGER NOT NULL DEFAULT 0 CHECK (active_task_count >= 0),
  completed_task_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_task_count >= 0),
  overdue_task_count INTEGER NOT NULL DEFAULT 0 CHECK (overdue_task_count >= 0),
  avg_progress REAL NOT NULL DEFAULT 0 CHECK (avg_progress BETWEEN 0 AND 100),
  loaded_at TEXT NOT NULL,
  PRIMARY KEY (month_key, department_key)
);
CREATE INDEX idx_dm_fact_dept ON dm_fact_department_monthly_tasks(department_key, month_key);

CREATE TABLE dm_etl_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  triggered_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_task_count INTEGER NOT NULL CHECK (source_task_count >= 0),
  mart_task_count INTEGER NOT NULL CHECK (mart_task_count >= 0),
  reconciled INTEGER NOT NULL CHECK (reconciled IN (0, 1))
);
CREATE INDEX idx_dm_etl_runs_started ON dm_etl_runs(started_at DESC);
