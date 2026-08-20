"""MusicHub Web 服务器 v2.0

基于 Flask 的 Web API + 静态文件服务。
新增: 用户登录、管理员后台、歌曲可用性检测。
"""
import os
import sys
import json
import time
import hashlib
import secrets
import threading
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory, send_file, Response
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import NetEaseAPI, Downloader
from config import HOST, PORT, DOWNLOAD_DIR, QUALITY_MAP

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)
app.secret_key = secrets.token_hex(32)

# 全局实例
api = NetEaseAPI()
downloader = Downloader(api)

# ==================== 用户认证 ====================

# 默认管理员账号 (首次使用请修改)
ADMIN_USERS = {
    "admin": {
        "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),
        "role": "admin",
        "created": "2026-01-01",
    }
}

# 会话存储
sessions = {}


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def get_current_user():
    """从请求中获取当前用户"""
    token = request.cookies.get("musichub_token") or request.headers.get("X-Token")
    if token and token in sessions:
        sess = sessions[token]
        if time.time() - sess["login_time"] < 86400 * 7:  # 7天有效
            return sess["username"]
        else:
            del sessions[token]
    return None


def require_login(f):
    """需要登录装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"code": 401, "msg": "请先登录"}), 401
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """需要管理员权限装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"code": 401, "msg": "请先登录"}), 401
        if user not in ADMIN_USERS or ADMIN_USERS[user]["role"] != "admin":
            return jsonify({"code": 403, "msg": "需要管理员权限"}), 403
        return f(*args, **kwargs)
    return decorated


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """用户登录"""
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"code": -1, "msg": "请输入用户名和密码"})

    # 检查管理员账号
    if username in ADMIN_USERS:
        if _hash_password(password) == ADMIN_USERS[username]["password_hash"]:
            token = secrets.token_hex(32)
            sessions[token] = {
                "username": username,
                "role": ADMIN_USERS[username]["role"],
                "login_time": time.time(),
            }
            resp = jsonify({
                "code": 200,
                "msg": "登录成功",
                "token": token,
                "username": username,
                "role": ADMIN_USERS[username]["role"],
            })
            resp.set_cookie("musichub_token", token, max_age=86400*7, httponly=True)
            return resp

    # 普通用户: 任意用户名密码均可登录 (游客模式)
    token = secrets.token_hex(32)
    sessions[token] = {
        "username": username,
        "role": "user",
        "login_time": time.time(),
    }
    resp = jsonify({
        "code": 200,
        "msg": "登录成功",
        "token": token,
        "username": username,
        "role": "user",
    })
    resp.set_cookie("musichub_token", token, max_age=86400*7, httponly=True)
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    """退出登录"""
    token = request.cookies.get("musichub_token") or request.headers.get("X-Token")
    if token and token in sessions:
        del sessions[token]
    resp = jsonify({"code": 200, "msg": "已退出"})
    resp.delete_cookie("musichub_token")
    return resp


@app.route("/api/auth/status")
def auth_status():
    """获取登录状态"""
    user = get_current_user()
    if user:
        role = ADMIN_USERS.get(user, {}).get("role", "user")
        return jsonify({"code": 200, "logged_in": True, "username": user, "role": role})
    return jsonify({"code": 200, "logged_in": False})


@app.route("/api/auth/change_password", methods=["POST"])
@require_admin
def auth_change_password():
    """管理员修改密码"""
    data = request.get_json() or {}
    old_pwd = data.get("old_password", "")
    new_pwd = data.get("new_password", "")
    username = get_current_user()

    if not old_pwd or not new_pwd:
        return jsonify({"code": -1, "msg": "请输入旧密码和新密码"})

    if _hash_password(old_pwd) != ADMIN_USERS[username]["password_hash"]:
        return jsonify({"code": -1, "msg": "旧密码错误"})

    if len(new_pwd) < 6:
        return jsonify({"code": -1, "msg": "新密码至少6位"})

    ADMIN_USERS[username]["password_hash"] = _hash_password(new_pwd)
    return jsonify({"code": 200, "msg": "密码修改成功"})


# ==================== 管理员后台 API ====================

