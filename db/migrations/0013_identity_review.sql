ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE email_verification_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_user_idx ON email_verification_tokens(user_id);
CREATE TABLE provider_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  dek_wrapped TEXT,
  dek_iv TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_proofs_user_idx ON provider_proofs(user_id);
CREATE TABLE provider_applications (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected')),
  proof_id UUID REFERENCES provider_proofs(id),
  revision INTEGER NOT NULL DEFAULT 0,
  submission_note TEXT NOT NULL DEFAULT '',
  review_reason TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE provider_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('details_updated','proof_uploaded','submitted','approved','rejected')),
  reason TEXT NOT NULL DEFAULT '',
  license_number TEXT,
  revision INTEGER NOT NULL,
  proof_id UUID REFERENCES provider_proofs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_review_events_user_idx ON provider_review_events(user_id, created_at);
INSERT INTO provider_applications(user_id) SELECT id FROM users WHERE role IN ('doctor','hospital');
-- Preserve the old proof object and its real readability state; never invent a missing key.
INSERT INTO provider_proofs(user_id,object_key,filename,mime_type,dek_wrapped,dek_iv)
 SELECT user_id,proof_file_id,COALESCE(proof_filename,'Hospital proof'),'application/octet-stream',proof_dek_wrapped,proof_dek_iv
 FROM hospitals WHERE proof_file_id IS NOT NULL;
UPDATE provider_applications a SET proof_id=p.id FROM provider_proofs p WHERE a.user_id=p.user_id;
