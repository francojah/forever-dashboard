@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
if exist ".git\HEAD.lock" del /f ".git\HEAD.lock"
if exist ".git\index.lock" del /f ".git\index.lock"
"C:\Program Files\Git\bin\git.exe" add -A
"C:\Program Files\Git\bin\git.exe" commit -m "feat: video metrics, WoW deltas, proyeccion mensual, acciones directas"
"C:\Program Files\Git\bin\git.exe" push origin main
echo DONE > "C:\Users\franj\Documents\Claude\Projects\Forever\opt_result.txt"
"C:\Program Files\Git\bin\git.exe" log --oneline -5 >> "C:\Users\franj\Documents\Claude\Projects\Forever\opt_result.txt" 2>&1
