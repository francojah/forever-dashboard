# Faro

Ventas, anuncios y ganancia de un ecommerce en un solo lugar. Next.js 14 + Supabase + Vercel.

## Secciones

| Sección | Para qué |
| --- | --- |
| Inicio | Ventas netas, ganancia después de publicidad, MER y costo por compra del período; gráfico diario; hasta 3 acciones sugeridas |
| Ventas | Medios de pago, envíos, provincias, productos (margen y días de stock) y clientes |
| Anuncios | Campañas → ad sets → anuncios con edición en tabla, revisión antes de publicar, protegidos, historial con deshacer y subida masiva de creativos |
| Finanzas | Estado de resultados por mes desde las órdenes reales, costos fijos con vigencia, caja y cierre de mes |
| Ajustes | Conexiones (Tiendanube, Meta), costos y comisiones, costo de productos, equipo y estado de la sincronización |
| Cambios | Módulo opcional (portal de cambios de Forever) |

## Datos

- `orders`: órdenes crudas por tienda. Webhooks de Tiendanube (`/api/v2/webhooks/tiendanube`) + reconciliación por `updated_at`.
- `ad_entities` y `ad_insights_daily`: campañas/ad sets/anuncios y métricas por anuncio y día (Graph API, `META_API_VERSION`, por defecto v24.0).
- Todo período se calcula con SQL/TypeScript sobre esas tablas, en la zona horaria del negocio.
- `workspaces` agrupa tiendas, cuentas de Meta, costos y equipo. Un usuario puede tener varios.

Sincronización: al abrir la app (si el dato tiene más de 5 min), con el botón Actualizar, y cada 30 min por GitHub Actions (`.github/workflows/daily-sync.yml` → `/api/v2/cron/sync` con `CRON_SECRET`).

## Puesta en marcha

1. Correr `supabase/migrations/20261009_faro_v2.sql` en Supabase → SQL Editor.
2. Variables en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TIENDANUBE_APP_ID`, `TIENDANUBE_CLIENT_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`. Opcionales: `META_APP_ID`, `META_APP_SECRET` y `META_CONFIG_ID` (login con Facebook para empresas), `META_API_VERSION`.
3. Secret `CRON_SECRET` en GitHub (mismo valor que en Vercel).
4. Entrar, conectar tienda y cuentas en Ajustes → Conexiones y completar Costos y comisiones.

## Desarrollo

```bash
npm install
npm run dev
npm test
```
