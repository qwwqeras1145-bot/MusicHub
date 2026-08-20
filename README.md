# MusicHub - 音乐下载中心

> 一款多平台音乐搜索、在线播放、批量下载工具，支持网页版、命令行版、QQ 机器人插件版。

## 功能特性

- **在线搜索** - 搜索歌曲、歌手、专辑，支持搜索建议
- **在线播放** - 内置播放器，支持播放列表、进度控制、音量调节
- **单曲下载** - 一键下载，自动写入 ID3 标签（歌曲名、歌手、封面）
- **批量下载** - 从热歌榜随机选取并批量下载，支持自定义数量（1-200首）
- **热门榜单** - 热歌榜、新歌榜、原创榜
- **歌单查看** - 支持通过歌单 ID 查看歌单详情
- **多音质** - 标准 (128kbps) / 高音质 (320kbps) / 无损 (FLAC)
- **多平台** - 网页版 / Windows EXE / Linux GUI / Linux CLI / Android / QQ 机器人插件

## 快速开始

### 网页版（推荐）

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 启动
python run.py
```

打开浏览器访问 `http://localhost:8888`

### 命令行版

```bash
# 交互模式
python run.py --cli

# 直接搜索
python cli/main.py search "周杰伦"

# 查看热歌榜
python cli/main.py hot

# 随机下载 10 首热门歌曲
python cli/main.py random 10
```

### 自定义端口

```bash
python run.py --port 9000
```

## 多平台版本

| 平台 | 版本 | 说明 |
|------|------|------|
| 网页版 | `python run.py` | 在线搜索、播放、下载 |
| Windows EXE | `build/build.py` | 双击运行，自带网页界面 |
| Linux GUI | `build/build.py` | 带图形界面 |
| Linux CLI | `cli/main.py` | 纯命令行，适合服务器 |
| Android | 见 Release | APK 安装 |
| AstrBot | `plugins/astrbot/` | QQ/微信机器人插件 |
| NoneBot2 | `plugins/nonebot/` | 支持 Lagrange/LLOneBot 等 |
| Linna | 兼容 AstrBot 插件 | 参考 AstrBot 安装方式 |

## 打包 Windows EXE

```bash
# 安装 PyInstaller
pip install pyinstaller

# 打包
python build/build.py
```

生成的 EXE 文件在 `dist/MusicHub.exe`，双击即可运行。

## AstrBot 插件安装

1. 将 `plugins/astrbot/` 目录复制到 AstrBot 插件目录
2. 配置 `config.yaml`:

```yaml
plugins:
  musichub:
    enabled: true
    cookie: ""  # 可选：网易云音乐 Cookie，提升音质
```

3. 在 QQ 中使用命令:
   - `/music search 周杰伦` - 搜索
   - `/music hot` - 热歌榜
   - `/music download 1234567` - 下载（返回链接）
   - `/music random 10` - 随机热门

## NoneBot2 插件安装

1. 安装 NoneBot2 和适配器 (Lagrange / LLOneBot / NapCat)
2. 将 `plugins/nonebot/plugin.py` 放入 `bot/plugins/musichub/` 目录
3. 在 `pyproject.toml` 中添加插件路径
4. 启动 NoneBot2

支持命令:
- `/music search <关键词>`
- `/music hot`
- `/music download <ID>`
- `/music random [数量]`
- `/music playlist <ID>`

## 项目结构

```
MusicHub/
├── run.py                 # 主入口 (网页版/CLI)
├── config.py              # 全局配置
├── requirements.txt       # Python 依赖
├── core/                  # 核心模块
│   ├── api.py             # 网易云 API 客户端
│   ├── crypto.py          # API 加密
│   └── downloader.py      # 下载管理器
├── web/                   # 网页版
│   ├── app.py             # Flask Web 服务器
│   └── static/            # 前端静态文件
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js     # 应用逻辑
│           └── player.js  # 播放器
├── cli/                   # 命令行版
│   └── main.py
├── plugins/               # QQ 机器人插件
│   ├── astrbot/           # AstrBot 插件
│   └── nonebot/           # NoneBot2 插件
├── build/                 # 打包脚本
│   └── build.py           # PyInstaller 打包
└── docs/                  # 文档
    ├── usage.md
    └── api.md
```

## API 接口

网页版启动后，以下 API 可用:

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/search?q=关键词` | GET | 搜索歌曲 |
| `/api/search/suggest?q=关键词` | GET | 搜索建议 |
| `/api/song/detail?ids=1,2,3` | GET | 歌曲详情 |
| `/api/song/url?ids=1&br=320000` | GET | 播放链接 |
| `/api/song/lyric?id=1` | GET | 歌词 |
| `/api/toplist` | GET | 所有榜单 |
| `/api/toplist/detail?id=3778678` | GET | 榜单详情 |
| `/api/hot/songs?count=50` | GET | 热歌榜 |
| `/api/hot/random?count=5` | GET | 随机热门 |
| `/api/playlist/detail?id=123` | GET | 歌单详情 |
| `/api/download/song?id=1` | GET | 下载单曲 |
| `/api/download/batch` | POST | 批量下载 (异步) |
| `/api/download/random` | POST | 随机热门下载 |
| `/api/download/status?task_id=0` | GET | 下载任务状态 |
| `/api/download/stats` | GET | 下载统计 |

## 技术栈

- **后端**: Python 3.10+ / Flask
- **前端**: 原生 HTML/CSS/JavaScript (无框架依赖)
- **API**: 网易云音乐 weapi (AES + RSA 加密)
- **打包**: PyInstaller (跨平台)
- **音频标签**: mutagen

## 注意事项

1. 本项目仅供学习交流使用，请勿用于商业用途
2. 部分歌曲可能需要登录才能获取高音质
3. 下载的歌曲仅供个人学习欣赏，请支持正版音乐
4. 批量下载时请控制频率，避免触发限流

## 致谢

- [Music163bot-Go](https://github.com/XiaoMengXinX/Music163bot-Go) - 灵感来源
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) - API 参考
- [pyncm](https://github.com/mos9527/pyncm) - Python API 参考

## License

MIT License
