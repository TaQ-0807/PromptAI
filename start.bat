@echo off
chcp 65001 >nul
echo PromptoAI 起動中...
start http://localhost:8000
uvicorn main:app --reload --port 8000
