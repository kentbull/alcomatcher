CREATE TABLE IF NOT EXISTS compliance_applications (
  application_id UUID PRIMARY KEY,
  document_id UUID NOT NULL,
  regulatory_profile TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  current_status TEXT NOT NULL,
  sync_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_events (
  event_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES compliance_applications(application_id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_events_application_id_created_at
  ON application_events(application_id, created_at);

CREATE TABLE IF NOT EXISTS application_crdt_ops (
  op_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES compliance_applications(application_id),
  actor_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, actor_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_application_crdt_ops_application_id_sequence
  ON application_crdt_ops(application_id, sequence);

CREATE TABLE IF NOT EXISTS batch_jobs (
  batch_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES compliance_applications(application_id),
  total_items INTEGER NOT NULL,
  accepted_items INTEGER NOT NULL DEFAULT 0,
  rejected_items INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batch_items (
  batch_item_id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES batch_jobs(batch_id),
  client_label_id TEXT NOT NULL,
  image_filename TEXT NOT NULL,
  status TEXT NOT NULL,
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
