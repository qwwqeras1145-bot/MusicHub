"""网易云音乐 API 客户端

提供搜索、歌曲详情、播放链接、歌词、热门歌单等接口。
"""
import time
import random
import requests
from typing import Optional
from .crypto import weapi_encrypt
from config import NETEASE_API_BASE, HEADERS, REQUEST_INTERVAL


class NetEaseAPI:
    """网易云音乐 API 客户端"""

    def __init__(self, cookie: Optional[str] = None):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        if cookie:
            self.session.headers["Cookie"] = cookie
        self._last_request_time = 0

    def _throttle(self):
        """请求限速"""
        elapsed = time.time() - self._last_request_time
        if elapsed < REQUEST_INTERVAL:
            time.sleep(REQUEST_INTERVAL - elapsed)
        self._last_request_time = time.time()

    def _request(self, method: str, url: str, data: dict = None,
                 encrypt: bool = True, raw: bool = False) -> dict:
        """发送请求"""
        self._throttle()
        if data and encrypt:
            data = weapi_encrypt(data)
        try:
            if method == "POST":
                resp = self.session.post(url, data=data, timeout=15)
            else:
                resp = self.session.get(url, params=data, timeout=15)
            if raw:
                return resp.content
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"code": -1, "msg": str(e)}

    # ==================== 搜索 ====================

    def search(self, keyword: str, limit: int = 30, offset: int = 0,
               search_type: int = 1) -> dict:
        """搜索歌曲

        Args:
            keyword: 搜索关键词
            limit: 返回数量
            offset: 偏移量
            search_type: 1=单曲, 10=专辑, 100=歌手, 1000=歌单
        """
        # 优先使用 cloudsearch 接口
        url = f"{NETEASE_API_BASE}/weapi/cloudsearch/get/web"
        data = {
            "s": keyword,
            "type": search_type,
            "limit": limit,
            "offset": offset,
            "total": True,
        }
        result = self._request("POST", url, data)
        if result.get("code") == 200 and "result" in result:
            songs = result["result"].get("songs", [])
            return {
                "code": 200,
                "songs": self._format_songs(songs),
                "total": result["result"].get("songCount", 0),
            }

        # 回退到旧版搜索接口
        url2 = f"{NETEASE_API_BASE}/weapi/search/get"
        data2 = {
            "s": keyword,
            "type": search_type,
            "limit": limit,
            "offset": offset,
            "total": True,
        }
        result2 = self._request("POST", url2, data2)
        if result2.get("code") == 200 and "result" in result2:
            songs = result2["result"].get("songs", [])
            return {
                "code": 200,
                "songs": self._format_songs(songs),
                "total": result2["result"].get("songCount", 0),
            }

        # 最后尝试非加密接口
        url3 = f"{NETEASE_API_BASE}/api/search/pc"
        data3 = {
            "s": keyword,
            "type": search_type,
            "limit": limit,
            "offset": offset,
        }
        result3 = self._request("POST", url3, data3, encrypt=False)
        if result3.get("code") == 200 and "result" in result3:
            songs = result3["result"].get("songs", [])
            return {
                "code": 200,
                "songs": self._format_songs(songs),
                "total": result3["result"].get("songCount", 0),
            }

        return result

    def search_suggest(self, keyword: str) -> dict:
        """搜索建议"""
        url = f"{NETEASE_API_BASE}/weapi/search/suggest/keyword"
        data = {"s": keyword}
        return self._request("POST", url, data)

    # ==================== 歌曲详情 ====================

    def get_song_detail(self, song_ids: list) -> dict:
        """获取歌曲详情"""
        url = f"{NETEASE_API_BASE}/weapi/v3/song/detail"
        c = [{"id": sid} for sid in song_ids]
        data = {"c": str(c), "ids": str(song_ids)}
        result = self._request("POST", url, data)
        if result.get("code") == 200:
            return {
                "code": 200,
                "songs": self._format_songs(result.get("songs", [])),
            }
        return result

    # ==================== 播放链接 ====================

    def get_song_url(self, song_ids: list, quality: int = 320000) -> dict:
        """获取歌曲播放/下载链接

        Args:
            song_ids: 歌曲 ID 列表
            quality: 音质 (128000/320000/999000/1999000)
        """
        url = f"{NETEASE_API_BASE}/weapi/song/enhance/player/url/v1"
        data = {
            "ids": song_ids,
            "level": "exhigh" if quality >= 320000 else "standard",
            "encodeType": "mp3",
        }
        result = self._request("POST", url, data)
        if result.get("code") == 200:
            urls = []
            for item in result.get("data", []):
                if item.get("url"):
                    urls.append({
                        "id": item["id"],
                        "url": item["url"],
                        "type": item.get("type", "mp3"),
                        "size": item.get("size", 0),
                        "br": item.get("br", 0),
                    })
            return {"code": 200, "urls": urls}
        return result

    def get_song_url_simple(self, song_id: int) -> str:
        """获取歌曲直链 (标准音质)"""
        return f"{NETEASE_API_BASE}/song/media/outer/url?id={song_id}.mp3"

    # ==================== 歌词 ====================

    def get_lyric(self, song_id: int) -> dict:
        """获取歌词"""
        url = f"{NETEASE_API_BASE}/weapi/song/lyric"
        data = {
            "id": song_id,
            "lv": -1,
            "tv": -1,
            "csrf_token": "",
        }
        result = self._request("POST", url, data)
        if result.get("code") == 200:
            return {
                "code": 200,
                "lyric": result.get("lrc", {}).get("lyric", ""),
                "tlyric": result.get("tlyric", {}).get("lyric", ""),
            }
        return result

    # ==================== 排行榜 & 热门 ====================

    def get_toplist(self) -> dict:
        """获取所有榜单"""
        url = f"{NETEASE_API_BASE}/weapi/toplist"
        data = {}
        return self._request("POST", url, data)

    def get_toplist_detail(self, list_id: int) -> dict:
        """获取榜单详情"""
        url = f"{NETEASE_API_BASE}/weapi/v3/playlist/detail"
        data = {"id": list_id, "n": 100, "csrf_token": ""}
        result = self._request("POST", url, data)
        if result.get("code") == 200:
            tracks = result.get("playlist", {}).get("tracks", [])
            return {
                "code": 200,
                "name": result.get("playlist", {}).get("name", ""),
                "songs": self._format_songs(tracks[:100]),
            }
        return result

    def get_hot_songs(self, count: int = 50) -> dict:
        """获取热歌榜歌曲"""
        # 热歌榜 ID: 3778678
        return self.get_toplist_detail(3778678)

    def get_new_songs(self) -> dict:
        """获取新歌榜"""
        # 新歌榜 ID: 3779629
        return self.get_toplist_detail(3779629)

    def get_original_list(self) -> dict:
        """获取原创榜"""
        # 原创榜 ID: 2884035
        return self.get_toplist_detail(2884035)

    # ==================== 歌单 ====================

    def get_playlist_detail(self, playlist_id: int) -> dict:
        """获取歌单详情"""
        url = f"{NETEASE_API_BASE}/weapi/v3/playlist/detail"
        data = {"id": playlist_id, "n": 1000, "csrf_token": ""}
        result = self._request("POST", url, data)
        if result.get("code") == 200:
            tracks = result.get("playlist", {}).get("tracks", [])
            return {
                "code": 200,
                "name": result.get("playlist", {}).get("name", ""),
                "description": result.get("playlist", {}).get("description", ""),
                "cover": result.get("playlist", {}).get("coverImgUrl", ""),
                "songs": self._format_songs(tracks),
            }
        return result

    def get_recommend_playlist(self) -> dict:
        """获取推荐歌单"""
        url = f"{NETEASE_API_BASE}/weapi/v1/discovery/recommend/resource"
        return self._request("POST", url, {})

    def get_highquality_playlist(self, limit: int = 20) -> dict:
        """获取精品歌单"""
        url = f"{NETEASE_API_BASE}/weapi/playlist/highquality/list"
        data = {"cat": "全部", "limit": limit, "lasttime": 0, "total": True}
        return self._request("POST", url, data)

    # ==================== 歌手 ====================

    def get_artist_songs(self, artist_id: int, limit: int = 50) -> dict:
        """获取歌手热门歌曲"""
        url = f"{NETEASE_API_BASE}/weapi/v1/artist/songs"
        data = {"id": artist_id, "private_cloud": True, "work_type": 1,
                "order": "hot", "offset": 0, "limit": limit}
        result = self._request("POST", url, data)
        if result.get("code") == 200:
            return {
                "code": 200,
                "songs": self._format_songs(result.get("songs", [])),
            }
        return result

    # ==================== 用户 ====================

    def login_cellphone(self, phone: str, password: str = None,
                        captcha: str = None) -> dict:
        """手机号登录"""
        url = f"{NETEASE_API_BASE}/weapi/login/cellphone"
        data = {
            "phone": phone,
            "countrycode": "86",
            "rememberLogin": True,
        }
        if password:
            data["password"] = password
        if captcha:
            data["captcha"] = captcha
        return self._request("POST", url, data)

    def login_anonymous(self) -> dict:
        """匿名登录 (游客)"""
        url = f"{NETEASE_API_BASE}/weapi/register/anonimous"
        return self._request("POST", url, {})

    def get_login_status(self) -> dict:
        """获取登录状态"""
        url = f"{NETEASE_API_BASE}/weapi/w/nuser/account/get"
        return self._request("POST", url, {})

    def get_user_playlist(self, uid: int) -> dict:
        """获取用户歌单"""
        url = f"{NETEASE_API_BASE}/weapi/user/playlist"
        data = {"uid": uid, "limit": 100, "offset": 0, "includeVideo": True}
        return self._request("POST", url, data)

    # ==================== 辅助方法 ====================

    def _format_songs(self, songs: list) -> list:
        """格式化歌曲数据"""
        formatted = []
        for song in songs:
            artists = song.get("ar", song.get("artists", []))
            album = song.get("al", song.get("album", {}))
            formatted.append({
                "id": song.get("id"),
                "name": song.get("name", ""),
                "artists": [{"id": a.get("id"), "name": a.get("name", "")}
                            for a in artists],
                "artist_names": " / ".join(a.get("name", "") for a in artists),
                "album": {
                    "id": album.get("id"),
                    "name": album.get("name", ""),
                    "pic": album.get("picUrl", ""),
                },
                "duration": song.get("dt", song.get("duration", 0)),
                "fee": song.get("fee", 0),  # 0=免费 1=VIP 8=低价 4=购买
                "privilege": song.get("privilege", {}).get("fl", 0)
                if isinstance(song.get("privilege"), dict) else 0,
            })
        return formatted

    def get_random_hot_songs(self, count: int = 5) -> list:
        """从热歌榜随机选取歌曲"""
        result = self.get_hot_songs()
        if result.get("code") == 200:
            songs = result.get("songs", [])
            if len(songs) > count:
                return random.sample(songs, count)
            return songs
        return []
