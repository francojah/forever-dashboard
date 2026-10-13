-- Faro · seguimiento de decisiones: cada cambio aprobado vuelve a los 7 días con su resultado
create table if not exists decision_followups (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind         text not null,                  -- change | event
  ref_id       text,                           -- change_log.id o events.id
  level        text,                           -- campaign | adset | ad
  entity_id    text,
  entity_name  text,
  field        text,                           -- status | daily_budget | ...
  from_value   jsonb,
  to_value     jsonb,
  applied_at   timestamptz not null default now(),
  check_at     date not null,
  result       jsonb,                          -- { before: {...}, after: {...}, verdict, text }
  seen_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists decision_followups_ws on decision_followups (workspace_id, check_at);
alter table decision_followups enable row level security;
create policy decision_followups_member on decision_followups for select using (faro_is_member(workspace_id));
