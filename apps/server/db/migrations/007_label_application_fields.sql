-- Migration 007: Rename compliance_applications to label_applications and add brand/class metadata
-- The TTB concept of a label application is made first-class.

-- Rename table; PostgreSQL automatically rewires FK constraints on
-- application_events, application_crdt_ops, and batch_jobs.
-- The submission_images FK is managed by ensureSubmissionImagesSchema() inline DDL
-- in eventStore.ts — that DDL uses IF NOT EXISTS so it will recreate cleanly after rebuild.
ALTER TABLE compliance_applications RENAME TO label_applications;

-- Add first-class metadata columns extracted from scan results
ALTER TABLE label_applications
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS class_type TEXT;
