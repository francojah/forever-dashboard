@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
git add -A
git commit -m "feat: Dashboard v3 (conv/traffic quality, best creatives, attribution), AdsetTable campaign level, Ideas fix"
git push
del "%~f0"
