"""MusicHub NoneBot2 插件

适用于 NoneBot2 框架 (兼容 Lagrange / LLOneBot / NapCat 等适配器)。
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from core import NetEaseAPI, Downloader

# NoneBot2 插件元数据
__plugin_meta__ = {
    "name": "MusicHub",
    "description": "音乐搜索与下载插件",
    "usage": (
        "/music search <关键词> - 搜索歌曲\n"
        "/music hot - 热歌榜\n"
        "/music download <ID> - 下载歌曲\n"
        "/music random [数量] - 随机热门\n"
        "/music playlist <ID> - 查看歌单"
    ),
    "version": "1.0.0",
}

api = NetEaseAPI()
downloader = Downloader(api)


# 以下为 NoneBot2 插件注册代码 (需要 NoneBot2 环境才能运行)
try:
    from nonebot import on_command
    from nonebot.params import CommandArg
    from nonebot.adapters.onebot.v11 import Message, MessageSegment

    music_cmd = on_command("music", aliases={"音乐", "点歌"}, priority=5)

    @music_cmd.handle()
    async def handle_music(args: Message = CommandArg()):
        text = args.extract_plain_text().strip()
        if not text:
            await music_cmd.finish(__plugin_meta__["usage"])

        parts = text.split(maxsplit=1)
        cmd = parts[0].lower()
        arg = parts[1].strip() if len(parts) > 1 else ""

        if cmd in ("search", "s", "搜索"):
            await _handle_search(arg)
        elif cmd in ("hot", "热歌", "热歌榜"):
            await _handle_hot()
        elif cmd in ("download", "dl", "下载"):
            await _handle_download(arg)
        elif cmd in ("random", "随机"):
            await _handle_random(arg)
        elif cmd in ("playlist", "pl", "歌单"):
            await _handle_playlist(arg)
        else:
            # 默认搜索
            await _handle_search(text)

    async def _handle_search(keyword: str):
        if not keyword:
            await music_cmd.finish("请输入搜索关键词")
        result = api.search(keyword, limit=10)
        if result.get("code") != 200:
            await music_cmd.finish("搜索失败")
        lines = [f"🎵 搜索: {keyword}\n"]
        for i, s in enumerate(result["songs"][:10], 1):
            lines.append(f"{i}. {s['name']} - {s['artist_names']} (ID:{s['id']})")
        lines.append(f"\n💡 /music download <ID>")
        await music_cmd.finish("\n".join(lines))

    async def _handle_hot():
        result = api.get_hot_songs(10)
        if result.get("code") != 200:
            await music_cmd.finish("获取失败")
        lines = ["🔥 热歌榜 TOP 10\n"]
        for i, s in enumerate(result["songs"][:10], 1):
            lines.append(f"{i}. {s['name']} - {s['artist_names']} (ID:{s['id']})")
        await music_cmd.finish("\n".join(lines))

    async def _handle_download(song_id_str: str):
        try:
            song_id = int(song_id_str)
        except ValueError:
            await music_cmd.finish("请输入有效的歌曲 ID")
        detail = api.get_song_detail([song_id])
        if detail.get("code") != 200 or not detail.get("songs"):
            await music_cmd.finish("歌曲不存在")
        song = detail["songs"][0]
        url = api.get_song_url_simple(song_id)
        await music_cmd.finish(
            f"🎵 {song['name']} - {song['artist_names']}\n📎 {url}"
        )

    async def _handle_random(count_str: str):
        count = 5
        try:
            count = int(count_str) if count_str else 5
        except ValueError:
            pass
        count = max(1, min(50, count))
        songs = api.get_random_hot_songs(count)
        if not songs:
            await music_cmd.finish("获取失败")
        lines = [f"🎲 随机热门 {count} 首\n"]
        for i, s in enumerate(songs, 1):
            lines.append(f"{i}. {s['name']} - {s['artist_names']} (ID:{s['id']})")
        await music_cmd.finish("\n".join(lines))

    async def _handle_playlist(pid_str: str):
        try:
            pid = int(pid_str)
        except ValueError:
            await music_cmd.finish("请输入有效的歌单 ID")
        result = api.get_playlist_detail(pid)
        if result.get("code") != 200:
            await music_cmd.finish("歌单加载失败")
        lines = [f"📋 {result['name']}\n"]
        for i, s in enumerate(result.get("songs", [])[:15], 1):
            lines.append(f"{i}. {s['name']} - {s['artist_names']} (ID:{s['id']})")
        await music_cmd.finish("\n".join(lines))

except ImportError:
    # NoneBot2 未安装时，提供提示信息
    pass
