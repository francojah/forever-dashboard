# Multi-Brand Architecture Plan

## Estado actual (Fase 0)

La app está cableada a **una sola marca** (Forever Basics) via variables de entorno en Vercel:
- `META_ACCESS_TOKEN`, `META_ACCOUNT_ID`
- `TIENDANUBE_ACCESS_TOKEN`, `TIENDANUBE_USER_ID` (o Supabase `app_config`)
- `BREAKEVEN_CPA`/`ROAS_MIN` leídos dinámicamente desde `app_settings`

---

## Fase 1 — Schema foundation (implementado)

Migración: `supabase/migrations/20260614_brands.sql`

Tablas nuevas: `brands` (una fila por marca) y `user_brands` (junction de acceso). RLS activo.

---

## Fase 2 — Aislación de datos (próximo)

Agregar `brand_id` FK a `meta_snapshots`, `alerts`, `app_config`. Actualizar RLS policies.

---

## Fase 3 — Brand switcher en UI

Dropdown de marcas en Sidebar. `BrandContext` provider. API routes reciben `brand_id`.

---

## Fase 4 — Encriptación de tokens

Usar Supabase Vault (pgsodium) o AES-256-GCM en app para `meta_access_token` y `tn_access_token`.

---

## Fase 5 — OAuth multi-brand

Callback TN/Meta recibe `brand_id` en query param y guarda token en la fila correcta de `brands`.

---

## Estimado: ~1.5 días para multi-tenant completo. Arquitectura actual no rompe nada al evolucionar.
