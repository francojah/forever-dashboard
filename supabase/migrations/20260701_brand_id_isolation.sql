-- ================================================================
-- Multi-brand — Phase 2: aislación de datos por brand_id
-- ================================================================
-- Agrega brand_id (nullable) a las tablas core para poder aislar datos
-- por marca sin romper los datos legacy mono-marca existentes (quedan con
-- brand_id NULL y siguen visibles para cualquier usuario autenticado).
--
-- Estrategia de migración segura:
--   1) Agregar columna nullable (esta migración) — no rompe nada.
--   2) Seed de la marca Forever Basics + backfill brand_id de filas legacy.
--   3) Cuando todo tenga brand_id, endurecer las RLS policies.
-- ================================================================

ALTER TABLE meta_snapshots       ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE alerts               ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE leads                ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE creatives            ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE creative_ideas       ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE competitor_analyses  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;

-- NOTA: NO tocar la constraint UNIQUE(snapshot_date). El sync usa
-- ON CONFLICT (snapshot_date) y Postgres no puede inferir índices parciales,
-- así que se mantiene la constraint simple. La aislación por marca de
-- meta_snapshots (cuando se active multi-marca real) se hará con
-- UNIQUE NULLS NOT DISTINCT (brand_id, snapshot_date) + cambiar el onConflict.
CREATE INDEX IF NOT EXISTS idx_meta_snapshots_brand ON meta_snapshots (brand_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_brand         ON alerts (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_brand          ON leads (brand_id, created_at DESC);

-- Corregir los defaults económicos de brands (estaban desactualizados).
-- Forever Basics real: breakeven CPA ~$30.5K, ROAS mín 1.77x, margen 53%, AOV $57.5K.
ALTER TABLE brands ALTER COLUMN settings SET DEFAULT '{
  "breakeven_cpa": 30462,
  "roas_min": 1.77,
  "currency": "ARS",
  "margin_pct": 53,
  "avg_ticket": 57500
}'::jsonb;

-- ── Seed + backfill (descomentar y ajustar TN_USER_ID al ejecutar) ──
-- INSERT INTO brands (name, slug, meta_account_id, settings)
-- VALUES ('Forever Basics', 'forever-basics', 'act_1614288152915913',
--   '{"breakeven_cpa":30462,"roas_min":1.77,"currency":"ARS","margin_pct":53,"avg_ticket":57500}')
-- ON CONFLICT (slug) DO NOTHING;
--
-- WITH fb AS (SELECT id FROM brands WHERE slug = 'forever-basics')
-- UPDATE meta_snapshots SET brand_id = (SELECT id FROM fb) WHERE brand_id IS NULL;
-- (repetir el UPDATE para alerts, leads, creatives, creative_ideas, competitor_analyses)
