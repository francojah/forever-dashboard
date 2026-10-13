-- Faro · avisos por WhatsApp: número de cada usuario por negocio y registro de envíos (para no repetir)
create table if not exists notify_contacts (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null,
  phone        text not null,
  daily        boolean not null default true,   -- resumen de ayer, a la mañana
  alerts       boolean not null default true,   -- avisos urgentes de la cuenta
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table notify_contacts enable row level security;

create table if not exists notify_log (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key          text not null,                    -- daily:2026-10-12 · alert:<id>:2026-10-12
  sent_at      timestamptz not null default now(),
  primary key (workspace_id, key)
);
alter table notify_log enable row level security;
-- Sin políticas: solo Faro (service role) lee y escribe.
