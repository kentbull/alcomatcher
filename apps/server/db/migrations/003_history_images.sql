CREATE TABLE IF NOT EXISTS submission_images (
  image_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES compliance_applications(application_id),
  role TEXT NOT NULL,
  image_index INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumb_storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_images_application_id_created_at
  ON submission_images(application_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_images_app_role_index_sha
  ON submission_images(application_id, role, image_index, sha256);
