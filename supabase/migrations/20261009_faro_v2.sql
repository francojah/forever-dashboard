-- ============================================================================
-- Faro v2 — capa de datos nueva (espacios de trabajo, órdenes crudas,
-- métricas diarias de Meta, costos con vigencia, historial de cambios).
--
-- Es ADITIVA: no borra ni modifica tablas existentes. Se puede correr más de
-- una vez (idempotente). Pegar completo en Supabase → SQL Editor → Run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Espacios de trabajo ─────────────────────────────────────────────────────
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  currency    text not null default 'ARS',
  timezone    text not null default 'America/Argentina/Buenos_Aires',
  settings    jsonb not null default '{}'::jsonb,
  modules     text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','editor','viewer')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ── Conexiones (tokens) ─────────────────────────────────────────────────────
-- Solo la service role las lee: no hay policy de SELECT para usuarios.
create table if not exists connections (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  provider      text not null check (provider in ('tiendanube','meta','shopify')),
  external_id   text not null,
  label         text,
  access_token  text not null,
  token_expires_at timestamptz,
  meta          jsonb not null default '{}'::jsonb,
  status        text not null default 'ok',
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, provider, external_id)
);

create table if not exists stores (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  connection_id     uuid references connections(id) on delete set null,
  platform          text not null default 'tiendanube',
  external_id       text not null,
  name              text not null,
  url               text,
  currency          text not null default 'ARS',
  active            boolean not null default true,
  orders_cursor     timestamptz,           -- último updated_at sincronizado
  backfill_done     boolean not null default false,
  backfill_page     int not null default 1,
  webhooks_ok       boolean not null default false,
  last_synced_at    timestamptz,
  last_sync_error   text,
  created_at        timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

create table if not exists ad_accounts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  connection_id     uuid references connections(id) on delete set null,
  external_id       text not null,         -- act_123
  name              text not null,
  currency          text not null default 'ARS',
  timezone          text,
  active            boolean not null default true,
  protected_ids     text[] not null default '{}',  -- campañas/ad sets que piden doble confirmación
  insights_from     date,                  -- hasta dónde llega el backfill
  last_synced_at    timestamptz,
  last_entities_at  timestamptz,
  last_sync_error   text,
  created_at        timestamptz not null default now(),
  unique (workspace_id, external_id)
);

-- ── Órdenes crudas ──────────────────────────────────────────────────────────
create table if not exists orders (
  store_id          uuid not null references stores(id) on delete cascade,
  order_id          text not null,
  number            text,
  created_at        timestamptz not null,
  updated_at        timestamptz,
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  status            text,
  payment_status    text,
  currency          text,
  subtotal          numeric not null default 0,   -- productos a precio de lista
  discount          numeric not null default 0,
  total             numeric not null default 0,   -- lo cobrado (incluye envío)
  shipping_customer numeric not null default 0,
  shipping_owner    numeric not null default 0,
  gateway           text,
  payment_method    text,
  installments      int,
  shipping_option   text,
  shipping_pickup   text,
  province          text,
  customer_id       text,
  customer_email    text,
  storefront        text,
  units             int not null default 0,
  items             jsonb not null default '[]'::jsonb,  -- [{product_id, variant_id, name, qty, price, cost}]
  synced_at         timestamptz not null default now(),
  primary key (store_id, order_id)
);
create index if not exists orders_store_created_idx on orders (store_id, created_at desc);
create index if not exists orders_store_customer_idx on orders (store_id, customer_id);

-- ── Meta: entidades y métricas diarias ──────────────────────────────────────
create table if not exists ad_entities (
  ad_account_id     uuid not null references ad_accounts(id) on delete cascade,
  entity_id         text not null,
  level             text not null check (level in ('campaign','adset','ad')),
  parent_id         text,
  campaign_id       text,
  name              text not null default '',
  status            text,
  effective_status  text,
  objective         text,
  optimization_goal text,
  daily_budget      numeric,
  lifetime_budget   numeric,
  bid_strategy      text,
  targeting         jsonb,
  creative          jsonb,
  created_time      timestamptz,
  updated_time      timestamptz,
  synced_at         timestamptz not null default now(),
  primary key (ad_account_id, entity_id)
);
create index if not exists ad_entities_level_idx on ad_entities (ad_account_id, level);

create table if not exists ad_insights_daily (
  ad_account_id   uuid not null references ad_accounts(id) on delete cascade,
  date            date not null,
  ad_id           text not null,
  adset_id        text,
  campaign_id     text,
  spend           numeric not null default 0,
  impressions     bigint not null default 0,
  reach           bigint not null default 0,
  link_clicks     bigint not null default 0,
  lpv             numeric not null default 0,
  atc             numeric not null default 0,
  ic              numeric not null default 0,
  purchases       numeric not null default 0,
  purchase_value  numeric not null default 0,
  video_3s        numeric not null default 0,
  video_p50       numeric not null default 0,
  synced_at       timestamptz not null default now(),
  primary key (ad_account_id, date, ad_id)
);
create index if not exists ad_insights_date_idx on ad_insights_daily (ad_account_id, date);

