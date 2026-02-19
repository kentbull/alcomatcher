-- Migration 008: Add image quality assessment columns to submission_images
-- Enables per-image quality feedback and reshoot guidance for the mobile app.

ALTER TABLE submission_images
  ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'assessing'
    CHECK (quality_status IN ('assessing', 'good', 'reshoot')),
  ADD COLUMN IF NOT EXISTS quality_issues JSONB,
  ADD COLUMN IF NOT EXISTS quality_score FLOAT,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES submission_images(image_id);

CREATE INDEX IF NOT EXISTS idx_submission_images_quality_status
  ON submission_images(application_id, quality_status);
