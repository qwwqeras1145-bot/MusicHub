"""MusicHub Web 服务器

基于 Flask 的 Web API + 静态文件服务。
"""
import os
import sys
import json
import threading
from flask import Flask, jsonify, request, send_from_directory, send_file, Response
from flask_cors import CORS

# 确保项目根目录在 path 中
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import NetEaseAPI, Downloader
from config import HOST, PORT, DOWNLOAD_DIR, QUALITY_MAP

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# 全局实例
api = NetEaseAPI()
downloader = Downloader(api)

# 下载状态追踪
download_tasks = {}
task_counter = 0


# ==================== 静态文件 ====================

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ==================== 搜索 API ====================

@app.route("/api/search")
def search():
    """搜索歌曲"""
    keyword = request.args.get("q", "").strip()
    limit = int(request.args.get("limit", 30))
    offset = int(request.args.get("offset", 0))
    search_type = int(request.args.get("type", 1))

    if not keyword:
        return jsonify({"code": -1, "msg": "请输入搜索关键词"})

    result = api.search(keyword, limit, offset, search_type)
    return jsonify(result)


@app.route("/api/search/suggest")
def search_suggest():
    """搜索建议"""
    keyword = request.args.get("q", "").strip()
    if not keyword:
        return jsonify({"code": -1, "msg": "请输入关键词"})
    result = api.search_suggest(keyword)
    return jsonify(result)


# ==================== 歌曲 API ====================

@app.route("/api/song/detail")
def song_detail():
    """获取歌曲详情"""
    ids = request.args.get("ids", "")
    if not ids:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    song_ids = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    result = api.get_song_detail(song_ids)
    return jsonify(result)


@app.route("/api/song/url")
def song_url():
    """获取歌曲播放链接"""
    ids = request.args.get("ids", "")
    quality = int(request.args.get("br", 320000))
    if not ids:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    song_ids = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    result = api.get_song_url(song_ids, quality)
    return jsonify(result)


@app.route("/api/song/lyric")
def song_lyric():
    """获取歌词"""
    song_id = request.args.get("id", "")
    if not song_id:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    result = api.get_lyric(int(song_id))
    return jsonify(result)


# ==================== 榜单 & 热门 ====================

@app.route("/api/toplist")
def toplist():
    """获取所有榜单"""
    result = api.get_toplist()
    return jsonify(result)


@app.route("/api/toplist/detail")
def toplist_detail():
    """获取榜单详情"""
    list_id = int(request.args.get("id", 3778678))
    result = api.get_toplist_detail(list_id)
    return jsonify(result)


@app.route("/api/hot/songs")
def hot_songs():
    """获取热歌榜"""
    count = int(request.args.get("count", 50))
    result = api.get_hot_songs(count)
    return jsonify(result)


@app.route("/api/hot/random")
def hot_random():
    """随机获取热门歌曲"""
    count = int(request.args.get("count", 5))
    songs = api.get_random_hot_songs(count)
    return jsonify({"code": 200, "songs": songs, "count": len(songs)})


# ==================== 歌单 ====================

@app.route("/api/playlist/detail")
def playlist_detail():
    """获取歌单详情"""
    playlist_id = request.args.get("id", "")
    if not playlist_id:
        return jsonify({"code": -1, "msg": "请提供歌单 ID"})
    result = api.get_playlist_detail(int(playlist_id))
    return jsonify(result)


@app.route("/api/playlist/recommend")
def playlist_recommend():
    """获取推荐歌单"""
    result = api.get_recommend_playlist()
    return jsonify(result)


# ==================== 下载 API ====================

@app.route("/api/download/song")
def download_song():
    """下载单曲 (返回文件)"""
    song_id = request.args.get("id", "")
    quality = request.args.get("quality", "exhigh")

    if not song_id:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID"})

    result = downloader.download_song(int(song_id), quality)
    if result["success"]:
        filepath = result["path"]
        filename = os.path.basename(filepath)
        return send_file(filepath, as_attachment=True,
                         download_name=filename)
    return jsonify({"code": -1, "msg": result.get("error", "下载失败")})


