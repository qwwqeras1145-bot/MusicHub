#!/bin/bash
# MusicHub 一键启动脚本 (macOS / Linux)
set -e

echo "=========================================="
echo "  MusicHub 音乐下载中心 v2.0"
echo "=========================================="
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 Python3"
    echo "安装方法:"
    echo "  macOS:  brew install python3"
    echo "  Ubuntu: sudo apt install python3 python3-pip"
    exit 1
fi

# 安装依赖
echo "[1/3] 安装依赖..."
pip3 install -r requirements.txt -q 2>/dev/null || pip3 install --break-system-packages -r requirements.txt -q

echo "[2/3] 启动服务..."
echo "[3/3] 浏览器即将打开..."
echo ""
echo "=========================================="
echo "  访问地址: http://localhost:8888"
echo "  管理后台: http://localhost:8888/#admin"
echo "  管理员:   admin / admin123"
echo "  按 Ctrl+C 停止服务"
echo "=========================================="
echo ""

# 自动打开浏览器
if command -v xdg-open &> /dev/null; then
    sleep 2 && xdg-open http://localhost:8888 &
elif command -v open &> /dev/null; then
    sleep 2 && open http://localhost:8888 &
fi

python3 run.py --host 0.0.0.0 --port 8888
