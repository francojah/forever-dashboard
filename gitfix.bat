@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
if exist ".git\HEAD.lock" del /f ".git\HEAD.lock"
if exist ".git\index.lock" del /f ".git\index.lock"
"C:\Program Files\Git\bin\git.exe" add -A
"C:\Program Files\Git\bin\git.exe" commit -m "fix: historial datos recientes, top productos %, shipping 3 tipos, CMV balance, carritos TN"
"C:\Program Files\Git\bin\git.exe" push origin main
"C:\Program Files\Git\bin\git.exe" log --oneline -3
echo DONE
