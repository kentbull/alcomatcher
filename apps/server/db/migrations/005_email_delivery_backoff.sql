ALTER TABLE email_verification_challenges
  ADD COLUMN IF NOT EXISTS send_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_retry_window
  ON email_verification_challenges(email_job_status, next_attempt_at, created_at);