@app.route("/api/download/batch", methods=["POST"])
def download_batch():
    """批量下载 (异步任务)"""
    global task_counter
    data = request.get_json() or {}
    song_ids = data.get("song_ids", [])
    quality = data.get("quality", "exhigh")

    if not song_ids:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID 列表"})

    task_id = task_counter
    task_counter += 1
    download_tasks[task_id] = {
        "id": task_id,
        "total": len(song_ids),
        "completed": 0,
        "success": 0,
        "failed": 0,
        "status": "running",
        "results": [],
    }

    def _run():
        for i, sid in enumerate(song_ids):
            result = downloader.download_song(sid, quality)
            download_tasks[task_id]["completed"] += 1
            if result["success"]:
                download_tasks[task_id]["success"] += 1
            else:
                download_tasks[task_id]["failed"] += 1
            download_tasks[task_id]["results"].append({
                "song_id": sid,
                "success": result["success"],
                "path": result.get("path", ""),
                "error": result.get("error", ""),
            })
        download_tasks[task_id]["status"] = "completed"

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({"code": 200, "task_id": task_id})


@app.route("/api/download/random", methods=["POST"])
def download_random():
    """随机下载热门歌曲"""
    global task_counter
    data = request.get_json() or {}
    count = int(data.get("count", 5))
    quality = data.get("quality", "exhigh")

    if count < 1:
        count = 1
    if count > 200:
        count = 200

    # 先获取随机热门歌曲
    songs = api.get_random_hot_songs(count)
    if not songs:
        return jsonify({"code": -1, "msg": "获取热歌榜失败"})

    song_ids = [s["id"] for s in songs]

    task_id = task_counter
    task_counter += 1
    download_tasks[task_id] = {
        "id": task_id,
        "total": len(song_ids),
        "completed": 0,
        "success": 0,
        "failed": 0,
        "status": "running",
        "results": [],
        "songs": [{"id": s["id"], "name": s["name"],
                    "artist": s["artist_names"]} for s in songs],
    }

    def _run():
        for i, sid in enumerate(song_ids):
            result = downloader.download_song(sid, quality)
            download_tasks[task_id]["completed"] += 1
            if result["success"]:
                download_tasks[task_id]["success"] += 1
            else:
                download_tasks[task_id]["failed"] += 1
            download_tasks[task_id]["results"].append({
                "song_id": sid,
                "success": result["success"],
                "path": result.get("path", ""),
                "error": result.get("error", ""),
            })
        download_tasks[task_id]["status"] = "completed"

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({
        "code": 200,
        "task_id": task_id,
        "songs": [{"id": s["id"], "name": s["name"],
                    "artist": s["artist_names"]} for s in songs],
    })


@app.route("/api/download/status")
def download_status():
    """获取下载任务状态"""
    task_id = request.args.get("task_id", "")
    if task_id == "":
        # 返回所有任务
        return jsonify({"code": 200, "tasks": list(download_tasks.values())})

    task_id = int(task_id)
    task = download_tasks.get(task_id)
    if not task:
        return jsonify({"code": -1, "msg": "任务不存在"})
    return jsonify({"code": 200, "task": task})


@app.route("/api/download/stats")
def download_stats():
    """获取下载目录统计"""
    stats = downloader.get_download_stats()
    return jsonify({"code": 200, **stats})


# ==================== 用户 API ====================

@app.route("/api/user/login", methods=["POST"])
def user_login():
    """用户登录"""
    data = request.get_json() or {}
    phone = data.get("phone", "")
    password = data.get("password", "")

    if not phone:
        return jsonify({"code": -1, "msg": "请输入手机号"})

    result = api.login_cellphone(phone, password)
    return jsonify(result)


@app.route("/api/user/status")
def user_status():
    """获取登录状态"""
    result = api.get_login_status()
    return jsonify(result)


# ==================== 启动 ====================

def run_server(host=HOST, port=PORT, debug=False):
    """启动 Web 服务器"""
    print(f"""
╔═══════════════════════════════════════════╗
║          MusicHub 音乐下载中心             ║
║                                           ║
║   网页版: http://localhost:{port}             ║
║   API:    http://localhost:{port}/api/        ║
║                                           ║
║   按 Ctrl+C 停止服务器                     ║
╚═══════════════════════════════════════════╝
""")
    app.run(host=host, port=port, debug=debug, threaded=True)


if __name__ == "__main__":
    run_server(debug=True)
