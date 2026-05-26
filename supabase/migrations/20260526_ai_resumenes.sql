-- Tabla para cachear los resúmenes diarios generados por IA
create table if not exists ai_resumenes (
  id            uuid primary key default gen_random_uuid(),
  resumen_date  date unique not null,
  content       text not null,
  created_at    timestamptz not null default now()
);

-- RLS: solo el service role puede escribir; los usuarios autenticados pueden leer
alter table ai_resumenes enable row level security;

create policy "auth users can read resumenes"
  on ai_resumenes for select
  to authenticated
  using (true);

-- Agregar columna periods a meta_snapshots si no existe
alter table meta_snapshots
  add column if not exists periods jsonb;
