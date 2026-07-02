# Runbook — Puesta en producción de las mejoras

Los cambios de código ya están en el repo. Estos son los pasos que requieren tu
dashboard (Supabase / Vercel / GitHub) y no se pueden automatizar desde afuera.
Tiempo total estimado: ~10 minutos. Todo es aditivo y reversible.

---

## 1. Correr las migraciones en Supabase (~3 min)

Supabase → tu proyecto → **SQL Editor → New query**.

**Opción recomendada (un solo paso):** abrí `supabase/setup_mejoras_20260701.sql`,
copiá TODO el contenido, pegalo y **Run**. Ese archivo crea todo en el orden
correcto (brands → sync_runs → metrics_daily → brand_id) y es idempotente.

> ⚠️ Si corrés las migraciones sueltas y te da el error
> `relation "brands" does not exist`, es porque nunca se creó la tabla base
> `brands`. El archivo consolidado ya lo resuelve creándola primero.

> Verificación: en **Table Editor** deberían aparecer las tablas `sync_runs` y
> `metrics_daily`, y las tablas core (`meta_snapshots`, `alerts`, `leads`, etc.)
> deberían tener una columna nueva `brand_id`.

---

## 2. Backfill de tendencias (~1 min)

Para que los gráficos de tendencia tengan historia desde ya (sin esperar que el
cron acumule días), corré una vez, localmente o en cualquier entorno con las env:

```bash
npm install          # suma vitest (dev) — no cambia prod
npm run backfill:metrics
```

Esto recorre los `meta_snapshots` existentes y llena `metrics_daily`.

---

## 3. Variables de entorno nuevas (opcionales) (~2 min)

En **Vercel → Project → Settings → Environment Variables** (y en GitHub Secrets
si el cron corre por Actions). Todas tienen default, así que son opcionales:

| Variable | Para qué | Ejemplo |
|----------|----------|---------|
| `SYNC_ALERT_WEBHOOK` | Aviso automático si el sync diario falla | URL de webhook de Slack/Discord |
| `BREAKEVEN_CPA` | Override del breakeven (default 30462) | `30462` |
| `ROAS_MIN` | Override del ROAS mínimo (default 1.77) | `1.77` |
| `META_API_VERSION` | Versión de la Graph API (default v21.0) | `v21.0` |

Para el webhook de Slack: Slack → Apps → Incoming Webhooks → crear uno → copiar
la URL en `SYNC_ALERT_WEBHOOK`.

---

## 4. Verificación final (~2 min)

```bash
npm install
npm test          # tests del parser de insights (deberían pasar)
npm run build     # build de Next — debe compilar sin errores
```

Después del deploy:

- Abrí `https://TU-APP.vercel.app/api/health` → debería devolver JSON con
  `"status": "ok"` y el último snapshot.
- En **Configuración** ahora aparece el panel **Estado del sistema**.
- En **Tendencias** (Histórico) aparece el gráfico granular por métrica.
- En **Campañas** hay botón **Exportar CSV** y el embudo de conversión.

---

## 5. Seed de la marca (cuando actives multi-marca)

La migración 3 deja comentado el seed. Cuando quieras activar multi-marca:

1. Descomentá el `INSERT INTO brands (...)` en `20260701_brand_id_isolation.sql`,
   completá el `TN_USER_ID`, y ejecutá.
2. Corré los `UPDATE ... SET brand_id = ...` (también comentados) para asignar los
   datos legacy existentes a Forever Basics.
3. Recién cuando todo tenga `brand_id`, endurecé las RLS policies.

---

## Pendientes que necesitan credenciales / decisión (no bloquean nada)

- **Encriptar tokens** (Meta/TN): elegir Supabase Vault (pgsodium) vs AES-256-GCM.
  Toca datos productivos → requiere tu OK.
- **Shopify / WooCommerce**: los conectores están scaffoldeados en
  `lib/connectors/`. Completar `getOrders`/`getProducts` con las credenciales de
  cada plataforma cuando sumes un cliente nuevo.
- **Google Ads / TikTok Ads**: nuevos conectores de ads (mismo patrón que Meta).
- **OAuth self-service**: callback con `brand_id` para onboarding sin tocar envs.

---

## Rollback

Todo es aditivo. Si algo molesta:

- Las tablas nuevas (`sync_runs`, `metrics_daily`) se pueden `DROP TABLE` sin
  afectar el resto.
- La columna `brand_id` es nullable y no rompe queries existentes.
- Los cambios de código están en git: `git revert` del commit correspondiente.
