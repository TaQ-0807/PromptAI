@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo PromptoAI stopped.
timeout /t 2 /nobreak >nul
exit
