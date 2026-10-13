-- Faro · registro de mails enviados (resumen semanal manual y automático)
create table if not exists mail_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind         text not null,          -- semanal-auto | semanal-equipo | semanal-prueba | semanal-otros
  week_to      date,
  recipients   text[] not null default '{}',
  ok           boolean not null default true,
  error        text,
  sent_by      text,
  sent_at      timestamptz not null default now()
);
create index if not exists mail_log_ws on mail_log (workspace_id, sent_at desc);
alter table mail_log enable row level security;
create policy mail_log_member on mail_log for select using (faro_is_member(workspace_id));
