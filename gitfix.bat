@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
if exist ".git\HEAD.lock" del /f ".git\HEAD.lock"
if exist ".git\index.lock" del /f ".git\index.lock"
"C:\Program Files\Git\bin\git.exe" add lib/supabase.ts
"C:\Program Files\Git\bin\git.exe" commit -m "fix: add total_units_sold and total_carts to TNSummary type"
"C:\Program Files\Git\bin\git.exe" push origin main
echo DONE
