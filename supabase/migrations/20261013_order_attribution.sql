-- Faro · origen de los pedidos (URL de llegada y UTMs) para cruzar ventas reales con anuncios
create table if not exists order_attribution (
  store_id      uuid not null references stores(id) on delete cascade,
  order_id      text not null,
  created_at    timestamptz,
  landing_url   text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  fbclid        boolean not null default false,
  net           numeric not null default 0,
  valid         boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (store_id, order_id)
);
create index if not exists order_attribution_created on order_attribution (store_id, created_at);
alter table order_attribution enable row level security;
-- Solo lectura vía service role (Faro); sin políticas públicas.
