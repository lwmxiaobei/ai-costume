PRAGMA foreign_keys = ON;

ALTER TABLE pending_checkouts ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_user ON payments(user_id, paid_at DESC);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  seat_based INTEGER NOT NULL DEFAULT 0 CHECK (seat_based IN (0, 1)),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0 AND trial_days <= 90),
  features TEXT NOT NULL DEFAULT '[]',
  quotas TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plans_active ON plans(is_active, sort_order);

CREATE TABLE plan_prices (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe', 'polar', 'creem')),
  provider_price_id TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  usage_type TEXT NOT NULL DEFAULT 'licensed' CHECK (usage_type IN ('licensed', 'metered')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_plan_prices_provider ON plan_prices(payment_provider, provider_price_id);
CREATE INDEX idx_plan_prices_plan ON plan_prices(plan_id, is_active);

CREATE TABLE billing_customers (
  user_id TEXT NOT NULL,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe', 'polar', 'creem')),
  provider_customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, payment_provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_billing_customers_provider ON billing_customers(payment_provider, provider_customer_id);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  price_id TEXT,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe', 'polar', 'creem')),
  provider_subscription_id TEXT NOT NULL,
  provider_customer_id TEXT,
  status TEXT NOT NULL CHECK (status IN
    ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused', 'unpaid')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  trial_end TEXT,
  canceled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE UNIQUE INDEX idx_subscriptions_provider ON subscriptions(payment_provider, provider_subscription_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, status);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reported_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reported_quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_usage_records_key ON usage_records(user_id, metric, period);

INSERT INTO plans (id, name, description, sort_order, is_default, seat_based, trial_days, features, quotas) VALUES
  ('free', 'Free', 'Everything needed to evaluate the product.', 0, 1, 0, 0,
   '["core"]', '{"projects":3,"api_calls":1000}'),
  ('pro', 'Pro', 'For creators shipping a real product.', 1, 0, 0, 14,
   '["core","analytics","priority_support"]', '{"projects":50,"api_calls":100000}'),
  ('business', 'Business', 'Seat based billing for teams.', 2, 0, 1, 14,
   '["core","analytics","priority_support","sso","audit_log"]', '{"projects":-1,"api_calls":-1}');
