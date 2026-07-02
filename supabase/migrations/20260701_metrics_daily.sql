-- ================================================================
-- metrics_daily — Modelo plano de métricas (1 fila por entidad + día)
-- ================================================================
-- Complementa (no reemplaza) los snapshots JSONB de meta_snapshots.
-- El JSONB es ideal para "mostrar el día"; esta tabla plana habilita:
--   • Series temporales por campaña / adset / ad (evolución de CPA, ROAS, gasto)
--   • Rangos de fecha arbitrarios y agregaciones eficientes
--   • Comparativas y cohortes
--
-- Se puede popular desde el mismo cron (upsert por entity_id + date + period)
-- o con un backfill que recorra los snapshots históricos.
-- ================================================================

CREATE TABLE IF NOT EXISTS metrics_daily (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE,
  metric_date    DATE NOT NULL,
  period         TEXT NOT NULL DEFAULT 'day',   -- 'day' | 'last_7d' | 'last_30d'
  entity_type    TEXT NOT NULL,                 -- 'campaign' | 'adset' | 'ad' | 'account'
  entity_id      TEXT NOT NULL,
  entity_name    TEXT,
  campaign_id    TEXT,
  adset_id       TEXT,
  status         TEXT,

  -- Métricas
  spend            NUMERIC,
  impressions      BIGINT,
  clicks           BIGINT,
  ctr              NUMERIC,
  frequency        NUMERIC,
  results          NUMERIC,          -- compras
  cost_per_result  NUMERIC,          -- CPA
  roas             NUMERIC,
  hook_rate        NUMERIC,
  view_rate        NUMERIC,
  daily_budget     NUMERIC,

  created_at     TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (brand_id, metric_date, period, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_entity
  ON metrics_daily (entity_type, entity_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_daily_brand_date
  ON metrics_daily (brand_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_daily_campaign
  ON metrics_daily (campaign_id, metric_date DESC);

ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;

-- Lectura: solo entidades de marcas a las que pertenece el usuario
-- (si brand_id es NULL — datos legacy mono-marca — cualquier autenticado lee)
CREATE POLICY "Users read their brand metrics" ON metrics_daily
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      brand_id IS NULL OR
      brand_id IN (SELECT brand_id FROM user_brands WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Service writes metrics" ON metrics_daily
  FOR ALL USING (true) WITH CHECK (true);