@app.route("/api/admin/stats")
@require_admin
def admin_stats():
    """管理员: 系统统计"""
    dl_stats = downloader.get_download_stats()
    online_users = len([s for s in sessions.values()
                        if time.time() - s["login_time"] < 300])  # 5分钟内活跃
    return jsonify({
        "code": 200,
        "downloads": dl_stats,
        "online_users": online_users,
        "total_sessions": len(sessions),
        "server_uptime": time.time(),
    })


@app.route("/api/admin/users")
@require_admin
def admin_users():
    """管理员: 在线用户列表"""
    now = time.time()
    user_list = []
    for token, sess in sessions.items():
        user_list.append({
            "username": sess["username"],
            "role": sess["role"],
            "login_time": time.strftime("%Y-%m-%d %H:%M:%S",
                                        time.localtime(sess["login_time"])),
            "active": (now - sess["login_time"]) < 300,
        })
    return jsonify({"code": 200, "users": user_list})


@app.route("/api/admin/tasks")
@require_admin
def admin_tasks():
    """管理员: 下载任务列表"""
    return jsonify({"code": 200, "tasks": list(download_tasks.values())})


@app.route("/api/admin/kick_user", methods=["POST"])
@require_admin
def admin_kick_user():
    """管理员: 踢出用户"""
    data = request.get_json() or {}
    username = data.get("username", "")
    if not username:
        return jsonify({"code": -1, "msg": "请指定用户名"})
    if username == get_current_user():
        return jsonify({"code": -1, "msg": "不能踢出自己"})

    kicked = 0
    for token in list(sessions.keys()):
        if sessions[token]["username"] == username:
            del sessions[token]
            kicked += 1
    return jsonify({"code": 200, "msg": f"已踢出 {username} ({kicked} 个会话)"})


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


@app.route("/api/song/check")
def song_check():
    """检查歌曲是否可播放/下载"""
    song_id = request.args.get("id", "")
    if not song_id:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    result = api.check_song_url(int(song_id))
    return jsonify({"code": 200, **result})


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
    return jsonify(api.get_toplist())


@app.route("/api/toplist/detail")
def toplist_detail():
    list_id = int(request.args.get("id", 3778678))
    return jsonify(api.get_toplist_detail(list_id))


@app.route("/api/hot/songs")
def hot_songs():
    count = int(request.args.get("count", 50))
    return jsonify(api.get_hot_songs(count))


@app.route("/api/hot/random")
def hot_random():
    count = int(request.args.get("count", 5))
    songs = api.get_random_hot_songs(count)
    return jsonify({"code": 200, "songs": songs, "count": len(songs)})


# ==================== 歌单 ====================

@app.route("/api/playlist/detail")
def playlist_detail():
    playlist_id = request.args.get("id", "")
    if not playlist_id:
        return jsonify({"code": -1, "msg": "请提供歌单 ID"})
    return jsonify(api.get_playlist_detail(int(playlist_id)))


@app.route("/api/playlist/recommend")
def playlist_recommend():
    return jsonify(api.get_recommend_playlist())


# ==================== 下载 API ====================

download_tasks = {}
task_counter = 0


@app.route("/api/download/song")
def download_song():
    """下载单曲"""
    song_id = request.args.get("id", "")
    quality = request.args.get("quality", "exhigh")

    if not song_id:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID"})

    # 先检查歌曲可用性
    check = api.check_song_url(int(song_id))
    if not check["available"]:
        return jsonify({
            "code": -2,
            "msg": check.get("reason", "该歌曲不可下载"),
            "available": False,
        })

    result = downloader.download_song(int(song_id), quality)
    if result["success"]:
        filepath = result["path"]
        filename = os.path.basename(filepath)
        return send_file(filepath, as_attachment=True, download_name=filename)
    return jsonify({"code": -1, "msg": result.get("error", "下载失败")})


