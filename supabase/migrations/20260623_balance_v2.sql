-- Balance v2: monthly P&L summaries + variable expenses
-- Run this in Supabase SQL Editor

-- Monthly summaries: one row per month with Meta + TN totals
-- Can be manually entered for past months, or auto-populated by sync
create table if not exists monthly_summaries (
  month        text primary key,          -- 'YYYY-MM', e.g. '2026-06'
  meta_spend   numeric,                   -- total Meta Ads spend ARS
  tn_revenue   numeric,                   -- total Tiendanube revenue ARS
  tn_orders    integer,                   -- total orders
  tn_units     integer,                   -- total units sold
  notes        text,
  updated_at   timestamptz default now()
);

-- Variable expenses: additional costs per month (beyond the automatic cost structure)
create table if not exists variable_expenses (
  id           uuid primary key default gen_random_uuid(),
  month        text not null,             -- 'YYYY-MM'
  category     text not null,             -- 'mercaderia'|'packaging'|'distribucion'|'logistica'|'fijo'|'otro'
  description  text not null,
  amount_ars   numeric not null,
  created_at   timestamptz default now()
);

-- RLS
alter table monthly_summaries enable row level security;
create policy "allow_authenticated_monthly" on monthly_summaries
  for all using (auth.role() = 'authenticated');

alter table variable_expenses enable row level security;
create policy "allow_authenticated_expenses" on variable_expenses
  for all using (auth.role() = 'authenticated');

-- Index for fast month-based queries
create index if not exists idx_var_expenses_month on variable_expenses (month);
