package com.musichub.app;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.graphics.Color;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 设置全屏沉浸式
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0f0f0f"));
        window.setNavigationBarColor(Color.parseColor("#0f0f0f"));
        
        // 创建 WebView
        webView = new WebView(this);
        setContentView(webView);
        
        // 配置 WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDatabaseEnabled(true);
        
        // 设置 WebView 客户端
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        
        // 加载本地服务器或提示页面
        String html = "<!DOCTYPE html>" +
            "<html lang='zh-CN'>" +
            "<head>" +
            "<meta charset='UTF-8'>" +
            "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
            "<title>MusicHub</title>" +
            "<style>" +
            "body { background: #0f0f0f; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }" +
            ".container { text-align: center; max-width: 400px; }" +
            "h1 { color: #1db954; margin-bottom: 20px; }" +
            "p { color: #b3b3b3; line-height: 1.6; margin: 10px 0; }" +
            ".btn { background: #1db954; color: #000; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; margin: 10px; cursor: pointer; }" +
            ".input { background: #1a1a1a; border: 1px solid #333; color: #fff; padding: 12px; border-radius: 8px; width: 100%; max-width: 300px; margin: 10px 0; box-sizing: border-box; }" +
            ".info { background: #252525; padding: 15px; border-radius: 8px; margin: 20px 0; }" +
            "</style>" +
            "</head>" +
            "<body>" +
            "<div class='container'>" +
            "<h1>🎵 MusicHub</h1>" +
            "<p>音乐下载中心</p>" +
            "<div class='info'>" +
            "<p><strong>使用方法:</strong></p>" +
            "<p>1. 在电脑或服务器上启动 MusicHub 服务</p>" +
            "<p>2. 在下方输入服务器地址</p>" +
            "<p>3. 点击连接即可使用</p>" +
            "</div>" +
            "<input class='input' id='serverUrl' placeholder='http://192.168.1.100:8888' value=''>" +
            "<button class='btn' onclick='connect()'>连接服务器</button>" +
            "<p style='font-size: 12px; color: #666; margin-top: 30px;'>版本 1.0.0</p>" +
            "</div>" +
            "<script>" +
            "function connect() {" +
            "  var url = document.getElementById('serverUrl').value.trim();" +
            "  if (url) {" +
            "    window.location.href = url;" +
            "  } else {" +
            "    alert('请输入服务器地址');" +
            "  }" +
            "}" +
            "</script>" +
            "</body>" +
            "</html>";
        
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
