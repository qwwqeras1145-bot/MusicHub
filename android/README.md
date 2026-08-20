# MusicHub Android

安卓客户端，使用 WebView 连接到 MusicHub 服务器。

## 使用方法

1. 在电脑或服务器上启动 MusicHub:
```bash
cd MusicHub
pip install -r requirements.txt
python run.py
```

2. 在手机上安装本 APK

3. 打开应用，输入服务器地址（如 `http://192.168.1.100:8888`）

4. 点击"连接服务器"即可使用

## 编译方法

```bash
cd MusicHub-android
./gradlew assembleDebug
```

APK 输出位置: `app/build/outputs/apk/debug/app-debug.apk`
