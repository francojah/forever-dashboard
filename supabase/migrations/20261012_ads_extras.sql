-- Faro · etiquetas de creativos, reglas y plan de inversión

-- Etiquetas por anuncio (ángulo, formato, producto) para reportar qué funciona
create table if not exists ad_tags (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ad_id        text not null,
  angulo       text,
  formato      text,
  producto     text,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, ad_id)
);
alter table ad_tags enable row level security;
drop policy if exists ad_tags_member on ad_tags;
create policy ad_tags_member on ad_tags for select using (faro_is_member(workspace_id));

-- Reglas: proponen cambios para aprobar (nunca se aplican solas)
create table if not exists ad_rules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  active       boolean not null default true,
  level        text not null default 'adset',        -- adset | campaign | ad
  metric       text not null,                        -- cpa_over_max | no_purchases | cpa_under | frequency_over | ctr_under
  threshold    numeric,                              -- % del máximo, frecuencia, CTR, etc.
  days         int not null default 3,
  action       text not null,                        -- pause | budget_down | budget_up | notify
  action_pct   numeric default 20,
  created_at   timestamptz not null default now()
);
alter table ad_rules enable row level security;
drop policy if exists ad_rules_member on ad_rules;
create policy ad_rules_member on ad_rules for select using (faro_is_member(workspace_id));

-- Plan de inversión mensual por negocio
create table if not exists ad_budget_plans (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month        text not null,                        -- YYYY-MM
  amount       numeric not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, month)
);
alter table ad_budget_plans enable row level security;
drop policy if exists ad_budget_plans_member on ad_budget_plans;
create policy ad_budget_plans_member on ad_budget_plans for select using (faro_is_member(workspace_id));
