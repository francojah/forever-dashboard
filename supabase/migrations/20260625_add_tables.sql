-- ============================================================
-- Migration: 2026-06-25
-- 1. summary_mtd column in tiendanube_snapshots
-- 2. recurring_expenses table
-- 3. product_costs table
-- ============================================================

-- 1. Agregar columna summary_mtd (mes calendario desde el 1ro hasta hoy)
--    Evita el problema de summary_30d que incluye días del mes anterior.
ALTER TABLE tiendanube_snapshots
  ADD COLUMN IF NOT EXISTS summary_mtd jsonb;

-- 2. Gastos fijos recurrentes (alquiler, sueldos, servicios, etc.)
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  amount_ars  numeric     NOT NULL,
  category    text        NOT NULL DEFAULT 'fijo',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Costos por producto (ingresados manualmente, usados en Capital en Inventario)
CREATE TABLE IF NOT EXISTS product_costs (
  product_id    text        NOT NULL PRIMARY KEY,
  product_name  text        NOT NULL DEFAULT '',
  unit_cost     numeric     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
