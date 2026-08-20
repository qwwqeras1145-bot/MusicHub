"""MusicHub Web Server v4.0

Admin-only login, NCM integration, song management, auto-cleanup.
"""
import os, sys, json, time, hashlib, secrets, threading, shutil
from datetime import datetime
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory, send_file, redirect
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import NetEaseAPI, Downloader
from config import HOST, PORT, DOWNLOAD_DIR, QUALITY_MAP, NETEASE_API_BASE

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)
app.secret_key = secrets.token_hex(32)

# ==================== Data Persistence ====================
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
DOWNLOADS_FILE = os.path.join(DATA_DIR, "downloads.json")

def _load_json(path, default=None):
    if default is None: default = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except: return default

def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_config():
    default = {
        "admins": {
            "admin": {
                "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),
                "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "is_default": True
            }
        },
        "settings": {
            "cache_downloads": True,
            "auto_cleanup_hours": 24,
            "auto_cleanup_enabled": True,
            "admin_path": "/aimdrd",
            "storage_limit_gb": 2.0
        },
        "ncm": {
            "cookie": "",
            "logged_in": False,
            "username": "",
            "login_method": ""
        }
    }
    cfg = _load_json(CONFIG_FILE, default)
    # Ensure all keys exist
    for k, v in default.items():
        if k not in cfg: cfg[k] = v
        elif isinstance(v, dict):
            for sk, sv in v.items():
                if sk not in cfg[k]: cfg[k][sk] = sv
    return cfg

def save_config(cfg):
    _save_json(CONFIG_FILE, cfg)

def load_downloads():
    return _load_json(DOWNLOADS_FILE, [])

def save_downloads(dl):
    _save_json(DOWNLOADS_FILE, dl)

config = load_config()

# Global instances
api = NetEaseAPI()
downloader = Downloader(api)

# Sessions
sessions = {}

# Download tasks
download_tasks = {}
task_counter = 0

# ==================== Auto Cleanup ====================
def cleanup_loop():
    """Background thread: clean files older than configured hours."""
    while True:
        time.sleep(300)  # Check every 5 minutes
        try:
            cfg = load_config()
            if not cfg["settings"]["auto_cleanup_enabled"]:
                continue
            hours = cfg["settings"]["auto_cleanup_hours"]
            cutoff = time.time() - hours * 3600
            downloads = load_downloads()
            to_remove = [d for d in downloads if d.get("timestamp", 0) < cutoff]
            kept = [d for d in downloads if d.get("timestamp", 0) >= cutoff]
            for d in to_remove:
                path = d.get("path", "")
                if path and os.path.exists(path):
                    os.remove(path)
            if to_remove:
                save_downloads(kept)
        except Exception:
            pass

cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
cleanup_thread.start()

# ==================== Auth Helpers ====================
def _hash(password):
    return hashlib.sha256(password.encode()).hexdigest()

def get_current_admin():
    token = request.cookies.get("mh_token") or request.headers.get("X-Token")
    if token and token in sessions:
        s = sessions[token]
        if time.time() - s["login_time"] < 86400 * 7:
            return s["username"]
        del sessions[token]
    return None

def require_auth(f):
    @wraps(f)
    def decorated(*a, **kw):
        if not get_current_admin():
            if request.path.startswith("/api/"):
                return jsonify({"code": 401, "msg": "请先登录"}), 401
            return redirect("/")
        return f(*a, **kw)
    return decorated

# ==================== Auth API ====================
@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"code": -1, "msg": "请输入用户名和密码"})
    cfg = load_config()
    admin = cfg["admins"].get(username)
    if not admin or admin["password_hash"] != _hash(password):
        return jsonify({"code": -1, "msg": "用户名或密码错误"})
    token = secrets.token_hex(32)
    sessions[token] = {"username": username, "login_time": time.time()}
    resp = jsonify({"code": 200, "msg": "登录成功", "token": token, "username": username})
    resp.set_cookie("mh_token", token, max_age=86400*7, httponly=True)
    return resp

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    token = request.cookies.get("mh_token") or request.headers.get("X-Token")
    if token and token in sessions: del sessions[token]
    resp = jsonify({"code": 200, "msg": "已退出"})
    resp.delete_cookie("mh_token")
    return resp

@app.route("/api/auth/status")
def auth_status():
    user = get_current_admin()
    if user:
        return jsonify({"code": 200, "logged_in": True, "username": user})
    return jsonify({"code": 200, "logged_in": False})

# ==================== Admin: Account Management ====================
@app.route("/api/admin/accounts")
@require_auth
def admin_accounts():
    cfg = load_config()
    accounts = []
    for name, info in cfg["admins"].items():
        accounts.append({
            "username": name,
            "created": info.get("created", "-"),
            "is_default": info.get("is_default", False)
        })
    return jsonify({"code": 200, "accounts": accounts})

@app.route("/api/admin/change_password", methods=["POST"])
@require_auth
def admin_change_password():
    data = request.get_json() or {}
    old_pwd = data.get("old_password", "")
    new_pwd = data.get("new_password", "")
    if not old_pwd or not new_pwd:
        return jsonify({"code": -1, "msg": "请输入完整"})
    if len(new_pwd) < 6:
        return jsonify({"code": -1, "msg": "新密码至少6位"})
    username = get_current_admin()
    cfg = load_config()
    if cfg["admins"][username]["password_hash"] != _hash(old_pwd):
        return jsonify({"code": -1, "msg": "旧密码错误"})
    cfg["admins"][username]["password_hash"] = _hash(new_pwd)
    save_config(cfg)
    return jsonify({"code": 200, "msg": "密码修改成功"})

