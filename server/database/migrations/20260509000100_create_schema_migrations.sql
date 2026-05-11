CREATE TABLE IF NOT EXISTS rd_schema_migrations (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
