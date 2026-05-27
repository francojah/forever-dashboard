-- App Settings table
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now()
);

-- Default settings
insert into app_settings (key, value) values
  ('breakeven_cpa',     '17500'),
  ('roas_min',          '2.86'),
  ('roas_scale',        '6'),
  ('tn_commission_pct', '3.5'),
  ('shipping_pct',      '8')
on conflict (key) do nothing;

-- RLS
alter table app_settings enable row level security;
create policy "allow_all_authenticated" on app_settings
  for all using (auth.role() = 'authenticated');
