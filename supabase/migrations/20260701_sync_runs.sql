-- ================================================================
-- sync_runs — Observabilidad de las corridas de sincronización
-- Cada corrida del cron (Meta / Tiendanube) registra su resultado aquí.
-- Alimenta /api/health y la vista de estado en Settings.
-- ================================================================

CREATE TABLE IF NOT EXISTS sync_runs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source        TEXT NOT NULL,                 -- 'meta' | 'tiendanube'
  status        TEXT NOT NULL CHECK (status IN ('success','error','partial')),
  snapshot_date DATE,
  duration_ms   INTEGER,
  details       JSONB DEFAULT '{}',
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_source_created
  ON sync_runs (source, created_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sync_runs" ON sync_runs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service write sync_runs" ON sync_runs
  FOR INSERT WITH CHECK (true);

-- Limpieza opcional: conservar solo los últimos 90 días
-- (ejecutar manualmente o con un cron de mantenimiento)
-- DELETE FROM sync_runs WHERE created_at < NOW() - INTERVAL '90 days';
