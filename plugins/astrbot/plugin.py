"""MusicHub AstrBot 插件

适用于 AstrBot 框架的 QQ 机器人音乐插件。
支持命令:
  /music search <关键词>    - 搜索歌曲
  /music hot               - 热歌榜
  /music download <ID>     - 下载歌曲
  /music random [数量]      - 随机下载热门
  /music playlist <ID>     - 查看歌单
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from core import NetEaseAPI, Downloader

api = NetEaseAPI()
downloader = Downloader(api)


class MusicHubPlugin:
    """AstrBot 插件类"""

    name = "MusicHub"
    description = "音乐搜索与下载插件"
    version = "1.0.0"
    author = "MusicHub"

    def __init__(self, config=None):
        self.config = config or {}
        self.api = NetEaseAPI(cookie=self.config.get("cookie"))
        self.downloader = Downloader(self.api)

    async def handle_message(self, message: str, context: dict = None) -> str:
        """处理消息"""
        parts = message.strip().split(maxsplit=1)
        if not parts:
            return self._help()

        cmd = parts[0].lower()
        args = parts[1].strip() if len(parts) > 1 else ""

        handlers = {
            "search": self._search,
            "s": self._search,
            "hot": self._hot,
            "download": self._download,
            "dl": self._download,
            "random": self._random,
            "playlist": self._playlist,
            "pl": self._playlist,
            "help": self._help,
        }

        handler = handlers.get(cmd)
        if handler:
            return await handler(args)
        return self._help()

    async def _search(self, keyword: str) -> str:
        if not keyword:
            return "请输入搜索关键词\n用法: /music search 周杰伦"

        result = self.api.search(keyword, limit=10)
        if result.get("code") != 200 or not result.get("songs"):
            return "没有找到相关歌曲"

        lines = [f"🎵 搜索结果: {keyword}\n"]
        for i, song in enumerate(result["songs"][:10], 1):
            fee = "🔒" if song.get("fee") == 1 else ""
            lines.append(f"{i}. {fee}{song['name']} - {song['artist_names']} (ID:{song['id']})")

        lines.append(f"\n共找到 {result.get('total', 0)} 首")
        lines.append("💡 使用 /music download <ID> 下载")
        return "\n".join(lines)

    async def _hot(self, _args: str) -> str:
        result = self.api.get_hot_songs(20)
        if result.get("code") != 200 or not result.get("songs"):
            return "获取热歌榜失败"

        lines = ["🔥 热歌榜 TOP 20\n"]
        for i, song in enumerate(result["songs"][:20], 1):
            lines.append(f"{i}. {song['name']} - {song['artist_names']} (ID:{song['id']})")

        lines.append("\n💡 使用 /music download <ID> 下载")
        return "\n".join(lines)

    async def _download(self, song_id_str: str) -> str:
        try:
            song_id = int(song_id_str.strip())
        except ValueError:
            return "请输入有效的歌曲 ID"

        # 获取歌曲信息
        detail = self.api.get_song_detail([song_id])
        if detail.get("code") != 200 or not detail.get("songs"):
            return "歌曲不存在"

        song = detail["songs"][0]
        url_result = self.api.get_song_url([song_id])

        if url_result.get("code") == 200 and url_result.get("urls"):
            url = url_result["urls"][0].get("url", "")
            if url:
                return (f"🎵 {song['name']} - {song['artist_names']}\n"
                        f"📎 下载链接: {url}\n"
                        f"💡 链接有时效性，请尽快下载")

        # 直链
        return (f"🎵 {song['name']} - {song['artist_names']}\n"
                f"📎 下载链接: https://music.163.com/song/media/outer/url?id={song_id}.mp3")

    async def _random(self, count_str: str) -> str:
        count = 5
        try:
            count = int(count_str.strip()) if count_str.strip() else 5
        except ValueError:
            pass
        count = max(1, min(50, count))

        songs = self.api.get_random_hot_songs(count)
        if not songs:
            return "获取热门歌曲失败"

        lines = [f"🎲 随机热门 {count} 首\n"]
        for i, song in enumerate(songs, 1):
            lines.append(f"{i}. {song['name']} - {song['artist_names']} (ID:{song['id']})")

        lines.append(f"\n💡 使用 /music download <ID> 下载")
        return "\n".join(lines)

    async def _playlist(self, pid_str: str) -> str:
        try:
            pid = int(pid_str.strip())
        except ValueError:
            return "请输入有效的歌单 ID"

        result = self.api.get_playlist_detail(pid)
        if result.get("code") != 200:
            return "歌单不存在或加载失败"

        lines = [f"📋 {result['name']}\n"]
        if result.get("description"):
            lines.append(f"{result['description'][:100]}\n")

        for i, song in enumerate(result.get("songs", [])[:20], 1):
            lines.append(f"{i}. {song['name']} - {song['artist_names']} (ID:{song['id']})")

        total = len(result.get("songs", []))
        if total > 20:
            lines.append(f"\n共 {total} 首，显示前 20 首")

        return "\n".join(lines)

    def _help(self) -> str:
        return """🎵 MusicHub 音乐插件

命令列表:
  /music search <关键词>  - 搜索歌曲
  /music hot             - 热歌榜
  /music download <ID>   - 下载歌曲 (返回链接)
  /music random [数量]    - 随机热门歌曲
  /music playlist <ID>   - 查看歌单

示例:
  /music search 周杰伦
  /music hot
  /music download 1234567
  /music random 10"""


# AstrBot 入口函数
def get_plugin():
    return MusicHubPlugin()
