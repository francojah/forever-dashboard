@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
git add -A
git commit -m "fix: postcss config, webpack alias, TS types - build OK"
git push origin main
echo PUSH_DONE
