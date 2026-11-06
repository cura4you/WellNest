CREATE TABLE demo_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '2 hours',
  generation INTEGER NOT NULL DEFAULT 1,
  resets_used INTEGER NOT NULL DEFAULT 0,
  uploads_used INTEGER NOT NULL DEFAULT 0,
  ai_requests_used INTEGER NOT NULL DEFAULT 0,
  api_calls_used INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE users ADD COLUMN demo_workspace_id UUID REFERENCES demo_workspaces(id);
CREATE INDEX users_demo_workspace_idx ON users(demo_workspace_id);
CREATE INDEX demo_workspaces_expiry_idx ON demo_workspaces(expires_at);
-- Guest ciphertext lives in expiring database storage, never the permanent R2 bucket.
CREATE TABLE demo_files (
  object_key TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX demo_files_workspace_idx ON demo_files(workspace_id);
CREATE TABLE demo_daily_usage (
  day DATE PRIMARY KEY,
  workspaces_created INTEGER NOT NULL DEFAULT 0,
  provider_calls INTEGER NOT NULL DEFAULT 0
);
