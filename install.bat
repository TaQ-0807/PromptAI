@echo off
chcp 65001 >nul
echo PromptoAI セットアップ中...
pip install -r requirements.txt
echo.
echo セットアップ完了！
echo 次に .env ファイルにAPIキーを貼り付けてから start.bat を実行してください。
pause
