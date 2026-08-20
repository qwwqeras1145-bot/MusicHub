"""MusicHub 全局配置"""
import os

# 服务配置
HOST = "0.0.0.0"
PORT = 8888
DEBUG = False

# 下载配置
DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "MusicHub", "downloads")
DEFAULT_QUALITY = "exhigh"  # standard / exhigh / lossless / hires
QUALITY_MAP = {
    "standard": 128000,
    "exhigh": 320000,
    "lossless": 999000,
    "hires": 1999000,
}

# API 配置
NETEASE_API_BASE = "https://music.163.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://music.163.com/",
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
}

# 批量下载
BATCH_DEFAULT_COUNT = 5
BATCH_MAX_COUNT = 200
REQUEST_INTERVAL = 0.5  # 请求间隔（秒）

# 确保下载目录存在
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
