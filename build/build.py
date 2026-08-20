#!/usr/bin/env python3
"""
Windows EXE 打包脚本

使用 PyInstaller 将 MusicHub 打包为独立的 Windows 可执行文件。
打包后双击即可运行，自带网页界面。

依赖: pip install pyinstaller

用法:
    python build/build_windows.py
"""
import os
import sys
import subprocess
import shutil

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_exe():
    """打包为 Windows EXE"""
    print("🔨 开始打包 MusicHub Windows EXE...")

    # 检查 PyInstaller
    try:
        import PyInstaller
    except ImportError:
        print("请先安装 PyInstaller: pip install pyinstaller")
        sys.exit(1)

    # PyInstaller 参数
    args = [
        "pyinstaller",
        "--onefile",                    # 单文件
        "--windowed",                   # 无控制台窗口
        "--name", "MusicHub",
        "--icon", os.path.join(PROJECT_ROOT, "web", "static", "img", "icon.ico"),
        "--add-data", f"{os.path.join(PROJECT_ROOT, 'web', 'static')}{os.pathsep}web/static",
        "--add-data", f"{os.path.join(PROJECT_ROOT, 'core')}{os.pathsep}core",
        "--hidden-import", "flask",
        "--hidden-import", "flask_cors",
        "--hidden-import", "requests",
        "--hidden-import", "Crypto",
        "--hidden-import", "mutagen",
        "--distpath", os.path.join(PROJECT_ROOT, "dist"),
        "--workpath", os.path.join(PROJECT_ROOT, "build", "tmp"),
        "--specpath", os.path.join(PROJECT_ROOT, "build"),
        "--clean",
        os.path.join(PROJECT_ROOT, "run.py"),
    ]

    # 如果 icon 不存在，去掉 icon 参数
    if not os.path.exists(os.path.join(PROJECT_ROOT, "web", "static", "img", "icon.ico")):
        args = [a for a in args if not a.startswith("--icon")]

    print("执行命令:", " ".join(args))
    result = subprocess.run(args, cwd=PROJECT_ROOT)

    if result.returncode == 0:
        exe_path = os.path.join(PROJECT_ROOT, "dist", "MusicHub.exe")
        print(f"\n✅ 打包成功: {exe_path}")
        print(f"📦 文件大小: {os.path.getsize(exe_path) / 1024 / 1024:.1f} MB")
    else:
        print("\n❌ 打包失败")
        sys.exit(1)


def build_linux():
    """打包为 Linux 可执行文件"""
    print("🔨 开始打包 MusicHub Linux 版本...")

    try:
        import PyInstaller
    except ImportError:
        print("请先安装 PyInstaller: pip install pyinstaller")
        sys.exit(1)

    args = [
        "pyinstaller",
        "--onefile",
        "--name", "musichub",
        "--add-data", f"{os.path.join(PROJECT_ROOT, 'web', 'static')}{os.pathsep}web/static",
        "--add-data", f"{os.path.join(PROJECT_ROOT, 'core')}{os.pathsep}core",
        "--hidden-import", "flask",
        "--hidden-import", "flask_cors",
        "--hidden-import", "requests",
        "--hidden-import", "Crypto",
        "--hidden-import", "mutagen",
        "--distpath", os.path.join(PROJECT_ROOT, "dist"),
        "--workpath", os.path.join(PROJECT_ROOT, "build", "tmp"),
        "--specpath", os.path.join(PROJECT_ROOT, "build"),
        "--clean",
        os.path.join(PROJECT_ROOT, "run.py"),
    ]

    result = subprocess.run(args, cwd=PROJECT_ROOT)
    if result.returncode == 0:
        path = os.path.join(PROJECT_ROOT, "dist", "musichub")
        os.chmod(path, 0o755)
        print(f"\n✅ 打包成功: {path}")
    else:
        print("\n❌ 打包失败")


if __name__ == "__main__":
    if sys.platform == "win32":
        build_exe()
    else:
        build_linux()
