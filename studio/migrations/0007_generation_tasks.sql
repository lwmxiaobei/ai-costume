PRAGMA foreign_keys = ON;

CREATE TABLE generation_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_task_id TEXT,
  prompt TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input)),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'submitting', 'running', 'succeeded', 'failed')),
  outputs TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(outputs)),
  error_code TEXT,
  timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds > 0),
  lease_token TEXT,
  lease_until INTEGER,
  next_poll_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(user_id, request_key)
);

CREATE INDEX idx_generation_tasks_user ON generation_tasks(user_id, created_at DESC, id DESC);
CREATE INDEX idx_generation_tasks_pending ON generation_tasks(status, next_poll_at, lease_until);
