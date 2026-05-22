@echo off
cd /d "%~dp0"

echo ===== PromptoAI Diagnostic =====
echo.

echo [1] Python:
python --version
echo.

echo [2] Packages:
python -c "import fastapi; print('  fastapi  : OK')" 2>nul || echo   fastapi  : NOT FOUND
python -c "import uvicorn; print('  uvicorn  : OK')" 2>nul || echo   uvicorn  : NOT FOUND
python -c "import anthropic; print('  anthropic: OK')" 2>nul || echo   anthropic: NOT FOUND
python -c "import openpyxl; print('  openpyxl : OK')" 2>nul || echo   openpyxl : NOT FOUND
echo.

echo [3] .env file:
if exist ".env" (echo   FOUND) else (echo   NOT FOUND)
echo.

echo [4] Port 8000:
netstat -ano | findstr "LISTENING" | findstr ":8000" >nul 2>&1
if %errorlevel% == 0 (echo   In use - server running) else (echo   Free - server not running)
echo.

echo [5] Chrome:
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    echo   FOUND: %ProgramFiles%\Google\Chrome\Application\chrome.exe
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    echo   FOUND: %ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    echo   FOUND: %LocalAppData%\Google\Chrome\Application\chrome.exe
) else (
    echo   NOT FOUND
)
echo.

echo ================================
pause
