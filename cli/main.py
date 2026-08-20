#!/usr/bin/env python3
"""MusicHub 命令行版

交互式命令行音乐搜索、播放、下载工具。

用法:
    python cli/main.py                    # 交互模式
    python cli/main.py search "周杰伦"    # 搜索
    python cli/main.py hot                # 热歌榜
    python cli/main.py download 12345     # 下载指定歌曲
    python cli/main.py random 10          # 随机下载热门
"""
import sys
import os

# 确保项目根目录在 path 中
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import NetEaseAPI, Downloader
from config import DOWNLOAD_DIR


BANNER = r"""
╔═══════════════════════════════════════════════╗
║                                               ║
║   🎵 MusicHub CLI - 音乐下载命令行工具        ║
║                                               ║
║   命令:                                       ║
║     s / search <关键词>  - 搜索歌曲            ║
║     hot                  - 热歌榜             ║
║     new                  - 新歌榜             ║
║     play <序号>          - 播放歌曲            ║
║     dl <序号>            - 下载歌曲            ║
║     dlall                - 下载当前列表全部    ║
║     random <数量>        - 随机下载热门歌曲    ║
║     playlist <ID>        - 查看歌单           ║
║     stats                - 下载统计           ║
║     help                 - 帮助              ║
║     q / quit             - 退出              ║
║                                               ║
╚═══════════════════════════════════════════════╝
"""

api = NetEaseAPI()
downloader = Downloader(api)
current_songs = []


def print_songs(songs, limit=30):
    """打印歌曲列表"""
    global current_songs
    display = songs[:limit]
    current_songs = display

    print(f"\n{'─' * 60}")
    print(f"  {'序号':>4}  {'歌曲名':<30} {'歌手':<20} {'时长':>6}")
    print(f"{'─' * 60}")
    for i, song in enumerate(display, 1):
        name = song['name'][:28]
        artist = song['artist_names'][:18]
        dur = f"{song['duration'] // 60000}:{(song['duration'] % 60000) // 1000:02d}"
        fee = "🔒" if song.get('fee') == 1 else "  "
        print(f"  {i:>4}  {fee}{name:<28} {artist:<20} {dur:>6}")
    print(f"{'─' * 60}")
    if len(songs) > limit:
        print(f"  共 {len(songs)} 首，显示前 {limit} 首")
    print()


def cmd_search(args):
    """搜索命令"""
    if not args:
        print("用法: s <关键词>")
        return
    keyword = " ".join(args)
    print(f"搜索: {keyword} ...")
    result = api.search(keyword, limit=50)
    if result.get('code') == 200 and result.get('songs'):
        print(f"找到 {result['total']} 首歌曲:")
        print_songs(result['songs'])
    else:
        print("没有找到相关歌曲")


def cmd_hot(_args):
    """热歌榜"""
    print("加载热歌榜...")
    result = api.get_hot_songs(50)
    if result.get('code') == 200 and result.get('songs'):
        print_songs(result['songs'])
    else:
        print("加载失败")


def cmd_new(_args):
    """新歌榜"""
    print("加载新歌榜...")
    result = api.get_new_songs()
    if result.get('code') == 200 and result.get('songs'):
        print_songs(result['songs'])
    else:
        print("加载失败")


def cmd_play(args):
    """播放命令 (打印链接)"""
    if not args or not current_songs:
        print("请先搜索歌曲，然后使用 play <序号>")
        return
    try:
        idx = int(args[0]) - 1
        if 0 <= idx < len(current_songs):
            song = current_songs[idx]
            url = api.get_song_url_simple(song['id'])
            print(f"\n🎵 {song['name']} - {song['artist_names']}")
            print(f"📎 播放链接: {url}")
            print(f"💡 复制链接到浏览器或播放器中播放")
        else:
            print("序号超出范围")
    except ValueError:
        print("请输入有效序号")


