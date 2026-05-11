CREATE TABLE IF NOT EXISTS rd_pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_task_id TEXT REFERENCES rd_pipeline_tasks(id) ON DELETE SET NULL,
  requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  trigger_mode TEXT NOT NULL DEFAULT 'manual',
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_pipeline_runs_requirement_created
  ON rd_pipeline_runs (requirement_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rd_pipeline_step_runs (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL REFERENCES rd_pipeline_runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  input_ref TEXT,
  output_ref TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_pipeline_step_runs_run_order
  ON rd_pipeline_step_runs (pipeline_run_id, order_index ASC);
