@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
del gitpush2.bat 2>nul
git add -A
git commit -m "chore: cleanup"
git push origin main
echo DONE
