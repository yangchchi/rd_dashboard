CREATE TABLE IF NOT EXISTS rd_agent_sessions (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT REFERENCES rd_pipeline_runs(id) ON DELETE SET NULL,
  requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
  spec_id TEXT REFERENCES rd_specs(id) ON DELETE SET NULL,
  context_pack_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  runtime_adapter TEXT NOT NULL DEFAULT 'custom',
  model TEXT,
  base_branch TEXT,
  agent_branch TEXT,
  plan_markdown TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_agent_sessions_pipeline_run
  ON rd_agent_sessions (pipeline_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rd_agent_sessions_requirement
  ON rd_agent_sessions (requirement_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rd_agent_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES rd_agent_sessions(id) ON DELETE CASCADE,
  pipeline_step_run_id TEXT REFERENCES rd_pipeline_step_runs(id) ON DELETE SET NULL,
  parent_task_id TEXT REFERENCES rd_agent_tasks(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_agent_tasks_session_order
  ON rd_agent_tasks (session_id, order_index ASC);

CREATE TABLE IF NOT EXISTS rd_agent_workspaces (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES rd_agent_sessions(id) ON DELETE CASCADE,
  pipeline_run_id TEXT REFERENCES rd_pipeline_runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  agent_branch TEXT NOT NULL,
  worktree_path TEXT,
  base_commit TEXT,
  head_commit TEXT,
  lock_owner_task_id TEXT REFERENCES rd_agent_tasks(id) ON DELETE SET NULL,
  is_write_locked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleaned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rd_agent_workspaces_session
  ON rd_agent_workspaces (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rd_agent_tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES rd_agent_sessions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES rd_agent_tasks(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES rd_agent_workspaces(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  status TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'not_required',
  risk_level TEXT NOT NULL DEFAULT 'low',
  input_summary TEXT NOT NULL DEFAULT '',
  output_summary TEXT,
  command TEXT,
  exit_code INT,
  duration_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_agent_tool_calls_session_created
  ON rd_agent_tool_calls (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_rd_agent_tool_calls_task_created
  ON rd_agent_tool_calls (task_id, created_at ASC);
