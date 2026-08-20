# MusicHub NoneBot2 插件

## 安装方法

### 1. 安装 NoneBot2

```bash
pip install nonebot2 nonebot-adapter-onebot
```

### 2. 创建项目

```bash
nb create
# 或使用 scaffold
pip install nb-cli
nb create
```

### 3. 安装插件

将 `plugins/nonebot/plugin.py` 复制到你的 NoneBot2 项目:

```
your-bot/
├── bot.py
├── pyproject.toml
└── plugins/
    └── musichub/
        └── __init__.py   # 将 plugin.py 的内容放入
```

### 4. 安装核心依赖

```bash
pip install requests pycryptodome mutagen
```

### 5. 配置 pyproject.toml

```toml
[tool.nonebot]
plugins = ["plugins.musichub"]
```

## 支持的适配器

| 适配器 | 说明 |
|--------|------|
| Lagrange.OneBot | 推荐，性能最好 |
| LLOneBot | 基于 QQNT |
| NapCat | 轻量级 |
| go-cqhttp | 经典 (已归档) |

## 命令列表

| 命令 | 别名 | 说明 |
|------|------|------|
| `/music search <关键词>` | `/音乐 搜索`, `/点歌` | 搜索歌曲 |
| `/music hot` | `/音乐 热歌` | 热歌榜 |
| `/music download <ID>` | `/音乐 下载` | 下载歌曲 |
| `/music random [数量]` | `/音乐 随机` | 随机热门 |
| `/music playlist <ID>` | `/音乐 歌单` | 查看歌单 |

## Linna 框架兼容

Linna 框架的插件系统与 NoneBot2 类似，可以直接复用本插件的核心 API 逻辑。
将 `core/` 目录和 `plugins/nonebot/plugin.py` 中的消息处理逻辑适配到 Linna 的插件接口即可。
