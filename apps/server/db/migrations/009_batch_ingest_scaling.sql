-- Migration 009: Batch ingest scaling metadata and item linkage fields
ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS ingest_status TEXT,
  ADD COLUMN IF NOT EXISTS discovered_items INTEGER,
  ADD COLUMN IF NOT EXISTS queued_items INTEGER,
  ADD COLUMN IF NOT EXISTS processing_items INTEGER,
  ADD COLUMN IF NOT EXISTS completed_items INTEGER,
  ADD COLUMN IF NOT EXISTS failed_items INTEGER,
  ADD COLUMN IF NOT EXISTS archive_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS error_summary TEXT;

ALTER TABLE batch_items
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS expected_brand_name TEXT,
  ADD COLUMN IF NOT EXISTS expected_class_type TEXT,
  ADD COLUMN IF NOT EXISTS expected_abv_text TEXT,
  ADD COLUMN IF NOT EXISTS expected_net_contents TEXT,
  ADD COLUMN IF NOT EXISTS expected_government_warning TEXT,
  ADD COLUMN IF NOT EXISTS require_gov_warning BOOLEAN,
  ADD COLUMN IF NOT EXISTS front_image_path TEXT,
  ADD COLUMN IF NOT EXISTS back_image_path TEXT,
  ADD COLUMN IF NOT EXISTS additional_image_paths JSONB;

CREATE INDEX IF NOT EXISTS idx_batch_items_batch_status_updated_at
  ON batch_items(batch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch_created_at
  ON batch_items(batch_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_updated_at
  ON batch_jobs(updated_at DESC);
