# MusicHub AstrBot 插件

## 安装方法

### 方法一: 直接复制

1. 将整个 `plugins/astrbot/` 目录复制到 AstrBot 的插件目录中
2. 在 AstrBot 配置中启用插件

### 方法二: pip 安装核心依赖

```bash
pip install requests pycryptodome mutagen
```

## 配置

在 AstrBot 的 `config.yaml` 中添加:

```yaml
plugins:
  musichub:
    enabled: true
    config:
      cookie: ""  # 可选：网易云 MUSIC_U Cookie，提升音质和下载权限
```

## 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `/music search <关键词>` | 搜索歌曲 | `/music search 周杰伦` |
| `/music hot` | 查看热歌榜 | `/music hot` |
| `/music download <ID>` | 获取下载链接 | `/music download 1234567` |
| `/music random [数量]` | 随机热门歌曲 | `/music random 10` |
| `/music playlist <ID>` | 查看歌单 | `/music playlist 3778678` |
| `/music help` | 查看帮助 | `/music help` |

## 兼容的 QQ 机器人框架

本插件核心逻辑不依赖特定框架，可适配:
- AstrBot (主要支持)
- Koishi
- Yunzai-Bot
- 其他支持插件的框架

如需适配其他框架，只需将 `plugin.py` 中的 `MusicHubPlugin` 类接入对应框架的消息处理即可。
