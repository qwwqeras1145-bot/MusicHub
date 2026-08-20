#!/bin/bash
# MusicHub 一键部署脚本
# 使用方法: SSH 登录服务器后运行
# curl -fsSL https://raw.githubusercontent.com/qwwqeras1145-bot/MusicHub/main/deploy.sh | bash

set -e

echo "=========================================="
echo "  MusicHub 一键部署脚本"
echo "=========================================="
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 用户运行此脚本"
    exit 1
fi

# 更新系统
echo "[1/6] 更新系统包..."
apt-get update -qq
apt-get install -y -qq git python3 python3-pip python3-venv

# 克隆项目
echo "[2/6] 克隆 MusicHub 项目..."
cd /opt
rm -rf MusicHub
git clone https://github.com/qwwqeras1145-bot/MusicHub.git
cd MusicHub

# 创建虚拟环境
echo "[3/6] 创建 Python 虚拟环境..."
python3 -m venv venv
source venv/bin/activate

# 安装依赖
echo "[4/6] 安装 Python 依赖..."
pip install -r requirements.txt -q

# 创建 systemd 服务
echo "[5/6] 创建系统服务..."
cat > /etc/systemd/system/musichub.service << 'EOF'
[Unit]
Description=MusicHub Music Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/MusicHub
ExecStart=/opt/MusicHub/venv/bin/python run.py --host 0.0.0.0 --port 8888
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
echo "[6/6] 启动服务..."
systemctl daemon-reload
systemctl enable musichub
systemctl start musichub

sleep 3

# 检查状态
if systemctl is-active --quiet musichub; then
    echo ""
    echo "=========================================="
    echo "  ✅ MusicHub 部署成功！"
    echo "=========================================="
    echo ""
    echo "访问地址: http://$(curl -s ifconfig.me):8888"
    echo ""
    echo "管理命令:"
    echo "  查看状态: systemctl status musichub"
    echo "  停止服务: systemctl stop musichub"
    echo "  重启服务: systemctl restart musichub"
    echo "  查看日志: journalctl -u musichub -f"
    echo ""
else
    echo ""
    echo "❌ 服务启动失败，请检查日志:"
    echo "  journalctl -u musichub -n 50"
fi
