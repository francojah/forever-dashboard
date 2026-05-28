@echo off
cd /d "C:\Users\franj\Documents\Claude\Projects\Forever\forever-ads-app"

REM Remove stale lock files
if exist ".git\HEAD.lock" del /f ".git\HEAD.lock"
if exist ".git\index.lock" del /f ".git\index.lock"

REM Stage all changes
"C:\Program Files\Git\bin\git.exe" add -A

REM Commit
"C:\Program Files\Git\bin\git.exe" commit -m "feat: TN revenue por periodo, custom date picker, creativos por periodo, pagina eventos ecommerce"

REM Push
"C:\Program Files\Git\bin\git.exe" push origin main

REM Log result
echo DONE > "C:\Users\franj\Documents\Claude\Projects\Forever\commit_result.txt"
"C:\Program Files\Git\bin\git.exe" log --oneline -5 >> "C:\Users\franj\Documents\Claude\Projects\Forever\commit_result.txt" 2>&1
echo EXIT:%ERRORLEVEL% >> "C:\Users\franj\Documents\Claude\Projects\Forever\commit_result.txt"
