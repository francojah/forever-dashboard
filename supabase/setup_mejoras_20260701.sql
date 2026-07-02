-- ================================================================
-- SETUP CONSOLIDADO — Mejoras 2026-07-01
-- ================================================================
-- Corré ESTE archivo completo de una sola vez en:
--   Supabase → SQL Editor → New query → pegar todo → Run
--
-- Crea, en orden y de forma idempotente (seguro reejecutar):
--   1) brands + user_brands  (fundación multi-marca — faltaba)
--   2) sync_runs             (observabilidad del sync)
--   3) metrics_daily         (tabla plana para tendencias)
--   4) brand_id en tablas core (aislación multi-marca)
--
-- Resuelve el error: relation "brands" does not exist.
-- ================================================================


-- ================================================================
-- 1) BRANDS + USER_BRANDS
-- ================================================================
CREATE TABLE IF NOT EXISTS brands (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  slug                    text unique not null,
  meta_account_id         text,
  meta_access_token       text,
  meta_token_expires_at   timestamptz,
  tn_user_id              text,
  tn_access_token         text,
  tn_app_id               text default '30221',
  settings                jsonb not null default '{
    "breakeven_cpa": 30462,
    "roas_min": 1.77,
    "currency": "ARS",
    "margin_pct": 53,
    "avg_ticket": 57500
  }'::jsonb,
  active                  boolean not null default true,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

CREATE TABLE IF NOT EXISTS user_brands (
  user_id   uuid not null references auth.users(id) on delete cascade,
  brand_id  uuid not null references brands(id) on delete cascade,
  role      text not null default 'viewer',
  primary key (user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS user_brands_user_idx  ON user_brands(user_id);
CREATE INDEX IF NOT EXISTS user_brands_brand_idx ON user_brands(brand_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS brands_updated_at ON brands;
CREATE TRIGGER brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE brands       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_brands  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their brands" ON brands;
CREATE POLICY "Users see their brands" ON brands FOR SELECT
  USING (id IN (SELECT brand_id FROM user_brands WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update their brands" ON brands;
CREATE POLICY "Owners can update their brands" ON brands FOR UPDATE
  USING (id IN (SELECT brand_id FROM user_brands WHERE user_id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "Users see their user_brands rows" ON user_brands;
CREATE POLICY "Users see their user_brands rows" ON user_brands FOR SELECT
  USING (user_id = auth.uid());


-- ================================================================
-- 2) SYNC_RUNS
-- ================================================================
CREATE TABLE IF NOT EXISTS sync_runs (
  id            uuid default gen_random_uuid() primary key,
  source        text not null,
  status        text not null check (status in ('success','error','partial')),
  snapshot_date date,
  duration_ms   integer,
  details       jsonb default '{}',
  error         text,
  created_at    timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_source_created ON sync_runs (source, created_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read sync_runs" ON sync_runs;
CREATE POLICY "Authenticated read sync_runs" ON sync_runs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service write sync_runs" ON sync_runs;
CREATE POLICY "Service write sync_runs" ON sync_runs FOR INSERT WITH CHECK (true);


-- ================================================================
-- 3) METRICS_DAILY
-- ================================================================
CREATE TABLE IF NOT EXISTS metrics_daily (
  id             uuid default gen_random_uuid() primary key,
  brand_id       uuid references brands(id) on delete cascade,
  metric_date    date not null,
  period         text not null default 'day',
  entity_type    text not null,
  entity_id      text not null,
  entity_name    text,
  campaign_id    text,
  adset_id       text,
  status         text,
  spend            numeric,
  impressions      bigint,
  clicks           bigint,
  ctr              numeric,
  frequency        numeric,
  results          numeric,
  cost_per_result  numeric,
  roas             numeric,
  hook_rate        numeric,
  view_rate        numeric,
  daily_budget     numeric,
  created_at     timestamptz default now(),
  UNIQUE (brand_id, metric_date, period, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_entity     ON metrics_daily (entity_type, entity_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_daily_brand_date ON metrics_daily (brand_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_daily_campaign   ON metrics_daily (campaign_id, metric_date DESC);

ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their brand metrics" ON metrics_daily;
CREATE POLICY "Users read their brand metrics" ON metrics_daily FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      brand_id IS NULL OR
      brand_id IN (SELECT brand_id FROM user_brands WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service writes metrics" ON metrics_daily;
CREATE POLICY "Service writes metrics" ON metrics_daily FOR ALL USING (true) WITH CHECK (true);


-- ================================================================
-- 4) BRAND_ID EN TABLAS CORE
-- ================================================================
ALTER TABLE meta_snapshots       ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE alerts               ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE leads                ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE creatives            ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE creative_ideas       ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE competitor_analyses  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;

ALTER TABLE meta_snapshots DROP CONSTRAINT IF EXISTS meta_snapshots_snapshot_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS meta_snapshots_brand_date
  ON meta_snapshots (brand_id, snapshot_date) WHERE brand_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS meta_snapshots_legacy_date
  ON meta_snapshots (snapshot_date) WHERE brand_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_meta_snapshots_brand ON meta_snapshots (brand_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_brand         ON alerts (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_brand          ON leads (brand_id, created_at DESC);

-- Listo. Verificá en Table Editor: brands, user_brands, sync_runs, metrics_daily
-- deberían existir, y meta_snapshots/alerts/leads deberían tener columna brand_id.
