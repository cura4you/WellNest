ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE revoked_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX revoked_tokens_expiry_idx ON revoked_tokens(expires_at);
CREATE TABLE password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(user_id);
-- Enforce recovery throttles across serverless instances, without storing emails/IPs.
CREATE TABLE auth_rate_limits (
  key_hash CHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL
);
ALTER TABLE hospitals ADD COLUMN proof_dek_wrapped TEXT;
ALTER TABLE hospitals ADD COLUMN proof_dek_iv TEXT;