@app.route("/api/download/batch", methods=["POST"])
def download_batch():
    """批量下载"""
    global task_counter
    data = request.get_json() or {}
    song_ids = data.get("song_ids", [])
    quality = data.get("quality", "exhigh")

    if not song_ids:
        return jsonify({"code": -1, "msg": "请提供歌曲 ID 列表"})

    task_id = task_counter
    task_counter += 1
    download_tasks[task_id] = {
        "id": task_id, "total": len(song_ids),
        "completed": 0, "success": 0, "failed": 0,
        "status": "running", "results": [],
    }

    def _run():
        for sid in song_ids:
            result = downloader.download_song(sid, quality)
            download_tasks[task_id]["completed"] += 1
            if result["success"]:
                download_tasks[task_id]["success"] += 1
            else:
                download_tasks[task_id]["failed"] += 1
            download_tasks[task_id]["results"].append({
                "song_id": sid, "success": result["success"],
                "path": result.get("path", ""),
                "error": result.get("error", ""),
            })
        download_tasks[task_id]["status"] = "completed"

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"code": 200, "task_id": task_id})


@app.route("/api/download/random", methods=["POST"])
def download_random():
    """随机下载热门歌曲"""
    global task_counter
    data = request.get_json() or {}
    count = max(1, min(200, int(data.get("count", 5))))
    quality = data.get("quality", "exhigh")

    songs = api.get_random_hot_songs(count)
    if not songs:
        return jsonify({"code": -1, "msg": "获取热歌榜失败"})

    # 过滤出可播放的
    playable_songs = [s for s in songs if s.get("playable", True)]
    if not playable_songs:
        playable_songs = songs  # 如果全部不可播放，仍然尝试

    song_ids = [s["id"] for s in playable_songs]

    task_id = task_counter
    task_counter += 1
    download_tasks[task_id] = {
        "id": task_id, "total": len(song_ids),
        "completed": 0, "success": 0, "failed": 0,
        "status": "running", "results": [],
        "songs": [{"id": s["id"], "name": s["name"],
                    "artist": s["artist_names"]} for s in playable_songs],
    }

    def _run():
        for sid in song_ids:
            result = downloader.download_song(sid, quality)
            download_tasks[task_id]["completed"] += 1
            if result["success"]:
                download_tasks[task_id]["success"] += 1
            else:
                download_tasks[task_id]["failed"] += 1
            download_tasks[task_id]["results"].append({
                "song_id": sid, "success": result["success"],
                "path": result.get("path", ""),
                "error": result.get("error", ""),
            })
        download_tasks[task_id]["status"] = "completed"

    threading.Thread(target=_run, daemon=True).start()

    return jsonify({
        "code": 200, "task_id": task_id,
        "songs": [{"id": s["id"], "name": s["name"],
                    "artist": s["artist_names"]} for s in playable_songs],
    })


@app.route("/api/download/status")
def download_status():
    task_id = request.args.get("task_id", "")
    if task_id == "":
        return jsonify({"code": 200, "tasks": list(download_tasks.values())})
    task_id = int(task_id)
    task = download_tasks.get(task_id)
    if not task:
        return jsonify({"code": -1, "msg": "任务不存在"})
    return jsonify({"code": 200, "task": task})


@app.route("/api/download/stats")
def download_stats():
    return jsonify({"code": 200, **downloader.get_download_stats()})


# ==================== 用户 API ====================

@app.route("/api/user/login", methods=["POST"])
def user_login():
    """网易云音乐登录"""
    data = request.get_json() or {}
    phone = data.get("phone", "")
    password = data.get("password", "")
    cookie = data.get("cookie", "")

    if cookie:
        global api, downloader
        api = NetEaseAPI(cookie=cookie)
        downloader = Downloader(api)
        return jsonify({"code": 200, "msg": "Cookie 登录成功"})

    if not phone:
        return jsonify({"code": -1, "msg": "请输入手机号"})

    result = api.login_cellphone(phone, password)
    return jsonify(result)


@app.route("/api/user/status")
def user_status():
    return jsonify(api.get_login_status())


# ==================== 启动 ====================

def run_server(host=HOST, port=PORT, debug=False):
    print(f"""
╔═══════════════════════════════════════════════╗
║          MusicHub v2.0 音乐下载中心           ║
║                                               ║
║   网页版:  http://localhost:{port}               ║
║   管理后台: http://localhost:{port}/#admin        ║
║                                               ║
║   默认管理员: admin / admin123                 ║
║   (请登录后修改密码)                           ║
║                                               ║
║   按 Ctrl+C 停止服务器                        ║
╚═══════════════════════════════════════════════╝
""")
    app.run(host=host, port=port, debug=debug, threaded=True)


if __name__ == "__main__":
    run_server(debug=True)
