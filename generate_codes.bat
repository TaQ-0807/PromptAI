@echo off
cd /d "%~dp0"
set /p n=How many codes? (Enter for 5):
if "%n%"=="" set n=5
python generate_codes.py %n%
pause