@app.route("/api/admin/change_username", methods=["POST"])
@require_auth
def admin_change_username():
    data = request.get_json() or {}
    new_name = data.get("new_username", "").strip()
    password = data.get("password", "")
    if not new_name or not password:
        return jsonify({"code": -1, "msg": "请输入完整"})
    if len(new_name) < 2:
        return jsonify({"code": -1, "msg": "用户名至少2个字符"})
    username = get_current_admin()
    cfg = load_config()
    if cfg["admins"][username]["password_hash"] != _hash(password):
        return jsonify({"code": -1, "msg": "密码错误"})
    if new_name in cfg["admins"]:
        return jsonify({"code": -1, "msg": "用户名已存在"})
    # Move account
    cfg["admins"][new_name] = cfg["admins"].pop(username)
    save_config(cfg)
    # Update session
    for token, s in sessions.items():
        if s["username"] == username:
            s["username"] = new_name
    return jsonify({"code": 200, "msg": "用户名修改成功", "new_username": new_name})

@app.route("/api/admin/create_account", methods=["POST"])
@require_auth
def admin_create_account():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"code": -1, "msg": "请输入完整"})
    if len(password) < 6:
        return jsonify({"code": -1, "msg": "密码至少6位"})
    cfg = load_config()
    if username in cfg["admins"]:
        return jsonify({"code": -1, "msg": "用户名已存在"})
    cfg["admins"][username] = {
        "password_hash": _hash(password),
        "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "is_default": False
    }
    save_config(cfg)
    return jsonify({"code": 200, "msg": f"管理员 {username} 创建成功"})

@app.route("/api/admin/delete_account", methods=["POST"])
@require_auth
def admin_delete_account():
    data = request.get_json() or {}
    username = data.get("username", "")
    if not username:
        return jsonify({"code": -1, "msg": "请指定用户名"})
    if username == get_current_admin():
        return jsonify({"code": -1, "msg": "不能删除自己"})
    cfg = load_config()
    if username not in cfg["admins"]:
        return jsonify({"code": -1, "msg": "用户不存在"})
    if cfg["admins"][username].get("is_default"):
        return jsonify({"code": -1, "msg": "不能删除默认管理员"})
    del cfg["admins"][username]
    save_config(cfg)
    # Remove sessions
    for token in list(sessions.keys()):
        if sessions[token]["username"] == username:
            del sessions[token]
    return jsonify({"code": 200, "msg": f"已删除 {username}"})

# ==================== Admin: Dashboard ====================
@app.route("/api/admin/stats")
@require_auth
def admin_stats():
    import platform
    dl = load_downloads()
    dl_stats = downloader.get_download_stats()
    # Server info
    mem = shutil.disk_usage("/")
    server_info = {
        "platform": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "disk_total_gb": round(mem.total / 1024**3, 1),
        "disk_used_gb": round(mem.used / 1024**3, 1),
        "disk_free_gb": round(mem.free / 1024**3, 1),
        "disk_usage_pct": round(mem.used / mem.total * 100, 1),
    }
    # Try to get CPU/Memory
    try:
        with open("/proc/loadavg") as f:
            load = f.read().split()
            server_info["load_avg"] = f"{load[0]} {load[1]} {load[2]}"
    except: server_info["load_avg"] = "N/A"
    try:
        with open("/proc/meminfo") as f:
            lines = f.readlines()
            total = int(lines[0].split()[1]) // 1024
            avail = int(lines[2].split()[1]) // 1024
            server_info["mem_total_mb"] = total
            server_info["mem_used_mb"] = total - avail
            server_info["mem_usage_pct"] = round((total - avail) / total * 100, 1)
    except:
        server_info["mem_total_mb"] = "N/A"
        server_info["mem_used_mb"] = "N/A"
        server_info["mem_usage_pct"] = "N/A"

    return jsonify({
        "code": 200,
        "downloads": dl_stats,
        "total_downloaded": len(dl),
        "server": server_info,
        "online_admins": len([s for s in sessions.values() if time.time()-s["login_time"] < 300]),
    })

# ==================== Admin: Song Management ====================
@app.route("/api/admin/songs")
@require_auth
def admin_songs():
    dl = load_downloads()
    songs = []
    for d in dl:
        songs.append({
            "id": d.get("song_id"),
            "name": d.get("name", ""),
            "artist": d.get("artist", ""),
            "size_mb": round(d.get("size", 0) / 1024 / 1024, 2) if d.get("size") else "-",
            "downloaded_at": d.get("downloaded_at", "-"),
            "path": d.get("path", ""),
            "exists": os.path.exists(d.get("path", ""))
        })
    return jsonify({"code": 200, "songs": songs, "total": len(songs)})

@app.route("/api/admin/songs/delete", methods=["POST"])
@require_auth
def admin_songs_delete():
    data = request.get_json() or {}
    paths = data.get("paths", [])
    if not paths:
        return jsonify({"code": -1, "msg": "请选择要删除的歌曲"})
    deleted = 0
    dl = load_downloads()
    new_dl = []
    for d in dl:
        if d.get("path") in paths:
            p = d.get("path", "")
            if p and os.path.exists(p):
                os.remove(p)
            deleted += 1
        else:
            new_dl.append(d)
    save_downloads(new_dl)
    return jsonify({"code": 200, "msg": f"已删除 {deleted} 首歌曲"})

