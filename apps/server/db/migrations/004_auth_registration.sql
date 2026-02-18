ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

UPDATE auth_users
SET email_verified_at = COALESCE(email_verified_at, created_at),
    updated_at = NOW()
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_challenges (
  challenge_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(user_id),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  verification_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  email_job_status TEXT NOT NULL DEFAULT 'queued',
  email_job_error TEXT,
  requested_ip TEXT,
  requested_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_email_created_at
  ON email_verification_challenges(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_job_status_created_at
  ON email_verification_challenges(email_job_status, created_at ASC);

CREATE TABLE IF NOT EXISTS auth_role_audit (
  audit_id UUID PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES auth_users(user_id),
  old_role TEXT NOT NULL CHECK (old_role IN ('compliance_officer', 'compliance_manager')),
  new_role TEXT NOT NULL CHECK (new_role IN ('compliance_officer', 'compliance_manager')),
  changed_by_user_id UUID NOT NULL REFERENCES auth_users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
