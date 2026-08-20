@echo off
chcp 65001 >nul
title MusicHub - 音乐下载中心 v2.0

echo ==========================================
echo   MusicHub 音乐下载中心 v2.0
echo ==========================================
echo.

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 安装依赖
echo [1/3] 安装依赖...
pip install -r requirements.txt -q

REM 启动
echo [2/3] 启动服务...
echo [3/3] 浏览器即将打开...
echo.
echo ==========================================
echo   访问地址: http://localhost:8888
echo   管理后台: http://localhost:8888/#admin
echo   管理员:   admin / admin123
echo   按 Ctrl+C 停止服务
echo ==========================================
echo.

start http://localhost:8888
python run.py --host 127.0.0.1 --port 8888
pause
