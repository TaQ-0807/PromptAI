@echo off
cd /d "%~dp0"

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

python -c "import fastapi,uvicorn,anthropic,openpyxl" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing packages...
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Package installation failed.
        pause
        exit /b 1
    )
)

netstat -ano | findstr "LISTENING" | findstr ":8000" >nul 2>&1
if %errorlevel% == 0 goto :open_browser

start "PromptoAI" /min /d "%~dp0" cmd /c "python -m uvicorn main:app --host 0.0.0.0 --port 8000"

set /a count=0
:wait
timeout /t 1 /nobreak >nul
netstat -ano | findstr "LISTENING" | findstr ":8000" >nul 2>&1
if %errorlevel% == 0 goto :open_browser
set /a count+=1
if %count% lss 20 goto :wait

echo [ERROR] Server failed to start. Check your .env file.
pause
exit /b 1

:open_browser
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" http://localhost:8000
    goto :done
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" http://localhost:8000
    goto :done
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" http://localhost:8000
    goto :done
)
start http://localhost:8000

:done
timeout /t 2 /nobreak >nul
exit
