@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"
"C:\Program Files\Git\bin\git.exe" push origin main > "C:\Users\franj\Documents\Claude\Projects\Forever\push_result.txt" 2>&1
echo PUSH_EXIT:%ERRORLEVEL% >> "C:\Users\franj\Documents\Claude\Projects\Forever\push_result.txt"
"C:\Program Files\Git\bin\git.exe" log --oneline -3 >> "C:\Users\franj\Documents\Claude\Projects\Forever\push_result.txt" 2>&1
echo LOG_DONE >> "C:\Users\franj\Documents\Claude\Projects\Forever\push_result.txt"
