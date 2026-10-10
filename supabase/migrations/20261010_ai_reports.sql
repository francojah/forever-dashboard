-- Faro: últimos análisis de la IA por negocio
create table if not exists ai_reports (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by   uuid,
  model        text,
  report       jsonb not null,
  usage        jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists ai_reports_ws_idx on ai_reports (workspace_id, created_at desc);
alter table ai_reports enable row level security;
drop policy if exists ai_reports_member on ai_reports;
create policy ai_reports_member on ai_reports for select using (faro_is_member(workspace_id));
