# Forever Ads App

Dashboard de Meta Ads para FOREVER BASICS — auto-update diario, login de equipo, ideas IA, análisis de competencia y gestión de leads.

---

## Setup completo — paso a paso

### PASO 1 — Crear cuenta en Supabase (5 min)

1. Ir a **supabase.com** → crear cuenta gratuita
2. Clic en **"New project"** → nombre: `forever-ads` → elegir contraseña → región: South America
3. Esperar que el proyecto se cree (~2 min)
4. Ir a **Settings → API** y copiar:
   - `Project URL` → es tu `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → es tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → es tu `SUPABASE_SERVICE_ROLE_KEY` ⚠️ nunca la compartas

5. Ir a **SQL Editor → New query**, pegar todo el contenido de `supabase/schema.sql` y hacer clic en **Run**

6. Crear el primer usuario del equipo:
   - Ir a **Authentication → Users → Add user**
   - Email: el email de cada persona del equipo
   - Password: contraseña temporal (que pueden cambiar después)

---

### PASO 2 — Configurar el repo en GitHub (5 min)

1. Ir a tu repo `forever-dashboard` (o crear un repo nuevo `forever-ads-app`)
2. Ir a **Settings → Secrets and variables → Actions → New repository secret**
3. Agregar estos secrets uno por uno:

| Nombre | Valor |
|--------|-------|
| `META_ACCESS_TOKEN` | Tu token de Meta (Business Settings → System Users → Token) |
| `META_ACCOUNT_ID` | `act_1614288152915913` |
| `SUPABASE_URL` | Tu Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Tu service_role key de Supabase |

---

### PASO 3 — Deploy en Vercel (5 min)

1. Ir a **vercel.com** → crear cuenta con GitHub
2. Clic en **"Add New Project"** → importar tu repo
3. En la sección **Environment Variables**, agregar todas las variables de `.env.example` con sus valores reales
4. Clic en **Deploy** → esperar ~3 min → ¡tu app está online!
5. Copiar la URL (ej: `forever-ads-app.vercel.app`)

---

### PASO 4 — Primer sync manual (2 min)

Para no esperar hasta las 7am del día siguiente:

1. Ir a tu repo en GitHub → pestaña **Actions**
2. Clic en **"Daily Meta Ads Sync"** → **"Run workflow"** → **"Run workflow"**
3. Esperar ~1 min → va a aparecer ✅ verde
4. Abrir tu app → el dashboard va a mostrar los datos

---

### PASO 5 — Acceso del equipo

Compartir la URL de Vercel + las credenciales creadas en el Paso 1 (punto 6).

Para agregar más personas: Supabase → Authentication → Users → Add user.

---

## Cómo funciona el auto-update

Todos los días a las **7am Argentina** (10am UTC), GitHub Actions:
1. Se conecta a Meta Ads API con tu token
2. Descarga campañas, ad sets y anuncios de los últimos 7 días
3. Calcula métricas clave y detecta alertas automáticas
4. Guarda todo en Supabase con la fecha del día

Al abrir la app, siempre ves los datos del último sync.

---

## Módulos de la app

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | KPIs, ad sets activos, ranking de creativos, alertas |
| **Creativos** | Registro de imágenes/videos, seguimiento de estado (ganador/perdedor) |
| **Ideas IA** | Claude genera ideas de contenido basadas en tu performance actual |
| **Competencia** | Análisis de competidores con IA — posicionamiento, gaps y oportunidades |
| **Leads** | Gestión de leads de Meta Lead Ads con pipeline de estados |
| **Alertas** | Alertas automáticas cuando el CPA supera el breakeven o el ROAS cae |

---

## Variables de entorno

Copiar `.env.example` a `.env.local` para desarrollo local:

```bash
cp .env.example .env.local
# Editar .env.local con tus valores reales
```

Para Vercel: agregar las mismas variables en Settings → Environment Variables.

---

## Desarrollo local

```bash
npm install
npm run dev
# Abrir http://localhost:3000
```

Para correr el sync manualmente:

```bash
node scripts/sync-meta.js
```

---

## Stack tecnológico

- **Next.js 14** — App Router + TypeScript
- **Supabase** — Auth + PostgreSQL + Row Level Security
- **Tailwind CSS** — Estilos
- **Vercel** — Deploy + cron jobs (vía GitHub Actions)
- **Meta Graph API** — Datos de campañas, ad sets y anuncios
- **Anthropic Claude** — Ideas de contenido + análisis de competencia

---

## Costo mensual estimado

| Servicio | Plan | Costo |
|----------|------|-------|
| Supabase | Free | $0 |
| Vercel | Hobby | $0 |
| GitHub | Free | $0 |
| Anthropic Claude | Pay as you go | ~$5–10/mes |
| **Total** | | **~$5–10/mes** |
