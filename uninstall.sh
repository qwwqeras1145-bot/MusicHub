#!/bin/bash
# MusicHub 卸载脚本
# 使用方法: sudo bash uninstall.sh

set -e

echo "=========================================="
echo "  MusicHub 卸载脚本"
echo "=========================================="
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 用户或 sudo 运行此脚本"
    exit 1
fi

# 确认卸载
echo "⚠️  警告：此操作将完全卸载 MusicHub，包括所有数据"
echo ""
read -p "确定要卸载吗？(输入 yes 继续): " confirm
if [ "$confirm" != "yes" ]; then
    echo "已取消卸载"
    exit 0
fi

echo ""
echo "[1/4] 停止并禁用服务..."
if systemctl is-active --quiet musichub 2>/dev/null; then
    systemctl stop musichub
    echo "  ✓ 服务已停止"
else
    echo "  - 服务未运行"
fi

if systemctl is-enabled --quiet musichub 2>/dev/null; then
    systemctl disable musichub
    echo "  ✓ 服务已禁用"
else
    echo "  - 服务未启用"
fi

echo ""
echo "[2/4] 删除 systemd 服务文件..."
if [ -f /etc/systemd/system/musichub.service ]; then
    rm -f /etc/systemd/system/musichub.service
    systemctl daemon-reload
    echo "  ✓ 服务文件已删除"
else
    echo "  - 服务文件不存在"
fi

echo ""
echo "[3/4] 删除项目文件..."
if [ -d /opt/MusicHub ]; then
    # 备份用户数据（如果存在）
    BACKUP_DIR="/root/musichub-backup-$(date +%Y%m%d-%H%M%S)"
    if [ -d /opt/MusicHub/web/data ] && [ "$(ls -A /opt/MusicHub/web/data 2>/dev/null)" ]; then
        echo "  发现用户数据，正在备份到 $BACKUP_DIR ..."
        mkdir -p "$BACKUP_DIR"
        cp -r /opt/MusicHub/web/data "$BACKUP_DIR/" 2>/dev/null || true
        echo "  ✓ 数据已备份"
    fi
    
    rm -rf /opt/MusicHub
    echo "  ✓ 项目目录已删除"
else
    echo "  - 项目目录不存在"
fi

echo ""
echo "[4/4] 清理 Python 缓存..."
find /opt -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find /opt -name "*.pyc" -delete 2>/dev/null || true
echo "  ✓ 缓存已清理"

echo ""
echo "=========================================="
echo "  ✅ MusicHub 已完全卸载"
echo "=========================================="
echo ""
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    echo "📦 用户数据已备份到: $BACKUP_DIR"
    echo "   如果不需要备份，可以手动删除: rm -rf $BACKUP_DIR"
    echo ""
fi
echo "注意：系统依赖包（python3, git 等）未自动卸载"
echo "如需卸载，请手动运行: apt-get remove python3 git"
echo ""
