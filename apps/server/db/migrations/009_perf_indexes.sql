-- High priority: listRecentQuickCheckMetrics() scans all events filtered by event_type
-- This grows with every scan; becomes expensive fast without an index
CREATE INDEX IF NOT EXISTS idx_application_events_event_type_created_at
  ON application_events(event_type, created_at DESC);

-- High priority: listBatchItems() called on every batch status poll
CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id_created_at
  ON batch_items(batch_id, created_at ASC);

-- Medium: listApplications() sorts entire table by updated_at DESC LIMIT 200
CREATE INDEX IF NOT EXISTS idx_label_applications_updated_at_desc
  ON label_applications(updated_at DESC);

-- Medium: backfill and status filter queries
CREATE INDEX IF NOT EXISTS idx_label_applications_current_status
  ON label_applications(current_status);

CREATE INDEX IF NOT EXISTS idx_label_applications_sync_state
  ON label_applications(sync_state);

-- Medium: batch_jobs queried by application_id
CREATE INDEX IF NOT EXISTS idx_batch_jobs_application_id
  ON batch_jobs(application_id);

-- Low: worker heartbeat scans images for expiry
CREATE INDEX IF NOT EXISTS idx_submission_images_created_at
  ON submission_images(created_at ASC);

-- Low: partial index for active OTP lookups
CREATE INDEX IF NOT EXISTS idx_otp_challenges_email_active
  ON otp_challenges(email, expires_at DESC)
  WHERE consumed_at IS NULL;
