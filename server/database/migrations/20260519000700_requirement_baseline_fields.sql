ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES rd_products(id) ON DELETE SET NULL;
ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS change_type TEXT NOT NULL DEFAULT 'greenfield';
ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS baseline_id TEXT REFERENCES rd_product_baselines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rd_requirements_product_id ON rd_requirements (product_id);
CREATE INDEX IF NOT EXISTS idx_rd_requirements_baseline_id ON rd_requirements (baseline_id);

UPDATE rd_requirements r
SET product_id = p.id
FROM rd_products p
WHERE r.product_id IS NULL
  AND r.product IS NOT NULL
  AND trim(r.product) <> ''
  AND lower(trim(p.name)) = lower(trim(r.product));
