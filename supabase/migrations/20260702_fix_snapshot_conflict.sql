-- ================================================================
-- FIX — Restaurar UNIQUE(snapshot_date) en meta_snapshots
-- ================================================================
-- La migración 20260701_brand_id_isolation.sql reemplazó la constraint
-- UNIQUE(snapshot_date) por índices PARCIALES. Postgres NO puede inferir un
-- índice parcial en `ON CONFLICT (snapshot_date)`, y el sync (upsert por
-- snapshot_date) empezó a fallar con:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Solución: volver a la constraint simple UNIQUE(snapshot_date), que es lo que
-- el sync usa hoy (mono-marca, brand_id NULL en todas las filas).
-- Cuando se active multi-marca de verdad se revisará con NULLS NOT DISTINCT.
-- ================================================================

-- Sacar los índices parciales que rompieron el ON CONFLICT
DROP INDEX IF EXISTS meta_snapshots_brand_date;
DROP INDEX IF EXISTS meta_snapshots_legacy_date;

-- Restaurar la constraint única simple (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_snapshots_snapshot_date_key'
  ) THEN
    ALTER TABLE meta_snapshots
      ADD CONSTRAINT meta_snapshots_snapshot_date_key UNIQUE (snapshot_date);
  END IF;
END $$;

-- Índice no-único por marca (para futuras consultas multi-marca) — no interfiere
CREATE INDEX IF NOT EXISTS idx_meta_snapshots_brand ON meta_snapshots (brand_id, snapshot_date DESC);