@app.route("/api/admin/songs/cleanup", methods=["POST"])
@require_auth
def admin_songs_cleanup():
    """Manually trigger cleanup of old files."""
    cfg = load_config()
    hours = cfg["settings"]["auto_cleanup_hours"]
    cutoff = time.time() - hours * 3600
    dl = load_downloads()
    removed = 0
    kept = []
    for d in dl:
        if d.get("timestamp", 0) < cutoff:
            p = d.get("path", "")
            if p and os.path.exists(p):
                os.remove(p)
            removed += 1
        else:
            kept.append(d)
    save_downloads(kept)
    return jsonify({"code": 200, "msg": f"已清理 {removed} 首过期歌曲"})

# ==================== Admin: Settings (legacy) ====================
# Settings routes moved to line ~1164 area, removed duplicates here

# ==================== Admin: NCM Login ====================

def _parse_ncm_cookie(raw_cookie: str) -> str:
    """Parse and normalize NCM cookie string.
    Accepts: raw MUSIC_U value, or full cookie string with MUSIC_U and __csrf.
    Returns: normalized cookie string. If can't parse, returns raw string as-is.
    """
    if not raw_cookie:
        return ""
    raw_cookie = raw_cookie.strip()
    # If it looks like just a token value (no = sign), treat as MUSIC_U
    if "=" not in raw_cookie:
        return f"MUSIC_U={raw_cookie}"
    # Try to extract MUSIC_U and __csrf from full cookie string
    parts = {}
    for item in raw_cookie.split(";"):
        item = item.strip()
        if "=" in item:
            k, v = item.split("=", 1)
            k_lower = k.strip().lower()
            if k_lower == "music_u":
                parts["MUSIC_U"] = v.strip()
            elif k_lower in ("__csrf", "_csrf", "csrf"):
                parts["__csrf"] = v.strip()
            # Also keep other useful cookies
            elif k_lower in ("ntes_kaola_ad", "nmtid", "wnmcid", "os", "appver"):
                parts[k.strip()] = v.strip()
    if "MUSIC_U" in parts:
        result = f"MUSIC_U={parts['MUSIC_U']}"
        for k, v in parts.items():
            if k != "MUSIC_U":
                result += f"; {k}={v}"
        return result
    # If no MUSIC_U found, return the raw cookie string as-is
    # (the API might use different cookie names, or it's already a valid cookie)
    return raw_cookie

def _mask_cookie(cookie_str: str) -> str:
    """Mask cookie value for display, showing first 8 and last 4 chars."""
    if not cookie_str:
        return ""
    # Extract MUSIC_U value
    for item in cookie_str.split(";"):
        item = item.strip()
        if item.upper().startswith("MUSIC_U="):
            val = item.split("=", 1)[1]
            if len(val) > 16:
                return f"MUSIC_U={val[:8]}...{val[-4:]}"
            return f"MUSIC_U={val[:4]}...{val[-2:]}"
    return cookie_str[:20] + "..." if len(cookie_str) > 20 else cookie_str

def _validate_ncm_cookie(cookie_str: str) -> dict:
    """Validate NCM cookie by calling user info API.
    Returns: {"valid": bool, "username": str, "user_id": int, "vip": bool, "avatar": str}
    """
    if not cookie_str:
        return {"valid": False, "username": "", "user_id": 0, "vip": False, "avatar": ""}
    try:
        test_api = NetEaseAPI(cookie=cookie_str)
        status = test_api.get_login_status()
        if status.get("code") == 200 and status.get("profile"):
            profile = status["profile"]
            return {
                "valid": True,
                "username": profile.get("nickname", "未知"),
                "user_id": profile.get("userId", 0),
                "vip": profile.get("vipType", 0) > 0,
                "avatar": profile.get("avatarUrl", ""),
            }
        return {"valid": False, "username": "", "user_id": 0, "vip": False, "avatar": ""}
    except Exception:
        return {"valid": False, "username": "", "user_id": 0, "vip": False, "avatar": ""}

