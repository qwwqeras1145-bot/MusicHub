#!/bin/bash
# MusicHub 命令行版启动脚本
cd "$(dirname "$0")"
python3 cli/main.py "$@"
