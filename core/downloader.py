"""音乐下载管理器

支持单曲下载、批量下载、随机热门下载。
"""
import os
import re
import time
import requests
from typing import Optional, Callable
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC

from .api import NetEaseAPI
from config import DOWNLOAD_DIR, QUALITY_MAP, DEFAULT_QUALITY


def sanitize_filename(name: str) -> str:
    """清理文件名中的非法字符"""
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:200]  # 限制长度


class Downloader:
    """音乐下载管理器"""

    def __init__(self, api: NetEaseAPI = None, download_dir: str = None):
        self.api = api or NetEaseAPI()
        self.download_dir = download_dir or DOWNLOAD_DIR
        os.makedirs(self.download_dir, exist_ok=True)

    def download_song(self, song_id: int, quality: str = DEFAULT_QUALITY,
                      on_progress: Optional[Callable] = None) -> dict:
        """下载单曲

        Args:
            song_id: 歌曲 ID
            quality: 音质 (standard/exhigh/lossless/hires)
            on_progress: 进度回调函数

        Returns:
            {"success": bool, "path": str, "error": str}
        """
        # 获取歌曲详情
        detail = self.api.get_song_detail([song_id])
        if detail.get("code") != 200 or not detail.get("songs"):
            return {"success": False, "error": "获取歌曲详情失败"}

        song = detail["songs"][0]
        song_name = sanitize_filename(song["name"])
        artist_name = sanitize_filename(song["artist_names"])
        filename = f"{song_name} - {artist_name}"

        # 获取播放链接
        br = QUALITY_MAP.get(quality, 320000)
        url_result = self.api.get_song_url([song_id], br)

        song_url = None
        ext = "mp3"
        if url_result.get("code") == 200 and url_result.get("urls"):
            song_url = url_result["urls"][0]["url"]
            ext = url_result["urls"][0].get("type", "mp3")

        if not song_url:
            # 尝试直链
            song_url = self.api.get_song_url_simple(song_id)

        filepath = os.path.join(self.download_dir, f"{filename}.{ext}")

        # 如果文件已存在
        if os.path.exists(filepath):
            return {"success": True, "path": filepath, "skipped": True}

        # 下载文件
        try:
            if on_progress:
                on_progress("downloading", f"正在下载: {song_name}")

            resp = requests.get(song_url, stream=True, timeout=30,
                                headers={"User-Agent": self.api.session.headers["User-Agent"]})
            resp.raise_for_status()

            total_size = int(resp.headers.get("content-length", 0))
            downloaded = 0

            with open(filepath, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if on_progress and total_size > 0:
                            pct = int(downloaded / total_size * 100)
                            on_progress("progress", pct)

            # 写入 ID3 标签
            self._write_tags(filepath, song)

            return {"success": True, "path": filepath}

        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            return {"success": False, "error": str(e)}

    def download_batch(self, song_ids: list, quality: str = DEFAULT_QUALITY,
                       on_progress: Optional[Callable] = None) -> list:
        """批量下载

        Args:
            song_ids: 歌曲 ID 列表
            quality: 音质
            on_progress: 进度回调 (index, total, status, detail)

        Returns:
            每项 {"song_id": int, "success": bool, "path": str, "error": str}
        """
        results = []
        total = len(song_ids)
        for i, sid in enumerate(song_ids):
            if on_progress:
                on_progress(i, total, "downloading", f"下载中 ({i+1}/{total})")

            result = self.download_song(sid, quality)
            result["song_id"] = sid
            results.append(result)

            if on_progress:
                on_progress(i, total, "done",
                            f"{'成功' if result['success'] else '失败'} ({i+1}/{total})")

        return results

    def download_random_hot(self, count: int = 5, quality: str = DEFAULT_QUALITY,
                            on_progress: Optional[Callable] = None) -> list:
        """随机下载热门歌曲

        Args:
            count: 下载数量
            quality: 音质
            on_progress: 进度回调

        Returns:
            下载结果列表
        """
        if on_progress:
            on_progress(0, 0, "fetching", "正在获取热歌榜...")

        songs = self.api.get_random_hot_songs(count)
        if not songs:
            return [{"success": False, "error": "获取热歌榜失败"}]

        song_ids = [s["id"] for s in songs]

        if on_progress:
            on_progress(0, 0, "found",
                        f"找到 {len(songs)} 首热门歌曲，开始下载...")

        return self.download_batch(song_ids, quality, on_progress)

    def _write_tags(self, filepath: str, song: dict):
        """写入 ID3 标签"""
        try:
            if not filepath.endswith(".mp3"):
                return

            audio = MP3(filepath, ID3=ID3)
            try:
                audio.add_tags()
            except Exception:
                pass

            audio.tags.add(TIT2(encoding=3, text=song["name"]))
            audio.tags.add(TPE1(encoding=3, text=song["artist_names"]))
            if song.get("album", {}).get("name"):
                audio.tags.add(TALB(encoding=3, text=song["album"]["name"]))

            # 下载封面
            pic_url = song.get("album", {}).get("pic", "")
            if pic_url:
                try:
                    pic_data = requests.get(pic_url, timeout=10).content
                    audio.tags.add(APIC(
                        encoding=3, mime="image/jpeg",
                        type=3, desc="Cover", data=pic_data
                    ))
                except Exception:
                    pass

            audio.save()
        except Exception:
            pass

    def get_download_url(self, song_id: int, quality: str = DEFAULT_QUALITY) -> dict:
        """获取歌曲下载链接（不下载文件）

        Args:
            song_id: 歌曲 ID
            quality: 音质 (standard/exhigh/lossless/hires)

        Returns:
            {"code": int, "url": str, "size": int, "error": str}
        """
        # 获取歌曲详情
        detail = self.api.get_song_detail([song_id])
        if detail.get("code") != 200 or not detail.get("songs"):
            return {"code": -1, "error": "获取歌曲详情失败"}

        song = detail["songs"][0]
        song_name = sanitize_filename(song["name"])
        artist_name = sanitize_filename(song["artist_names"])
        filename = f"{song_name} - {artist_name}"

        # 获取播放链接
        br = QUALITY_MAP.get(quality, 320000)
        url_result = self.api.get_song_url([song_id], br)

        song_url = None
        ext = "mp3"
        size = 0
        if url_result.get("code") == 200 and url_result.get("urls"):
            song_url = url_result["urls"][0]["url"]
            ext = url_result["urls"][0].get("type", "mp3")
            size = url_result["urls"][0].get("size", 0)

        if not song_url:
            # 尝试直链
            song_url = self.api.get_song_url_simple(song_id)

        return {
            "code": 200,
            "url": song_url,
            "filename": f"{filename}.{ext}",
            "size": size,
            "name": song["name"],
            "artist": song["artist_names"]
        }

    def get_download_stats(self) -> dict:
        """获取下载目录统计"""
        files = [f for f in os.listdir(self.download_dir)
                 if f.endswith(('.mp3', '.flac', '.wav', '.m4a'))]
        total_size = sum(
            os.path.getsize(os.path.join(self.download_dir, f))
            for f in files if os.path.exists(os.path.join(self.download_dir, f))
        )
        return {
            "count": len(files),
            "total_size_mb": round(total_size / 1024 / 1024, 2),
            "download_dir": self.download_dir,
        }
