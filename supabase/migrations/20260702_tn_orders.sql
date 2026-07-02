-- ================================================================
-- tn_orders — Órdenes crudas de Tiendanube (1 fila por orden)
-- ================================================================
-- Hoy el sync solo guarda RESÚMENES. Esta tabla persiste cada orden para
-- habilitar: LTV / recurrencia de clientes, revenue neto (descontando
-- canceladas/devueltas), ventas y margen a nivel producto/SKU.
--
-- Se popula desde sync-tiendanube (upsert por id → acumula historial).
-- ================================================================

CREATE TABLE IF NOT EXISTS tn_orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  tn_order_id       TEXT NOT NULL,
  order_number      TEXT,
  order_date        TIMESTAMPTZ,
  customer_id       TEXT,
  customer_email    TEXT,
  status            TEXT,               -- open | closed | cancelled
  payment_status    TEXT,               -- paid | pending | ...
  total             NUMERIC,
  subtotal          NUMERIC,
  shipping_cost_owner   NUMERIC,        -- lo que absorbe el negocio
  installments_cost NUMERIC,            -- cuotas sin interés absorbidas
  payment_method    TEXT,
  shipping_method   TEXT,
  province          TEXT,
  products          JSONB DEFAULT '[]', -- items normalizados
  units             INTEGER,
  synced_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (brand_id, tn_order_id)
);

CREATE INDEX IF NOT EXISTS idx_tn_orders_date     ON tn_orders (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_tn_orders_customer ON tn_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_tn_orders_status   ON tn_orders (payment_status);
-- Índice GIN para consultar dentro de products (ventas por producto)
CREATE INDEX IF NOT EXISTS idx_tn_orders_products ON tn_orders USING GIN (products);

ALTER TABLE tn_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read tn_orders" ON tn_orders;
CREATE POLICY "Authenticated read tn_orders" ON tn_orders FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service writes tn_orders" ON tn_orders;
CREATE POLICY "Service writes tn_orders" ON tn_orders FOR ALL USING (true) WITH CHECK (true);
