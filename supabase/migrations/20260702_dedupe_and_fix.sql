-- ================================================================
-- Dedupe + restaurar UNIQUE(snapshot_date) en meta_snapshots
-- ================================================================
-- Si el fix anterior no tomó, casi seguro es porque había filas duplicadas
-- de snapshot_date (quedaron sin la constraint) y el ADD CONSTRAINT falló.
-- Este script las deduplica (conserva la más reciente por created_at) y
-- después crea la constraint. Idempotente.
-- ================================================================

-- 1) Ver si hay duplicados (informativo — podés correr solo esto primero):
-- SELECT snapshot_date, count(*) FROM meta_snapshots GROUP BY snapshot_date HAVING count(*) > 1;

-- 2) Borrar duplicados, conservando la fila más nueva de cada día
DELETE FROM meta_snapshots a
USING meta_snapshots b
WHERE a.snapshot_date = b.snapshot_date
  AND a.ctid < b.ctid
  AND a.created_at <= b.created_at;

-- Por si empatan en created_at, un segundo pase por ctid
DELETE FROM meta_snapshots a
USING meta_snapshots b
WHERE a.snapshot_date = b.snapshot_date
  AND a.ctid < b.ctid;

-- 3) Sacar índices parciales (si siguen)
DROP INDEX IF EXISTS meta_snapshots_brand_date;
DROP INDEX IF EXISTS meta_snapshots_legacy_date;

-- 4) Crear la constraint única (ahora sí, sin duplicados)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_snapshots_snapshot_date_key'
  ) THEN
    ALTER TABLE meta_snapshots
      ADD CONSTRAINT meta_snapshots_snapshot_date_key UNIQUE (snapshot_date);
  END IF;
END $$;

-- 5) Verificación — debería devolver 1 fila (meta_snapshots_snapshot_date_key)
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'meta_snapshots'::regclass AND contype = 'u';
