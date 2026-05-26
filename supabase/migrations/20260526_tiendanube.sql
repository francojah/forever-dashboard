-- Tabla para snapshots de Tiendanube
create table if not exists tiendanube_snapshots (
  id             uuid primary key default gen_random_uuid(),
  snapshot_date  date unique not null,
  summary_7d     jsonb,
  summary_30d    jsonb,
  summary_today  jsonb,
  orders_count   integer,
  created_at     timestamptz not null default now()
);

alter table tiendanube_snapshots enable row level security;

create policy "auth users can read tiendanube"
  on tiendanube_snapshots for select
  to authenticated
  using (true);
