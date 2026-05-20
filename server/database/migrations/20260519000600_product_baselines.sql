CREATE TABLE IF NOT EXISTS rd_product_baselines (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES rd_products(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  git_ref TEXT NOT NULL,
  git_url TEXT,
  as_built_markdown TEXT NOT NULL DEFAULT '',
  notes TEXT,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_rd_product_baselines_product_frozen
  ON rd_product_baselines (product_id, frozen_at DESC);

CREATE TABLE IF NOT EXISTS rd_product_capabilities (
  id TEXT PRIMARY KEY,
  baseline_id TEXT NOT NULL REFERENCES rd_product_baselines(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES rd_products(id) ON DELETE CASCADE,
  domain TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  interfaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_product_capabilities_baseline
  ON rd_product_capabilities (baseline_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_rd_product_capabilities_product
  ON rd_product_capabilities (product_id);
