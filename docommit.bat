@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
git add -A
git commit -m "feat: major UX refactor — Dashboard pure metrics, Campanias page, AI Assistant, Balance Neto, CPC traffic, sidebar links"
git push
del "%~f0"