# Background thread: auto-check NCM cookie validity
def ncm_cookie_check_loop():
    """Check NCM cookie validity every 30 minutes using active API instance."""
    global api, downloader
    while True:
        time.sleep(1800)  # 30 minutes
        try:
            cfg = load_config()
            ncm = cfg.get("ncm", {})
            if not ncm.get("logged_in") or not ncm.get("cookie"):
                continue
            # Use the active global api (which has the cookie set)
            status = api.get_login_status()
            if status.get("code") == 200 and status.get("profile"):
                profile = status["profile"]
                cfg["ncm"]["cookie_expired"] = False
                cfg["ncm"]["username"] = profile.get("nickname", "未知")
                cfg["ncm"]["last_check"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cfg["ncm"]["vip"] = profile.get("vipType", 0) > 0
                save_config(cfg)
            else:
                # Cookie expired
                cfg["ncm"]["logged_in"] = False
                cfg["ncm"]["cookie_expired"] = True
                cfg["ncm"]["last_check"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                save_config(cfg)
                # Reset API to non-logged-in state
                api = NetEaseAPI()
                downloader = Downloader(api)
        except Exception:
            pass

ncm_check_thread = threading.Thread(target=ncm_cookie_check_loop, daemon=True)
ncm_check_thread.start()


@app.route("/api/admin/ncm/status")
@require_auth
def ncm_status():
    cfg = load_config()
    ncm = cfg.get("ncm", {})
    logged_in = ncm.get("logged_in", False)
    cookie_expired = ncm.get("cookie_expired", False)

    result = {
        "code": 200,
        "logged_in": logged_in,
        "username": ncm.get("username", ""),
        "login_method": ncm.get("login_method", ""),
        "cookie_expired": cookie_expired,
        "masked_cookie": _mask_cookie(ncm.get("cookie", "")) if logged_in else "",
        "captured_at": ncm.get("captured_at", ""),
        "last_check": ncm.get("last_check", ""),
        "user_id": ncm.get("user_id", 0),
        "vip": ncm.get("vip", False),
        "avatar": ncm.get("avatar", ""),
    }

    # If logged in but not checked recently, validate now using active API
    if logged_in and not cookie_expired and not ncm.get("last_check"):
        try:
            status = api.get_login_status()
            if status.get("code") == 200 and status.get("profile"):
                profile = status["profile"]
                result["username"] = profile.get("nickname", "未知")
                result["user_id"] = profile.get("userId", 0)
                result["vip"] = profile.get("vipType", 0) > 0
                result["avatar"] = profile.get("avatarUrl", "")
                result["last_check"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                # Save
                ncm["username"] = result["username"]
                ncm["user_id"] = result["user_id"]
                ncm["vip"] = result["vip"]
                ncm["avatar"] = result["avatar"]
                ncm["last_check"] = result["last_check"]
                save_config(cfg)
        except Exception:
            pass
        else:
            result["cookie_expired"] = True
            ncm["cookie_expired"] = True
            save_config(cfg)

    return jsonify(result)

@app.route("/api/admin/ncm/validate", methods=["POST"])
@require_auth
def ncm_validate():
    """Manually validate current NCM cookie using the active API instance."""
    global api, downloader
    cfg = load_config()
    ncm = cfg.get("ncm", {})
    cookie = ncm.get("cookie", "")
    
    # If no cookie but logged_in is True, something's wrong
    if not cookie:
        if ncm.get("logged_in"):
            return jsonify({"code": -1, "msg": "Cookie 数据丢失，请重新登录"})
        return jsonify({"code": -1, "msg": "未登录网易云"})
    
    # Use the ACTIVE global api instance (which was set during login)
    # instead of creating a new one - this preserves session state
    try:
        status = api.get_login_status()
        if status.get("code") == 200 and status.get("profile"):
            profile = status["profile"]
            ncm["username"] = profile.get("nickname", "未知")
            ncm["user_id"] = profile.get("userId", 0)
            ncm["vip"] = profile.get("vipType", 0) > 0
            ncm["avatar"] = profile.get("avatarUrl", "")
            ncm["cookie_expired"] = False
            ncm["last_check"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cfg["ncm"] = ncm
            save_config(cfg)
            return jsonify({
                "code": 200, "msg": "Cookie 有效",
                "valid": True,
                "username": ncm["username"],
                "user_id": ncm["user_id"],
                "vip": ncm["vip"],
                "avatar": ncm["avatar"],
            })
        else:
            ncm["cookie_expired"] = True
            ncm["last_check"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cfg["ncm"] = ncm
            save_config(cfg)
            return jsonify({"code": -1, "msg": "Cookie 已失效，请重新登录", "valid": False})
    except Exception as e:
        import sys
        print(f"[NCM Validate] Error: {e}", file=sys.stderr)
        return jsonify({"code": -1, "msg": f"验证出错: {str(e)}", "valid": False})

@app.route("/api/admin/ncm/cookie", methods=["POST"])
@require_auth
def ncm_cookie_login():
    global api, downloader
    data = request.get_json() or {}
    raw_cookie = data.get("cookie", "").strip()
    if not raw_cookie:
        return jsonify({"code": -1, "msg": "请输入 Cookie"})

    # Parse and normalize cookie
    cookie = _parse_ncm_cookie(raw_cookie)
    if not cookie or "MUSIC_U" not in cookie:
        return jsonify({"code": -1, "msg": "Cookie 格式错误，请确保包含 MUSIC_U"})

    # Apply cookie to API first
    api = NetEaseAPI(cookie=cookie)
    downloader = Downloader(api)

    # Validate using the active api instance (not a new one)
    try:
        status = api.get_login_status()
        if status.get("code") == 200 and status.get("profile"):
            profile = status["profile"]
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cfg = load_config()
            cfg["ncm"] = {
                "cookie": cookie,
                "logged_in": True,
                "cookie_expired": False,
                "username": profile.get("nickname", "未知"),
                "user_id": profile.get("userId", 0),
                "vip": profile.get("vipType", 0) > 0,
                "avatar": profile.get("avatarUrl", ""),
                "login_method": "cookie",
                "captured_at": now,
                "last_check": now,
            }
            save_config(cfg)
            return jsonify({
                "code": 200,
                "msg": "网易云登录成功",
                "username": cfg["ncm"]["username"],
                "vip": cfg["ncm"]["vip"],
            })
        else:
            # Reset api since validation failed
            api = NetEaseAPI()
            downloader = Downloader(api)
            return jsonify({"code": -1, "msg": "Cookie 无效或已过期，请重新获取"})
    except Exception as e:
        api = NetEaseAPI()
        downloader = Downloader(api)
        return jsonify({"code": -1, "msg": f"Cookie 验证出错: {str(e)}"})

@app.route("/api/admin/ncm/phone", methods=["POST"])
@require_auth
def ncm_phone_login():
    global api, downloader
    data = request.get_json() or {}
    phone = data.get("phone", "").strip()
    password = data.get("password", "").strip()
    captcha = data.get("captcha", "").strip()
    if not phone:
        return jsonify({"code": -1, "msg": "请输入手机号"})

    if captcha:
        # SMS captcha login
        result = api.login_cellphone(phone, captcha=captcha)
    elif password:
        # Password login
        result = api.login_cellphone(phone, password)
    else:
        return jsonify({"code": -1, "msg": "请输入密码或验证码"})

    if result.get("code") == 200:
        profile = result.get("profile", {})
        raw_cookie = result.get("cookie", "")
        # Debug: log what we got from the API
        import sys
        print(f"[NCM Phone Login] Raw cookie from API: {raw_cookie[:100] if raw_cookie else 'EMPTY'}...", file=sys.stderr)
        cookie = _parse_ncm_cookie(raw_cookie)
        print(f"[NCM Phone Login] Parsed cookie: {cookie[:100] if cookie else 'EMPTY'}...", file=sys.stderr)
        
        # If parsing returned empty, use raw cookie as-is
        if not cookie and raw_cookie:
            cookie = raw_cookie
            print(f"[NCM Phone Login] Using raw cookie as fallback", file=sys.stderr)
        
        api = NetEaseAPI(cookie=cookie)
        downloader = Downloader(api)

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cfg = load_config()
        cfg["ncm"] = {
            "cookie": cookie,
            "logged_in": True,
            "cookie_expired": False,
            "username": profile.get("nickname", "未知"),
            "user_id": profile.get("userId", 0),
            "vip": profile.get("vipType", 0) > 0,
            "avatar": profile.get("avatarUrl", ""),
            "login_method": "phone",
            "captured_at": now,
            "last_check": now,
        }
        save_config(cfg)
        return jsonify({
            "code": 200,
            "msg": "登录成功",
            "username": cfg["ncm"]["username"],
            "vip": cfg["ncm"]["vip"],
        })
    # Login failed - log the full response for debugging
    import sys
    print(f"[NCM Phone Login] Failed. Full API response: {json.dumps(result, ensure_ascii=False)}", file=sys.stderr)
    
    # Try to get meaningful error message
    error_code = result.get("code", -1)
    error_msg = result.get("msg") or result.get("message") or "登录失败"
    
    # Common error codes
    if error_code == 503:
        error_msg = "验证码错误，请重新获取"
    elif error_code == 502:
        error_msg = "账号或密码错误"
    elif error_code == 509:
        error_msg = "你可能操作过于频繁，请稍后再试"
    elif error_code == 501:
        error_msg = "用户不存在"
    
    return jsonify({"code": error_code, "msg": f"登录失败: {error_msg}"})


@app.route("/api/admin/ncm/sms/send", methods=["POST"])
@require_auth
def ncm_sms_send():
    """Send SMS verification code for NCM login."""
    data = request.get_json() or {}
    phone = data.get("phone", "").strip()
    if not phone:
        return jsonify({"code": -1, "msg": "请输入手机号"})
    if len(phone) != 11 or not phone.isdigit():
        return jsonify({"code": -1, "msg": "请输入正确的11位手机号"})

    url = f"{NETEASE_API_BASE}/weapi/sms/captcha/sent"
    result = api._request("POST", url, {
        "cellphone": phone,
        "ctcode": "86",
    })
    
    code = result.get("code", 0)
    if code == 200:
        return jsonify({"code": 200, "msg": "验证码已发送，请查看手机短信"})
    elif code == 505:
        return jsonify({"code": -1, "msg": "发送过于频繁，请稍后再试"})
    else:
        msg = result.get("message", result.get("msg", "发送失败"))
        return jsonify({"code": -1, "msg": f"验证码发送失败: {msg}"})

@app.route("/api/admin/ncm/qr/create")
@require_auth
def ncm_qr_create():
    """Generate QR code for NCM login."""
    url = f"{NETEASE_API_BASE}/weapi/login/qrcode/unikey"
    result = api._request("POST", url, {"type": 1})
    if result.get("code") == 200:
        key = result.get("unikey", "")
        qr_url = f"https://music.163.com/login?codekey={key}"
        return jsonify({"code": 200, "key": key, "qr_url": qr_url})
    return jsonify({"code": -1, "msg": "生成二维码失败"})

@app.route("/api/admin/ncm/qr/check")
@require_auth
def ncm_qr_check():
    """Check QR code scan status."""
    global api, downloader
    key = request.args.get("key", "")
    if not key:
        return jsonify({"code": -1, "msg": "缺少 key"})
    url = f"{NETEASE_API_BASE}/weapi/login/qrcode/client/login"
    result = api._request("POST", url, {"key": key, "type": 1})
    code = result.get("code", 0)
    msg = result.get("message", "")
    
    # Log for debugging
    print(f"[QR Check] code={code}, msg={msg}, keys={list(result.keys())}")
    
    # 801=等待扫码, 802=已扫码待确认, 803=登录成功, 800=过期
    if code == 803:
        # Login success - extract cookie from response
        cookie = result.get("cookie", "")
        if not cookie:
            # Try alternative cookie locations
            if "data" in result and isinstance(result["data"], dict):
                cookie = result["data"].get("cookie", "")
        print(f"[QR Check] Raw cookie: {cookie[:50] if cookie else 'EMPTY'}...")
        
        cookie = _parse_ncm_cookie(cookie)
        print(f"[QR Check] Parsed cookie: {cookie[:50] if cookie else 'EMPTY'}...")
        
        if not cookie or "MUSIC_U" not in cookie:
            return jsonify({"code": -1, "status": "error", 
                          "msg": "登录成功但未获取到有效 Cookie，请尝试其他方式登录"})

        api = NetEaseAPI(cookie=cookie)
        downloader = Downloader(api)

        # Validate and get user info
        validation = _validate_ncm_cookie(cookie)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        cfg = load_config()
        cfg["ncm"] = {
            "cookie": cookie,
            "logged_in": True,
            "cookie_expired": False,
            "username": validation.get("username", "扫码用户"),
            "user_id": validation.get("user_id", 0),
            "vip": validation.get("vip", False),
            "avatar": validation.get("avatar", ""),
            "login_method": "qr",
            "captured_at": now,
            "last_check": now,
        }
        save_config(cfg)
        return jsonify({"code": 200, "status": "success", "msg": "扫码登录成功",
                        "username": cfg["ncm"]["username"], "vip": cfg["ncm"]["vip"]})
    elif code == 802:
        return jsonify({"code": 200, "status": "scanned", "msg": "已扫码，请在手机上确认"})
    elif code == 801:
        return jsonify({"code": 200, "status": "waiting", "msg": "等待扫码"})
    elif code == 800:
        return jsonify({"code": 200, "status": "expired", "msg": "二维码已过期，请重新生成"})
    else:
        # Unknown code - treat as expired but include the actual message
        return jsonify({"code": 200, "status": "expired", 
                       "msg": f"二维码状态异常({code})，请重新生成"})

@app.route("/api/admin/ncm/logout", methods=["POST"])
@require_auth
def ncm_logout():
    global api, downloader
    api = NetEaseAPI()
    downloader = Downloader(api)
    cfg = load_config()
    cfg["ncm"] = {
        "cookie": "", "logged_in": False, "cookie_expired": False,
        "username": "", "user_id": 0, "vip": False, "avatar": "",
        "login_method": "", "captured_at": "", "last_check": "",
    }
    save_config(cfg)
    return jsonify({"code": 200, "msg": "已退出网易云"})

# ==================== Static Files ====================
@app.route("/")
def index():
    """Main page - accessible to everyone without login"""
    return send_from_directory("static", "index.html")

@app.route("/admin")
def admin_page_route():
    """Admin page redirect - check if path matches configured admin path"""
    cfg = load_config()
    admin_path = cfg.get("settings", {}).get("admin_path", "/aimdrd")
    # If accessing /admin directly, redirect to configured path
    return redirect(admin_path)

# Dynamic admin path route
def admin_path_handler(path=""):
    """Handler for the secret admin path"""
    return send_from_directory("static", "admin.html")

# Register the admin path route dynamically on startup
@app.before_request
def check_admin_path():
    """Register dynamic admin path route"""
    cfg = load_config()
    admin_path = cfg.get("settings", {}).get("admin_path", "/aimdrd").lstrip("/")
    if request.path == "/" + admin_path or request.path.startswith("/" + admin_path + "/"):
        return send_from_directory("static", "admin.html")

# ==================== Search API ====================
@app.route("/api/search")
def search():
    keyword = request.args.get("q", "").strip()
    limit = int(request.args.get("limit", 30))
    offset = int(request.args.get("offset", 0))
    search_type = int(request.args.get("type", 1))
    if not keyword:
        return jsonify({"code": -1, "msg": "请输入搜索关键词"})
    return jsonify(api.search(keyword, limit, offset, search_type))

@app.route("/api/search/suggest")
def search_suggest():
    keyword = request.args.get("q", "").strip()
    if not keyword: return jsonify({"code": -1, "msg": "请输入关键词"})
    return jsonify(api.search_suggest(keyword))

# ==================== Song API ====================
@app.route("/api/song/detail")
def song_detail():
    ids = request.args.get("ids", "")
    if not ids: return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    song_ids = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    return jsonify(api.get_song_detail(song_ids))

@app.route("/api/song/url")
def song_url():
    ids = request.args.get("ids", "")
    quality = int(request.args.get("br", 320000))
    if not ids: return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    song_ids = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    return jsonify(api.get_song_url(song_ids, quality))

@app.route("/api/song/check")
def song_check():
    song_id = request.args.get("id", "")
    if not song_id: return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    result = api.check_song_url(int(song_id))
    return jsonify({"code": 200, **result})

@app.route("/api/song/direct_url")
def song_direct_url():
    """Get direct NCM CDN URL for client-side download (no server cache)."""
    song_id = request.args.get("id", "")
    quality = request.args.get("quality", "exhigh")
    if not song_id: return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    br = QUALITY_MAP.get(quality, 320000)
    result = api.get_song_url([int(song_id)], br)
    if result.get("code") == 200 and result.get("urls"):
        url = result["urls"][0].get("url", "")
        ext = result["urls"][0].get("type", "mp3")
        if url:
            return jsonify({"code": 200, "url": url, "type": ext})
    # Fallback
    return jsonify({"code": 200, "url": api.get_song_url_simple(int(song_id)), "type": "mp3"})

@app.route("/api/song/lyric")
def song_lyric():
    song_id = request.args.get("id", "")
    if not song_id: return jsonify({"code": -1, "msg": "请提供歌曲 ID"})
    return jsonify(api.get_lyric(int(song_id)))

# ==================== Toplists ====================
@app.route("/api/toplist")
def toplist():
    return jsonify(api.get_toplist())

@app.route("/api/toplist/detail")
def toplist_detail():
    list_id = int(request.args.get("id", 3778678))
    return jsonify(api.get_toplist_detail(list_id))

@app.route("/api/hot/songs")
def hot_songs():
    return jsonify(api.get_hot_songs(int(request.args.get("count", 50))))

@app.route("/api/hot/random")
def hot_random():
    songs = api.get_random_hot_songs(int(request.args.get("count", 5)))
    return jsonify({"code": 200, "songs": songs, "count": len(songs)})

# ==================== Playlist ====================
@app.route("/api/playlist/detail")
def playlist_detail():
    pid = request.args.get("id", "")
    if not pid: return jsonify({"code": -1, "msg": "请提供歌单 ID"})
    return jsonify(api.get_playlist_detail(int(pid)))

# ==================== Download API ====================
@app.route("/api/download/song")
def download_song():
    song_id = request.args.get("id", "")
    quality = request.args.get("quality", "exhigh")
    if not song_id: return jsonify({"code": -1, "msg": "请提供歌曲 ID"})

    cfg = load_config()
    cache = cfg["settings"]["cache_downloads"]

    if not cache:
        # Direct mode: return NCM URL, client downloads directly
        br = QUALITY_MAP.get(quality, 320000)
        result = api.get_song_url([int(song_id)], br)
        if result.get("code") == 200 and result.get("urls"):
            url = result["urls"][0].get("url", "")
            if url:
                return jsonify({"code": 200, "direct": True, "url": url})
        return jsonify({"code": 200, "direct": True, "url": api.get_song_url_simple(int(song_id))})

    # Cache mode: download to server, then serve
    check = api.check_song_url(int(song_id))
    if not check["available"]:
        return jsonify({"code": -2, "msg": check.get("reason", "不可下载")})

    result = downloader.download_song(int(song_id), quality)
    if result["success"]:
        # Record download
        detail = api.get_song_detail([int(song_id)])
        song_info = detail["songs"][0] if detail.get("songs") else {}
        dl = load_downloads()
        dl.append({
            "song_id": int(song_id),
            "name": song_info.get("name", ""),
            "artist": song_info.get("artist_names", ""),
            "path": result["path"],
            "size": os.path.getsize(result["path"]) if os.path.exists(result["path"]) else 0,
            "timestamp": time.time(),
            "downloaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
        save_downloads(dl)
        return send_file(result["path"], as_attachment=True, download_name=os.path.basename(result["path"]))
    return jsonify({"code": -1, "msg": result.get("error", "下载失败")})

@app.route("/api/download/random", methods=["POST"])
def download_random():
    global task_counter
    data = request.get_json() or {}
    count = max(1, min(200, int(data.get("count", 5))))
    quality = data.get("quality", "exhigh")
    mode = data.get("mode", "cache")  # cache or direct
    
    songs = api.get_random_hot_songs(count)
    if not songs: return jsonify({"code": -1, "msg": "获取热歌榜失败"})
    playable = [s for s in songs if s.get("playable", True)] or songs
    
    # Direct mode: return URLs directly, client downloads from CDN
    if mode == "direct":
        urls = []
        for s in playable:
            song_id = s["id"]
            result = downloader.get_download_url(song_id, quality)
            if result.get("code") == 200 and result.get("url"):
                urls.append({
                    "id": song_id,
                    "name": s["name"],
                    "artist": s["artist_names"],
                    "url": result["url"],
                    "size": result.get("size", 0)
                })
        return jsonify({
            "code": 200,
            "mode": "direct",
            "count": len(urls),
            "songs": urls
        })
    
    # Cache mode: download to server with space checking
    cfg = load_config()
    storage_limit = cfg["settings"].get("storage_limit_gb", 2.0)
    
    # Check current disk usage
    try:
        usage = shutil.disk_usage(DOWNLOAD_DIR)
        used_gb = usage.used / (1024**3)
        if used_gb >= storage_limit:
            return jsonify({
                "code": -1, 
                "msg": f"服务器存储空间已达上限 ({used_gb:.2f}/{storage_limit} GB)"
            })
    except Exception as e:
        return jsonify({"code": -1, "msg": f"检查磁盘空间失败: {str(e)}"})
    
    song_ids = [s["id"] for s in playable]
    task_id = task_counter; task_counter += 1
    download_tasks[task_id] = {
        "id": task_id, "total": len(song_ids), "completed": 0,
        "success": 0, "failed": 0, "status": "running", "results": [],
        "songs": [{"id": s["id"], "name": s["name"], "artist": s["artist_names"]} for s in playable],
    }
    
    def _run():
        for sid in song_ids:
            # Check space before each download
            try:
                usage = shutil.disk_usage(DOWNLOAD_DIR)
                used_gb = usage.used / (1024**3)
                if used_gb >= storage_limit:
                    download_tasks[task_id]["results"].append({
                        "song_id": sid, "success": False,
                        "error": f"存储空间已达上限 ({used_gb:.2f}/{storage_limit} GB)",
                    })
                    download_tasks[task_id]["failed"] += 1
                    download_tasks[task_id]["completed"] += 1
                    continue
            except:
                pass
            
            result = downloader.download_song(sid, quality)
            download_tasks[task_id]["completed"] += 1
            if result["success"]:
                download_tasks[task_id]["success"] += 1
                # Record
                detail = api.get_song_detail([sid])
                si = detail["songs"][0] if detail.get("songs") else {}
                dl = load_downloads()
                dl.append({
                    "song_id": sid, "name": si.get("name",""), "artist": si.get("artist_names",""),
                    "path": result["path"],
                    "size": os.path.getsize(result["path"]) if os.path.exists(result["path"]) else 0,
                    "timestamp": time.time(),
                    "downloaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                })
                save_downloads(dl)
            else:
                download_tasks[task_id]["failed"] += 1
            download_tasks[task_id]["results"].append({
                "song_id": sid, "success": result["success"],
                "error": result.get("error", ""),
            })
        download_tasks[task_id]["status"] = "completed"
    
    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"code": 200, "task_id": task_id,
                    "songs": [{"id": s["id"], "name": s["name"], "artist": s["artist_names"]} for s in playable]})

@app.route("/api/download/status")
def download_status():
    task_id = request.args.get("task_id", "")
    if task_id == "": return jsonify({"code": 200, "tasks": list(download_tasks.values())})
    task = download_tasks.get(int(task_id))
    if not task: return jsonify({"code": -1, "msg": "任务不存在"})
    return jsonify({"code": 200, "task": task})

@app.route("/api/download/stats")
def download_stats():
    stats = downloader.get_download_stats()
    # Add disk space info
    try:
        usage = shutil.disk_usage(DOWNLOAD_DIR)
        stats["disk_total_gb"] = round(usage.total / (1024**3), 2)
        stats["disk_used_gb"] = round(usage.used / (1024**3), 2)
        stats["disk_free_gb"] = round(usage.free / (1024**3), 2)
    except:
        stats["disk_total_gb"] = 0
        stats["disk_used_gb"] = 0
        stats["disk_free_gb"] = 0
    return jsonify({"code": 200, **stats})

@app.route("/api/admin/system/disk")
@require_auth
def admin_disk_info():
    """Get disk space information"""
    try:
        usage = shutil.disk_usage(DOWNLOAD_DIR)
        return jsonify({
            "code": 200,
            "total_gb": round(usage.total / (1024**3), 2),
            "used_gb": round(usage.used / (1024**3), 2),
            "free_gb": round(usage.free / (1024**3), 2),
            "used_percent": round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0
        })
    except Exception as e:
        return jsonify({"code": -1, "msg": str(e)})

@app.route("/api/admin/settings", methods=["GET"])
@require_auth
def admin_get_settings():
    """Get current settings"""
    cfg = load_config()
    return jsonify({"code": 200, "settings": cfg["settings"]})

@app.route("/api/admin/settings", methods=["POST"])
@require_auth
def admin_update_settings():
    """Update settings"""
    data = request.get_json() or {}
    cfg = load_config()
    
    # Update settings
    if "cache_downloads" in data:
        cfg["settings"]["cache_downloads"] = bool(data["cache_downloads"])
    if "auto_cleanup_hours" in data:
        hours = int(data["auto_cleanup_hours"])
        if hours > 0:
            cfg["settings"]["auto_cleanup_hours"] = hours
    if "auto_cleanup_enabled" in data:
        cfg["settings"]["auto_cleanup_enabled"] = bool(data["auto_cleanup_enabled"])
    if "storage_limit_gb" in data:
        limit_gb = float(data["storage_limit_gb"])
        if limit_gb > 0:
            # Check if limit exceeds available disk space
            try:
                usage = shutil.disk_usage(DOWNLOAD_DIR)
                max_allowed = round(usage.total / (1024**3), 2)
                if limit_gb > max_allowed:
                    return jsonify({"code": -1, "msg": f"空间限制不能超过磁盘总容量 {max_allowed} GB"})
            except:
                pass
            cfg["settings"]["storage_limit_gb"] = limit_gb
    
    save_config(cfg)
    return jsonify({"code": 200, "msg": "设置已更新", "settings": cfg["settings"]})

# ==================== Startup ====================
def run_server(host=HOST, port=PORT, debug=False):
    global api, downloader
    print(f"""
╔═══════════════════════════════════════════════╗
║          MusicHub v4.0 音乐下载中心           ║
║                                               ║
║   网页版:  http://localhost:{port}               ║
║   默认账号: admin / admin123                  ║
║   (登录后请立即修改密码)                       ║
╚═══════════════════════════════════════════════╝
""")
    # Restore NCM cookie if saved
    cfg = load_config()
    if cfg["ncm"].get("cookie"):
        api = NetEaseAPI(cookie=cfg["ncm"]["cookie"])
        downloader = Downloader(api)
    app.run(host=host, port=port, debug=debug, threaded=True)

if __name__ == "__main__":
    run_server(debug=True)
