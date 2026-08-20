#!/usr/bin/env python3
"""MusicHub 主入口

用法:
    python run.py              # 启动网页版 (默认端口 8888)
    python run.py --cli        # 启动命令行版
    python run.py --port 9000  # 指定端口
"""
import sys
import os
import argparse

# 确保项目根目录在 path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(
        description="MusicHub - 音乐下载中心",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python run.py                    # 启动网页版
  python run.py --port 9000        # 指定端口
  python run.py --cli              # 启动命令行版
  python run.py --host 127.0.0.1   # 仅本机访问
        """
    )
    parser.add_argument("--cli", action="store_true", help="启动命令行版本")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址 (默认 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8888, help="监听端口 (默认 8888)")
    parser.add_argument("--debug", action="store_true", help="调试模式")

    args = parser.parse_args()

    if args.cli:
        from cli.main import interactive
        interactive()
    else:
        from web.app import run_server
        run_server(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
