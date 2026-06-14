@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock del /f .git\HEAD.lock
git commit -m "feat: mega session — auth, cleanup, settings wiring, sidebar, chart, multi-brand

- lib/auth.ts: requireAuth() helper for all sensitive API routes
- API security: /api/sync, /api/sync-custom, /api/ai/ideas, /api/chat, /api/meta/update all protected
- sync/route.ts: dynamic thresholds from app_settings (breakeven_cpa, roas_min)
- sync-custom/route.ts: reads TN credentials from Supabase app_config first
- Sidebar: +4 nav items (Creativos, Alertas, Competencia, Resumen IA) with icons
- Dead code: chatWithContext() removed from lib/claude.ts
- Redirects: /chat→/assistant, /ideas→/assistant, /presupuesto→/campanias
- Login: rebranded to 'Performance & Ecommerce Intelligence'
- Dashboard: 30d historical ROAS+spend chart (Recharts)
- app/(dashboard)/page.tsx: fetches historicalSnapshots for chart
- supabase/migrations/20260614_brands.sql: brands + user_brands tables for multi-tenant
- docs/multi-brand-architecture.md: 5-phase roadmap for multi-brand support"
git push origin main
echo.
echo === DONE ===
