# MusicHub - 音乐下载中心 v2.0

> 多平台音乐搜索、在线播放、批量下载工具

[![GitHub release](https://img.shields.io/github/v/release/qwwqeras1145-bot/MusicHub)](https://github.com/qwwqeras1145-bot/MusicHub/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## 功能特性

- **在线搜索** — 搜索歌曲、歌手、专辑，支持搜索建议
- **在线播放** — 内置播放器，播放列表、进度控制、音量调节
- **单曲下载** — 一键下载，自动写入 ID3 标签（歌曲名、歌手、封面）
- **批量下载** — 从热歌榜随机选取并批量下载，支持自定义数量（1-200首）
- **热门榜单** — 热歌榜、新歌榜、原创榜
- **歌曲可用性检测** — 自动标记 VIP/免费/不可用歌曲
- **用户登录** — 管理员/普通用户双角色系统
- **管理后台** — 系统统计、用户管理、任务监控
- **多音质** — 标准 (128kbps) / 高音质 (320kbps) / 无损 (FLAC)
- **多平台** — 网页版 / Windows / macOS / Linux / Android / QQ 机器人插件

---

## 快速开始

### 网页版（推荐）

```bash
# 安装依赖
pip install -r requirements.txt

# 启动
python run.py
```

打开浏览器访问 `http://localhost:8888`

### 一键启动

| 平台 | 启动方式 |
|------|---------|
| Windows | 双击 `start.bat` |
| macOS / Linux | 运行 `bash start.sh` |
| 命令行版 | 运行 `bash start-cli.sh` 或 `python run.py --cli` |

### 服务器部署

```bash
curl -fsSL https://raw.githubusercontent.com/qwwqeras1145-bot/MusicHub/main/deploy.sh | bash
```

---

## 平台版本

### 🌐 网页版

在线搜索、播放、下载、批量下载，无需安装。

**启动**: `python run.py` → 访问 `http://localhost:8888`

### 🪟 Windows 桌面版

双击 `start.bat` 即可启动，自动打开浏览器。

**要求**: Windows 10+，已安装 [Python 3.10+](https://www.python.org/downloads/)

**打包为 EXE**:
```bash
pip install pyinstaller
python build/build.py
```
生成的 `dist/MusicHub.exe` 可独立运行，无需 Python 环境。

### 🍎 macOS 版

运行 `bash start.sh` 即可启动。

**要求**: macOS 12+，已安装 Python 3.10+（`brew install python3`）

### 🐧 Linux 图形版

运行 `bash start.sh` 启动，自动打开浏览器。

**要求**: Ubuntu 20.04+ / Debian 11+ / Fedora 36+，已安装 Python 3.10+

```bash
sudo apt install python3 python3-pip  # Ubuntu/Debian
sudo dnf install python3 python3-pip  # Fedora
```

**打包为可执行文件**:
```bash
pip install pyinstaller
python build/build.py
```

### 💻 Linux 命令行版

纯 CLI 模式，适合服务器和终端用户。

```bash
python run.py --cli
# 或
bash start-cli.sh
```

**命令一览**:
| 命令 | 说明 |
|------|------|
| `s <关键词>` | 搜索歌曲 |
| `hot` | 热歌榜 |
| `new` | 新歌榜 |
| `play <序号>` | 播放（显示链接）|
| `dl <序号>` | 下载歌曲 |
| `dlall` | 下载当前列表全部 |
| `random <数量>` | 随机下载热门 |
| `playlist <ID>` | 查看歌单 |
| `stats` | 下载统计 |
| `q` | 退出 |

### 🤖 Android 手机版

WebView 客户端，连接到 MusicHub 服务器使用。

**源码位置**: `android/` 目录

**编译 APK**:
```bash
cd android
# 需要安装 Android Studio 或命令行工具
./gradlew assembleDebug
```

APK 输出: `android/app/build/outputs/apk/debug/app-debug.apk`

**使用方式**:
1. 在电脑/服务器上启动 MusicHub 服务
2. 手机安装 APK 后打开应用
3. 输入服务器地址（如 `http://192.168.1.100:8888`）
4. 即可使用全部功能

### 🤖 AstrBot 插件（QQ 机器人）

适用于 AstrBot 框架的 QQ 机器人音乐插件。

**源码位置**: `plugins/astrbot/`

**安装**: 将 `plugins/astrbot/` 复制到 AstrBot 插件目录

**命令**:
- `/music search <关键词>` — 搜索歌曲
- `/music hot` — 热歌榜
- `/music download <ID>` — 获取下载链接
- `/music random [数量]` — 随机热门
- `/music playlist <ID>` — 查看歌单

### 🔌 NoneBot2 插件

适用于 NoneBot2 框架，兼容 Lagrange / LLOneBot / NapCat 等适配器。

**源码位置**: `plugins/nonebot/`

**安装**:
1. 将 `plugins/nonebot/` 放入 `bot/plugins/musichub/`
2. 安装依赖: `pip install requests pycryptodome mutagen`
3. 启动 NoneBot2

### 📱 Linna 版本

兼容 Linna 框架，复用 AstrBot 插件的核心逻辑。

**使用方式**: 参考 `plugins/astrbot/README.md`

---

## 管理后台

使用管理员账号登录后，点击导航栏的"管理后台"标签：

- **系统统计**: 下载数量、空间占用、在线用户数
- **用户管理**: 查看在线用户、踢出用户
- **任务监控**: 实时查看所有下载任务状态
- **修改密码**: 修改管理员密码

**默认管理员**: `admin` / `admin123`（请登录后立即修改）

---

## 项目结构

```
MusicHub/
├── run.py              # 主入口
├── config.py           # 全局配置
├── requirements.txt    # Python 依赖
├── start.bat           # Windows 启动脚本
├── start.sh            # macOS/Linux 启动脚本
├── start-cli.sh        # 命令行版启动脚本
├── deploy.sh           # 服务器一键部署脚本
├── core/               # 核心模块
│   ├── api.py          # 网易云 API 客户端
│   ├── crypto.py       # API 加密 (AES + RSA)
│   └── downloader.py   # 下载管理器
├── web/                # 网页版
│   ├── app.py          # Flask Web 服务器
│   └── static/         # 前端 (HTML/CSS/JS)
├── cli/                # 命令行版
│   └── main.py
├── android/            # Android 客户端
│   ├── app/            # Android 源码
│   ├── build.gradle
│   └── settings.gradle
├── plugins/            # QQ 机器人插件
│   ├── astrbot/        # AstrBot 插件
│   └── nonebot/        # NoneBot2 插件
├── build/              # 打包脚本
│   └── build.py        # PyInstaller 打包
└── docs/               # 文档
    └── usage.md
```

---

## API 接口

网页版启动后，以下 API 可用：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/search?q=关键词` | GET | 搜索歌曲 |
| `/api/song/url?ids=1` | GET | 播放链接 |
| `/api/song/check?id=1` | GET | 检查可用性 |
| `/api/song/lyric?id=1` | GET | 歌词 |
| `/api/hot/songs` | GET | 热歌榜 |
| `/api/hot/random?count=5` | GET | 随机热门 |
| `/api/download/song?id=1` | GET | 下载单曲 |
| `/api/download/random` | POST | 随机批量下载 |
| `/api/download/status` | GET | 下载任务状态 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/admin/stats` | GET | 管理后台统计 |
| `/api/admin/users` | GET | 在线用户列表 |

---

## 技术栈

- **后端**: Python 3.10+ / Flask
- **前端**: 原生 HTML/CSS/JavaScript
- **API**: 网易云音乐 weapi (AES + RSA 加密)
- **Android**: Java / WebView
- **打包**: PyInstaller
- **音频标签**: mutagen

---

## 注意事项

1. 本项目仅供学习交流使用，请勿用于商业用途
2. 部分歌曲需要 VIP 才能下载高音质，可通过网易云 Cookie 登录解锁
3. 下载的歌曲仅供个人学习欣赏，请支持正版音乐
4. 批量下载时请控制频率，避免触发限流

---

## 致谢

- [Music163bot-Go](https://github.com/XiaoMengXinX/Music163bot-Go) — 灵感来源
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) — API 参考
- [pyncm](https://github.com/mos9527/pyncm) — Python API 参考

## License

MIT License
