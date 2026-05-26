@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
git add -A
git commit -m "fix: add vercel.json with nextjs framework config"
git push origin main
echo PUSH_DONE
