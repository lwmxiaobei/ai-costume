PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  support_cents INTEGER NOT NULL DEFAULT 0 CHECK (support_cents >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_rank ON projects(status, support_cents DESC, created_at ASC);

CREATE TABLE pending_checkouts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 100),
  unit_amount_cents INTEGER NOT NULL CHECK (unit_amount_cents >= 50),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 50),
  provider_checkout_id TEXT UNIQUE,
  provider_product_id TEXT NOT NULL,
  payment_provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'pending', 'paid', 'failed', 'expired', 'refunded', 'disputed')),
  order_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_pending_status ON pending_checkouts(status, created_at);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  checkout_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  pending_checkout_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  reversed_cents INTEGER NOT NULL DEFAULT 0 CHECK (reversed_cents >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  payment_provider TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pending_checkout_id) REFERENCES pending_checkouts(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_payments_provider_order ON payments(payment_provider, order_id);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_events_object ON payment_events(object_id, event_type);
