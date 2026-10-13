-- Faro · objetivos del mes, calendario de promos y experimentos registrados
create table if not exists goals (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month        text not null,                 -- YYYY-MM
  metric       text not null,                 -- net_sales | orders | profit | cpa | margin
  target       numeric not null,
  primary key (workspace_id, month, metric)
);
alter table goals enable row level security;
drop policy if exists goals_member on goals;
create policy goals_member on goals for select using (faro_is_member(workspace_id));

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind         text not null default 'promo',  -- promo | experimento | otro
  name         text not null,
  starts       date not null,
  ends         date not null,
  entity_id    text,                           -- campaña/ad set/anuncio afectado (experimentos)
  notes        text,
  created_at   timestamptz not null default now()
);
alter table events enable row level security;
drop policy if exists events_member on events;
create policy events_member on events for select using (faro_is_member(workspace_id));
