ALTER TABLE email_verification_challenges
  ADD COLUMN IF NOT EXISTS mobile_signup BOOLEAN NOT NULL DEFAULT FALSE;
