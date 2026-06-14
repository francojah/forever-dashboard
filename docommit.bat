@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
git add app/api/tn-status/route.ts app/api/sync-tiendanube/route.ts components/Settings/SettingsClient.tsx components/Dashboard/DashboardClient.tsx supabase/migrations/20260612_app_config.sql
git commit -m "feat: TN token diagnostics — /api/tn-status, Supabase creds fallback, Settings reconnect UI"
git push origin main
echo Done.
pause
