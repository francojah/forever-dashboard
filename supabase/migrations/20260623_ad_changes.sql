-- Audit log for all ad set / ad changes made through the dashboard
-- Records who changed what, when, and from/to values

create table if not exists ad_change_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('campaign', 'adset', 'ad')),
  entity_id     text not null,
  entity_name   text,
  action        text not null,   -- 'pause', 'activate', 'set_budget', 'duplicate', etc.
  old_value     jsonb,           -- previous state (budget, status, etc.)
  new_value     jsonb,           -- new state
  initiated_by  text default 'dashboard',
  meta_response jsonb,           -- raw API response from Meta
  created_at    timestamptz not null default now()
);

-- Index for fast lookup by entity
create index if not exists ad_change_log_entity_idx on ad_change_log (entity_id, created_at desc);
create index if not exists ad_change_log_date_idx   on ad_change_log (created_at desc);

-- RLS
alter table ad_change_log enable row level security;

create policy "ad_change_log_select" on ad_change_log for select using (true);
create policy "ad_change_log_insert" on ad_change_log for insert with check (true);

comment on table ad_change_log is 'Audit trail of all ad management actions taken in Forever Intelligence dashboard';
