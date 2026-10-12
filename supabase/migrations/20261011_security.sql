-- Faro · Seguridad
-- 1) Tablas viejas con permisos abiertos a cualquier usuario con sesión (y el alta es libre):
--    se quitan esas políticas. Faro las lee solo desde el servidor (service role), que no usa RLS.
do $$
declare t text; p record;
begin
  foreach t in array array['app_settings','monthly_summaries','variable_expenses','ai_resumenes','tiendanube_snapshots',
                           'meta_snapshots','ab_tests','ad_change_log','tn_webhook_events','product_costs','sync_runs',
                           'metrics_daily','tn_orders','merch_cost_per_month','exchanges','app_config'] loop
    if to_regclass('public.' || t) is not null then
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- 2) Toda tabla pública con RLS activado (las de Faro ya tienen sus políticas por negocio)
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- 3) Resultado: tablas públicas y cuántas políticas les quedan
select t.tablename, t.rowsecurity as rls, count(p.policyname) as politicas
from pg_tables t left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' group by t.tablename, t.rowsecurity order by t.tablename;
