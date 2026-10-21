@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "http://127.0.0.1:8766/"
python server.py --port 8766
pause
