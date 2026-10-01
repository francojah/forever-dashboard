-- ================================================================
-- exchanges — Cambios y reembolsos de clientes (portal /cambios)
-- ================================================================
-- El flujo vive 100% en la app: NO crea órdenes en Tiendanube y NO toca
-- inventario. Tiendanube solo se LEE (orden original + stock).
-- Acceso solo vía service role (rutas server). RLS activado sin policies.
-- ================================================================

CREATE SEQUENCE IF NOT EXISTS exchanges_code_seq START 1001;

CREATE TABLE IF NOT EXISTS exchanges (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE DEFAULT ('CB-' || nextval('exchanges_code_seq')),
  status_token     TEXT NOT NULL UNIQUE,            -- token del link público de estado
  type             TEXT NOT NULL DEFAULT 'cambio',  -- cambio | reembolso | otro_modelo
  status           TEXT NOT NULL DEFAULT 'pendiente_pago',
  -- cambio:     pendiente_pago → pago_confirmado → (interior) prenda_recibida → despachado
  -- reembolso / otro_modelo: revision → resuelto
  -- cualquiera: cancelado

  tn_order_id      TEXT NOT NULL,
  order_number     TEXT NOT NULL,
  customer_name    TEXT,
  email            TEXT NOT NULL,
  phone            TEXT,
  zone             TEXT NOT NULL,                   -- caba | moto_gba | correo | retiro | otro
  shipping_option  TEXT,
  address          JSONB DEFAULT '{}',
  shipping_amount  NUMERIC,                         -- NULL = a confirmar por el equipo
  items            JSONB NOT NULL DEFAULT '[]',
  -- [{ product_id, variant_id, name, variant_label, quantity, reason,
  --    new_variant_id, new_variant_label }]
  customer_note    TEXT,

  receipt_path     TEXT,                            -- comprobante en storage
  receipt_uploaded_at TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  received_at      TIMESTAMPTZ,
  item_condition   TEXT,                            -- ok | fallada
  moto_date        TEXT,
  tracking_number  TEXT,
  dispatched_at    TIMESTAMPTZ,

  stock_out_done   BOOLEAN NOT NULL DEFAULT FALSE,  -- ya restaron en TN la prenda que sale
  stock_in_done    BOOLEAN NOT NULL DEFAULT FALSE,  -- ya sumaron en TN la prenda que vuelve

  internal_note    TEXT,
  events           JSONB NOT NULL DEFAULT '[]',     -- historial [{at, type, detail}]
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exchanges_status_idx ON exchanges (status);
CREATE INDEX IF NOT EXISTS exchanges_order_idx  ON exchanges (tn_order_id);

ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;

-- Bucket privado para comprobantes de transferencia
INSERT INTO storage.buckets (id, name, public)
VALUES ('exchange-receipts', 'exchange-receipts', false)
ON CONFLICT (id) DO NOTHING;