def cmd_download(args):
    """下载命令"""
    if not args or not current_songs:
        print("请先搜索歌曲，然后使用 dl <序号>")
        return
    try:
        idx = int(args[0]) - 1
        if 0 <= idx < len(current_songs):
            song = current_songs[idx]
            print(f"下载: {song['name']} - {song['artist_names']}")
            result = downloader.download_song(song['id'])
            if result['success']:
                print(f"✅ 已保存: {result['path']}")
            else:
                print(f"❌ 下载失败: {result.get('error', '未知错误')}")
        else:
            print("序号超出范围")
    except ValueError:
        print("请输入有效序号")


def cmd_download_all(_args):
    """下载当前列表全部"""
    if not current_songs:
        print("当前没有歌曲列表，请先搜索")
        return
    total = len(current_songs)
    print(f"开始批量下载 {total} 首歌曲...")
    results = downloader.download_batch(
        [s['id'] for s in current_songs],
        on_progress=lambda i, t, status, detail: print(f"  [{i+1}/{t}] {detail}")
    )
    success = sum(1 for r in results if r['success'])
    print(f"\n✅ 下载完成: 成功 {success}/{total}")


def cmd_random(args):
    """随机下载热门"""
    count = 5
    if args:
        try:
            count = int(args[0])
            count = max(1, min(200, count))
        except ValueError:
            pass

    print(f"从热歌榜随机下载 {count} 首...")

    def progress(i, t, status, detail):
        print(f"  [{i+1}/{t}] {detail}")

    results = downloader.download_random(count, on_progress=progress)
    success = sum(1 for r in results if r.get('success'))
    print(f"\n✅ 下载完成: 成功 {success}/{count}")


def cmd_playlist(args):
    """查看歌单"""
    if not args:
        print("用法: playlist <歌单ID>")
        return
    try:
        pid = int(args[0])
        print(f"加载歌单 {pid}...")
        result = api.get_playlist_detail(pid)
        if result.get('code') == 200:
            print(f"歌单: {result['name']}")
            if result.get('description'):
                print(f"简介: {result['description'][:80]}")
            print_songs(result['songs'])
        else:
            print("加载失败")
    except ValueError:
        print("请输入有效的歌单 ID")


def cmd_stats(_args):
    """下载统计"""
    stats = downloader.get_download_stats()
    print(f"\n📊 下载统计:")
    print(f"  歌曲数量: {stats['count']}")
    print(f"  占用空间: {stats['total_size_mb']} MB")
    print(f"  下载目录: {stats['download_dir']}")
    print()


def interactive():
    """交互式模式"""
    print(BANNER)
    commands = {
        's': cmd_search, 'search': cmd_search,
        'hot': cmd_hot,
        'new': cmd_new,
        'play': cmd_play, 'p': cmd_play,
        'dl': cmd_download, 'download': cmd_download,
        'dlall': cmd_download_all,
        'random': cmd_random, 'rand': cmd_random,
        'playlist': cmd_playlist, 'pl': cmd_playlist,
        'stats': cmd_stats,
        'help': lambda _: print(BANNER),
        'q': lambda _: sys.exit(0), 'quit': lambda _: sys.exit(0),
        'exit': lambda _: sys.exit(0),
    }

    while True:
        try:
            line = input("\n🎵 > ").strip()
            if not line:
                continue
            parts = line.split(maxsplit=1)
            cmd = parts[0].lower()
            args = parts[1].split() if len(parts) > 1 else []

            handler = commands.get(cmd)
            if handler:
                handler(args)
            else:
                # 默认作为搜索
                cmd_search([line])
        except (KeyboardInterrupt, EOFError):
            print("\n再见！")
            break


def main():
    """主入口"""
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        args = sys.argv[2:]

        commands = {
            'search': cmd_search, 's': cmd_search,
            'hot': cmd_hot,
            'new': cmd_new,
            'download': cmd_download,
            'random': cmd_random,
            'playlist': cmd_playlist,
            'stats': cmd_stats,
            'help': lambda _: print(BANNER),
        }

        handler = commands.get(cmd)
        if handler:
            handler(args)
        else:
            print(f"未知命令: {cmd}")
            print(BANNER)
    else:
        interactive()


if __name__ == "__main__":
    main()
