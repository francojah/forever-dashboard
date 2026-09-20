-- Agrega costo de mercadería real por mes a monthly_summaries
-- Permite registrar cuánto costó la mercadería cada mes,
-- independientemente del costo unitario default en app_settings.
-- Si está cargado, tiene prioridad sobre unit_cost_default × unidades.
alter table monthly_summaries
  add column if not exists merch_cost numeric default null;

comment on column monthly_summaries.merch_cost is
  'Costo total de mercadería (COGS) del mes en ARS. '
  'Si está seteado, tiene prioridad sobre el cálculo automático '
  '(unit_cost_default × unidades). '
  'Permite reflejar variaciones reales de costo por inflación, cambio de proveedor, etc.';
