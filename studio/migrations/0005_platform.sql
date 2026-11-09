PRAGMA foreign_keys = ON;

CREATE TABLE email_messages (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  subject TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  email_provider TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE INDEX idx_email_messages_status ON email_messages(status, created_at DESC);
CREATE INDEX idx_email_messages_to ON email_messages(to_email, created_at DESC);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  payment_provider TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  status TEXT NOT NULL DEFAULT 'failed' CHECK (status IN ('failed', 'resolved')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  error_code TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, created_at DESC);
CREATE UNIQUE INDEX idx_webhook_deliveries_event ON webhook_deliveries(payment_provider, event_id);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  window_started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_rate_limits_expires ON rate_limits(expires_at);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

INSERT INTO app_settings (key, value) VALUES
  ('signups_enabled', 'true'),
  ('checkout_enabled', 'true'),
  ('maintenance_message', '');