-- ── Costos ──────────────────────────────────────────────────────────────────
create table if not exists cost_items (
  store_id     uuid not null references stores(id) on delete cascade,
  product_id   text not null,
  variant_id   text not null default '',
  name         text not null default '',
  unit_cost    numeric not null,
  valid_from   date not null default '2000-01-01',
  updated_at   timestamptz not null default now(),
  primary key (store_id, product_id, variant_id, valid_from)
);

create table if not exists fixed_costs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  category     text not null default 'fijo',
  amount       numeric not null,
  valid_from   date not null,
  valid_to     date,
  created_at   timestamptz not null default now()
);

-- Costos puntuales que sí son del resultado (packaging comprado, un flete, etc.)
create table if not exists extra_costs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month        text not null,              -- YYYY-MM
  category     text not null default 'otro',
  description  text not null default '',
  amount       numeric not null,
  created_at   timestamptz not null default now()
);

-- Movimientos de caja que NO son resultado (compra de mercadería, retiros)
create table if not exists cash_movements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date         date not null,
  type         text not null check (type in ('compra_mercaderia','retiro','aporte','otro')),
  description  text not null default '',
  amount       numeric not null,
  created_at   timestamptz not null default now()
);

create table if not exists closed_periods (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month        text not null,
  pnl          jsonb not null,
  closed_by    uuid,
  closed_at    timestamptz not null default now(),
  primary key (workspace_id, month)
);

-- ── Historial de cambios en Meta + corridas de sync ─────────────────────────
create table if not exists change_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete set null,
  user_id       uuid,
  user_email    text,
  level         text,
  entity_id     text,
  entity_name   text,
  field         text not null,
  old_value     jsonb,
  new_value     jsonb,
  status        text not null default 'ok',
  error         text,
  undone_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists change_log_ws_idx on change_log (workspace_id, created_at desc);

create table if not exists sync_log (
  id            bigint generated always as identity primary key,
  workspace_id  uuid references workspaces(id) on delete cascade,
  source        text not null,     -- tiendanube | meta_insights | meta_entities | webhook
  target_id     uuid,
  status        text not null,     -- ok | error
  rows          int,
  ms            int,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists sync_log_ws_idx on sync_log (workspace_id, created_at desc);

-- ── RLS: miembros leen lo de su espacio; escrituras solo por service role ───
create or replace function faro_is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid())
$$;

do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_members','connections','stores','ad_accounts','orders',
    'ad_entities','ad_insights_daily','cost_items','fixed_costs','extra_costs','cash_movements',
    'closed_periods','change_log','sync_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists faro_ws_read on workspaces;
create policy faro_ws_read on workspaces for select to authenticated using (faro_is_member(id));
drop policy if exists faro_members_read on workspace_members;
create policy faro_members_read on workspace_members for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_stores_read on stores;
create policy faro_stores_read on stores for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_accounts_read on ad_accounts;
create policy faro_accounts_read on ad_accounts for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_orders_read on orders;
create policy faro_orders_read on orders for select to authenticated
  using (exists (select 1 from stores s where s.id = orders.store_id and faro_is_member(s.workspace_id)));
drop policy if exists faro_entities_read on ad_entities;
create policy faro_entities_read on ad_entities for select to authenticated
  using (exists (select 1 from ad_accounts a where a.id = ad_entities.ad_account_id and faro_is_member(a.workspace_id)));
drop policy if exists faro_insights_read on ad_insights_daily;
create policy faro_insights_read on ad_insights_daily for select to authenticated
  using (exists (select 1 from ad_accounts a where a.id = ad_insights_daily.ad_account_id and faro_is_member(a.workspace_id)));
drop policy if exists faro_costs_read on cost_items;
create policy faro_costs_read on cost_items for select to authenticated
  using (exists (select 1 from stores s where s.id = cost_items.store_id and faro_is_member(s.workspace_id)));
drop policy if exists faro_fixed_read on fixed_costs;
create policy faro_fixed_read on fixed_costs for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_extra_read on extra_costs;
create policy faro_extra_read on extra_costs for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_cash_read on cash_movements;
create policy faro_cash_read on cash_movements for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_closed_read on closed_periods;
create policy faro_closed_read on closed_periods for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_changes_read on change_log;
create policy faro_changes_read on change_log for select to authenticated using (faro_is_member(workspace_id));
drop policy if exists faro_sync_read on sync_log;
create policy faro_sync_read on sync_log for select to authenticated using (faro_is_member(workspace_id));
-- connections: sin policies → solo service role.

