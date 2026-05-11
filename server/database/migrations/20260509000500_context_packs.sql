CREATE TABLE IF NOT EXISTS rd_context_packs (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
  prd_id TEXT REFERENCES rd_prds(id) ON DELETE SET NULL,
  spec_id TEXT REFERENCES rd_specs(id) ON DELETE SET NULL,
  pipeline_run_id TEXT REFERENCES rd_pipeline_runs(id) ON DELETE SET NULL,
  version INT NOT NULL,
  checksum TEXT NOT NULL,
  manifest JSONB NOT NULL,
  content JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requirement_id, version)
);

CREATE INDEX IF NOT EXISTS idx_rd_context_packs_requirement_version
  ON rd_context_packs (requirement_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_rd_context_packs_pipeline_run
  ON rd_context_packs (pipeline_run_id, created_at DESC);
