PRAGMA foreign_keys = ON;

-- 积分充值复用模板的一次性付款链路：所有积分包都挂在这个固定项目上，
-- 已购积分按 payments 的实收与退款金额实时折算，退款和争议会自动扣回。
INSERT OR IGNORE INTO projects (id, canonical_url, url, name, description, status)
VALUES (
  'project_00000000-0000-4000-8000-000000000001',
  'credits://tryon',
  'credits://tryon',
  '试穿积分',
  '试穿积分包，不在项目目录中展示',
  'active'
);

-- 赠送、扣费和失败退还记录。每个用户的 ref 唯一，重复请求不会重复记账。
CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL CHECK (reason IN ('signup_bonus', 'tryon', 'refund', 'admin')),
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, ref)
);

CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_credit_ledger_reason ON credit_ledger(reason, created_at);

-- 赠送记录按邮箱哈希保存，不随账号删除，注销后重新注册不会再领一次
CREATE TABLE credit_bonus_grants (
  email_hash TEXT PRIMARY KEY,
  granted_at TEXT NOT NULL
);