-- ── Agregaciones de Meta (evitan mandar miles de filas a la app) ────────────
create or replace function faro_ads_daily(p_accounts uuid[], p_from date, p_to date)
returns table (date date, spend numeric, impressions bigint, link_clicks bigint, lpv numeric,
               atc numeric, ic numeric, purchases numeric, purchase_value numeric)
language sql stable as $$
  select i.date, sum(i.spend), sum(i.impressions)::bigint, sum(i.link_clicks)::bigint, sum(i.lpv),
         sum(i.atc), sum(i.ic), sum(i.purchases), sum(i.purchase_value)
  from ad_insights_daily i
  where i.ad_account_id = any(p_accounts) and i.date between p_from and p_to
  group by i.date order by i.date
$$;

create or replace function faro_ads_by_ad(p_accounts uuid[], p_from date, p_to date)
returns table (ad_account_id uuid, ad_id text, adset_id text, campaign_id text, spend numeric,
               impressions bigint, reach bigint, link_clicks bigint, lpv numeric, atc numeric, ic numeric,
               purchases numeric, purchase_value numeric, video_3s numeric, video_p50 numeric, days int)
language sql stable as $$
  select i.ad_account_id, i.ad_id, max(i.adset_id), max(i.campaign_id), sum(i.spend),
         sum(i.impressions)::bigint, sum(i.reach)::bigint, sum(i.link_clicks)::bigint, sum(i.lpv), sum(i.atc), sum(i.ic),
         sum(i.purchases), sum(i.purchase_value), sum(i.video_3s), sum(i.video_p50), count(*)::int
  from ad_insights_daily i
  where i.ad_account_id = any(p_accounts) and i.date between p_from and p_to
  group by i.ad_account_id, i.ad_id
$$;

-- Por ad set y día (para reglas: "CPA sobre el máximo 3 días seguidos")
create or replace function faro_ads_adset_daily(p_accounts uuid[], p_from date, p_to date)
returns table (adset_id text, date date, spend numeric, purchases numeric, impressions bigint, link_clicks bigint)
language sql stable as $$
  select i.adset_id, i.date, sum(i.spend), sum(i.purchases), sum(i.impressions)::bigint, sum(i.link_clicks)::bigint
  from ad_insights_daily i
  where i.ad_account_id = any(p_accounts) and i.date between p_from and p_to
  group by i.adset_id, i.date
$$;

-- ── Bucket privado para creativos subidos desde Faro ────────────────────────
insert into storage.buckets (id, name, public)
values ('faro-creatives', 'faro-creatives', false)
on conflict (id) do nothing;

-- ── Espacio inicial: Forever Basics, con todos los usuarios actuales ────────
insert into workspaces (name, slug, modules, settings)
values ('Forever Basics', 'forever-basics', array['cambios'], '{}'::jsonb)
on conflict (slug) do nothing;

insert into workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'owner' from workspaces w cross join auth.users u
where w.slug = 'forever-basics'
on conflict do nothing;

-- Fijos actuales → fixed_costs (vigentes desde enero, como se calculaban hasta hoy)
insert into fixed_costs (workspace_id, name, category, amount, valid_from)
select w.id, r.name, r.category, r.amount_ars, date '2026-01-01'
from workspaces w cross join recurring_expenses r
where w.slug = 'forever-basics' and r.active
  and not exists (select 1 from fixed_costs f where f.workspace_id = w.id and f.name = r.name);

-- Gastos variables cargados en el Balance viejo: compra de mercadería y
-- distribución de ganancias son caja; el resto, costos del mes.
insert into cash_movements (workspace_id, date, type, description, amount)
select w.id, (v.month || '-01')::date,
       case when v.category = 'mercaderia' then 'compra_mercaderia' else 'retiro' end,
       coalesce(v.description, ''), v.amount_ars
from workspaces w cross join variable_expenses v
where w.slug = 'forever-basics' and v.category in ('mercaderia','distribucion')
  and not exists (select 1 from cash_movements c where c.workspace_id = w.id and c.description = coalesce(v.description,'')
                  and c.amount = v.amount_ars and c.date = (v.month || '-01')::date);

insert into extra_costs (workspace_id, month, category, description, amount)
select w.id, v.month, v.category, coalesce(v.description, ''), v.amount_ars
from workspaces w cross join variable_expenses v
where w.slug = 'forever-basics' and v.category not in ('mercaderia','distribucion')
  and not exists (select 1 from extra_costs e where e.workspace_id = w.id and e.description = coalesce(v.description,'')
                  and e.amount = v.amount_ars and e.month = v.month);
