CREATE TABLE IF NOT EXISTS rd_requirement_flow_events (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL,
  operator TEXT,
  comment TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_requirement_flow_events_requirement_created
  ON rd_requirement_flow_events (requirement_id, created_at ASC);
