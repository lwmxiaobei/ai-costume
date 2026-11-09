PRAGMA defer_foreign_keys = ON;


CREATE TABLE plan_prices_waffo (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe', 'polar', 'creem', 'waffo')),
  provider_price_id TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  usage_type TEXT NOT NULL DEFAULT 'licensed' CHECK (usage_type IN ('licensed', 'metered')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

INSERT INTO plan_prices_waffo SELECT * FROM plan_prices;
DROP TABLE plan_prices;
ALTER TABLE plan_prices_waffo RENAME TO plan_prices;

CREATE UNIQUE INDEX idx_plan_prices_provider ON plan_prices(payment_provider, provider_price_id);

CREATE INDEX idx_plan_prices_plan ON plan_prices(plan_id, is_active);

CREATE TABLE billing_customers_waffo (
  user_id TEXT NOT NULL,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe', 'polar', 'creem', 'waffo')),
  provider_customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, payment_provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO billing_customers_waffo SELECT * FROM billing_customers;
DROP TABLE billing_customers;
ALTER TABLE billing_customers_waffo RENAME TO billing_customers;

CREATE UNIQUE INDEX idx_billing_customers_provider ON billing_customers(payment_provider, provider_customer_id);

CREATE TABLE subscriptions_waffo (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  price_id TEXT,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe', 'polar', 'creem', 'waffo')),
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

INSERT INTO subscriptions_waffo SELECT * FROM subscriptions;
DROP TABLE subscriptions;
ALTER TABLE subscriptions_waffo RENAME TO subscriptions;

CREATE UNIQUE INDEX idx_subscriptions_provider ON subscriptions(payment_provider, provider_subscription_id);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, status);

CREATE TABLE waffo_refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_waffo_refunds_order ON waffo_refunds(order_id);

