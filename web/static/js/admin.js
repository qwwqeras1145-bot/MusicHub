/**
 * MusicHub v4.1 - Admin Panel JS
 */
(function () {
    'use strict';
    const API = '';
    function $(id) { return document.getElementById(id); }
    function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function showToast(msg, type='info') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    let currentUser = null;
    const loginPage = $('loginPage');
    const mainApp = $('mainApp');

    // ==================== Auth ====================
    async function checkAuth() {
        try {
            const r = await fetch(`${API}/api/auth/status`);
            const d = await r.json();
            if (d.logged_in) { currentUser = d.username; showMain(); }
            else showLogin();
        } catch { showLogin(); }
    }

    function showLogin() { loginPage.classList.remove('hidden'); mainApp.classList.add('hidden'); }
    function showMain() { loginPage.classList.add('hidden'); mainApp.classList.remove('hidden'); $('userInfo').textContent = currentUser; loadDashboard(); }

    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('loginSubmitBtn'); const errEl = $('loginError');
        btn.disabled = true; btn.textContent = '登录中...'; errEl.classList.add('hidden');
        try {
            const r = await fetch(`${API}/api/auth/login`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ username: $('loginUsername').value.trim(), password: $('loginPassword').value })
            });
            const d = await r.json();
            if (d.code === 200) { currentUser = d.username; showMain(); }
            else { errEl.textContent = d.msg || '登录失败'; errEl.classList.remove('hidden'); }
        } catch { errEl.textContent = '网络错误'; errEl.classList.remove('hidden'); }
        btn.disabled = false; btn.textContent = '登 录';
    });

    $('logoutBtn').addEventListener('click', async () => {
        await fetch(`${API}/api/auth/logout`, { method: 'POST' });
        currentUser = null; showLogin();
        $('loginUsername').value = ''; $('loginPassword').value = '';
    });

    // ==================== Sub Tabs ====================
    document.querySelectorAll('.admin-sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-sub-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.admin-sub-panel').forEach(p => p.classList.remove('active'));
            $('admin-' + tab.dataset.panel).classList.add('active');
            loadPanel(tab.dataset.panel);
        });
    });

    function loadPanel(p) {
        switch(p) {
            case 'dashboard': loadDashboard(); break;
            case 'ncm': loadNcmStatus(); break;
            case 'songs': loadSongs(); break;
            case 'accounts': loadAccounts(); break;
            case 'settings': loadSettings(); break;
        }
    }

    // ==================== Dashboard ====================
    $('refreshDashboard').addEventListener('click', loadDashboard);
    async function loadDashboard() {
        try {
            const r = await fetch(`${API}/api/admin/stats`);
            const d = await r.json();
            if (d.code !== 200) return;
            const s = d.server;
            $('serverStats').innerHTML = `
                <div class="stat-row"><span>系统</span><span>${s.platform}</span></div>
                <div class="stat-row"><span>Python</span><span>${s.python}</span></div>
                <div class="stat-row"><span>负载</span><span>${s.load_avg}</span></div>
                <div class="stat-row"><span>内存</span><span>${s.mem_used_mb}/${s.mem_total_mb} MB (${s.mem_usage_pct}%)</span></div>
                <div class="stat-row"><span>磁盘</span><span>${s.disk_used_gb}/${s.disk_total_gb} GB (${s.disk_usage_pct}%)</span></div>
                <div class="stat-row"><span>在线管理员</span><span>${d.online_admins}</span></div>`;
            $('dlStats').innerHTML = `
                <div class="stat-row"><span>已下载歌曲</span><span>${d.total_downloaded}</span></div>
                <div class="stat-row"><span>磁盘文件数</span><span>${d.downloads?.count||0}</span></div>
                <div class="stat-row"><span>占用空间</span><span>${d.downloads?.total_size_mb||0} MB</span></div>`;
        } catch {}
    }

    // ==================== NCM ====================
    let qrCheckInterval = null;

    async function loadNcmStatus() {
        try {
            const r = await fetch(`${API}/api/admin/ncm/status`);
            const d = await r.json();
            if (d.logged_in) {
                const statusColor = d.cookie_expired ? 'var(--danger)' : 'var(--accent)';
                const statusText = d.cookie_expired ? 'Cookie 已过期' : 'Cookie 有效';
                const vipBadge = d.vip ? '<span style="background:var(--warning);color:#000;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:8px">VIP</span>' : '';
                const avatarHtml = d.avatar ? `<img src="${escapeHtml(d.avatar)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">` : '';

                $('ncmCurrentStatus').innerHTML = `
                    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                        ${avatarHtml}
                        <div style="flex:1;min-width:200px">
                            <div style="display:flex;align-items:center;gap:8px">
                                <span style="color:${statusColor};font-size:16px">●</span>
                                <strong>${escapeHtml(d.username)}</strong>
                                ${vipBadge}
                            </div>
                            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">
                                <span style="color:${statusColor}">${statusText}</span>
                                · 登录方式: ${escapeHtml(d.login_method || '未知')}
                                ${d.captured_at ? ` · 获取于: ${d.captured_at}` : ''}
                                ${d.last_check ? ` · 最后检测: ${d.last_check}` : ''}
                            </div>
                            ${d.masked_cookie ? `<div style="color:var(--text-muted);font-size:11px;font-family:monospace;margin-top:2px">${escapeHtml(d.masked_cookie)}</div>` : ''}
                        </div>
                        <div style="display:flex;gap:8px">
                            <button id="ncmValidateBtn" class="btn-secondary" style="font-size:12px;padding:6px 12px">验证 Cookie</button>
                            <button id="ncmLogoutBtn" class="btn-danger" style="font-size:12px;padding:6px 12px">退出</button>
                        </div>
                    </div>`;

                $('ncmLogoutBtn').addEventListener('click', async () => {
                    await fetch(`${API}/api/admin/ncm/logout`, {method:'POST'});
                    loadNcmStatus(); showToast('已退出网易云', 'success');
                });
                $('ncmValidateBtn').addEventListener('click', async () => {
                    $('ncmValidateBtn').disabled = true;
                    $('ncmValidateBtn').textContent = '验证中...';
                    const r = await fetch(`${API}/api/admin/ncm/validate`, {method:'POST'});
                    const d = await r.json();
                    showToast(d.msg, d.code===200?'success':'error');
                    loadNcmStatus();
                });
            } else {
                const expiredHint = d.cookie_expired ? '<div style="color:var(--danger);font-size:12px;margin-top:4px">上次使用的 Cookie 已过期，请重新登录</div>' : '';
                $('ncmCurrentStatus').innerHTML = `
                    <div style="color:var(--text-muted)">
                        <span style="font-size:16px;color:var(--text-muted)">●</span>
                        未登录网易云音乐，登录后解锁 VIP 歌曲和高音质下载
                        ${expiredHint}
                    </div>`;
            }
        } catch {}
    }

    $('ncmCookieBtn').addEventListener('click', async () => {
        const cookie = $('ncmCookieInput').value.trim();
        if (!cookie) { showToast('请输入 Cookie', 'error'); return; }
        $('ncmCookieBtn').disabled = true;
        $('ncmCookieBtn').textContent = '验证中...';
        const r = await fetch(`${API}/api/admin/ncm/cookie`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { $('ncmCookieInput').value = ''; loadNcmStatus(); }
        $('ncmCookieBtn').disabled = false;
        $('ncmCookieBtn').textContent = '验证并登录';
    });

    $('ncmPhoneBtn').addEventListener('click', async () => {
        const phone = $('ncmPhone').value.trim(), password = $('ncmPwd').value, captcha = $('ncmCaptcha').value.trim();
        if (!phone) { showToast('请输入手机号', 'error'); return; }
        if (!password && !captcha) { showToast('请输入密码或验证码', 'error'); return; }
        $('ncmPhoneBtn').disabled = true;
        $('ncmPhoneBtn').textContent = '登录中...';
        const r = await fetch(`${API}/api/admin/ncm/phone`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password,captcha})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { $('ncmPhone').value=''; $('ncmPwd').value=''; $('ncmCaptcha').value=''; loadNcmStatus(); }
        $('ncmPhoneBtn').disabled = false;
        $('ncmPhoneBtn').textContent = '登录';
    });

    // SMS send button
    let smsCooldown = 0;
    $('ncmSmsBtn').addEventListener('click', async () => {
        const phone = $('ncmPhone').value.trim();
        if (!phone) { showToast('请先输入手机号', 'error'); return; }
        if (phone.length !== 11 || !/^\d+$/.test(phone)) { showToast('请输入正确的11位手机号', 'error'); return; }
        if (smsCooldown > 0) { showToast(`请等待 ${smsCooldown} 秒后重试`, 'error'); return; }
        
        $('ncmSmsBtn').disabled = true;
        $('ncmSmsBtn').textContent = '发送中...';
        const r = await fetch(`${API}/api/admin/ncm/sms/send`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        
        if (d.code === 200) {
            // Start cooldown (60 seconds)
            smsCooldown = 60;
            $('ncmSmsBtn').textContent = `${smsCooldown}s`;
            const timer = setInterval(() => {
                smsCooldown--;
                if (smsCooldown <= 0) {
                    clearInterval(timer);
                    $('ncmSmsBtn').disabled = false;
                    $('ncmSmsBtn').textContent = '发送验证码';
                } else {
                    $('ncmSmsBtn').textContent = `${smsCooldown}s`;
                }
            }, 1000);
        } else {
            $('ncmSmsBtn').disabled = false;
            $('ncmSmsBtn').textContent = '发送验证码';
        }
    });

    async function generateQR() {
        const container = $('qrContainer');
        container.innerHTML = '<div style="color:var(--text-muted);padding:40px">正在生成二维码...</div>';
        const r = await fetch(`${API}/api/admin/ncm/qr/create`);
        const d = await r.json();
        if (d.code !== 200) { showToast('生成失败', 'error'); container.innerHTML = '<button id="qrRetryBtn" class="btn-secondary">重试</button>'; $('qrRetryBtn').addEventListener('click', generateQR); return; }

        // Use self-rendered QR code (no third-party dependency)
        container.innerHTML = `<div id="qrCodeBox" style="display:inline-block;padding:12px;background:#fff;border-radius:8px"></div>`;
        renderQRCode($('qrCodeBox'), d.qr_url);

        $('qrStatusText').textContent = '等待扫码...';
        if (qrCheckInterval) clearInterval(qrCheckInterval);

        let pollCount = 0;
        const maxPolls = 90; // 3 minutes at 2s intervals
        qrCheckInterval = setInterval(async () => {
            pollCount++;
            if (pollCount > maxPolls) {
                clearInterval(qrCheckInterval);
                $('qrStatusText').textContent = '二维码已超时，请重新生成';
                container.innerHTML = '<button id="qrRetryBtn" class="btn-secondary">重新生成</button>';
                $('qrRetryBtn').addEventListener('click', generateQR);
                return;
            }
            try {
                const cr = await fetch(`${API}/api/admin/ncm/qr/check?key=${d.key}`);
                const cd = await cr.json();
                $('qrStatusText').textContent = cd.msg;
                if (cd.status === 'success') {
                    clearInterval(qrCheckInterval);
                    loadNcmStatus();
                    showToast(`扫码登录成功${cd.username ? '：' + cd.username : ''}`, 'success');
                }
                if (cd.status === 'expired') {
                    clearInterval(qrCheckInterval);
                    $('qrStatusText').innerHTML = `<span style="color:var(--danger)">${escapeHtml(cd.msg)}</span>`;
                    container.innerHTML = '<button id="qrRetryBtn" class="btn-secondary">重新生成</button>';
                    $('qrRetryBtn').addEventListener('click', generateQR);
                }
            } catch {}
        }, 2000);
    }

    // Simple QR code renderer using canvas
    function renderQRCode(container, data) {
        // Use a lightweight QR library loaded from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
        script.onload = () => {
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            QRCode.toCanvas(canvas, data, { width: 200, margin: 1, color: { dark: '#000', light: '#fff' } });
        };
        script.onerror = () => {
            // Fallback to img tag with API
            container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}" alt="QR" style="width:200px;height:200px">`;
        };
        document.head.appendChild(script);
    }

    $('qrGenBtn').addEventListener('click', generateQR);

    // ==================== Songs ====================
    let selectedSongs = new Set();
    $('refreshSongs').addEventListener('click', loadSongs);
    $('cleanupBtn').addEventListener('click', async () => {
        const r = await fetch(`${API}/api/admin/songs/cleanup`, {method:'POST'});
        const d = await r.json(); showToast(d.msg, 'success'); loadSongs();
    });

    async function loadSongs() {
        selectedSongs.clear();
        try {
            const r = await fetch(`${API}/api/admin/songs`);
            const d = await r.json();
            if (!d.songs?.length) { $('songListAdmin').innerHTML = '<p style="color:var(--text-muted)">暂无已下载歌曲</p>'; return; }
            $('songListAdmin').innerHTML = `<table><thead><tr><th><input type="checkbox" id="selectAllSongs"></th><th>歌曲</th><th>歌手</th><th>大小</th><th>下载时间</th><th>状态</th></tr></thead><tbody>` +
                d.songs.map(s => `<tr><td><input type="checkbox" class="song-check" data-path="${escapeHtml(s.path)}"></td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.artist)}</td><td>${s.size_mb} MB</td><td>${s.downloaded_at}</td><td>${s.exists?'<span style="color:var(--accent)">存在</span>':'<span style="color:var(--danger)">已删除</span>'}</td></tr>`).join('') +
                '</tbody></table>';
            $('selectAllSongs').addEventListener('change', e => {
                document.querySelectorAll('.song-check').forEach(c => { c.checked = e.target.checked; if(e.target.checked) selectedSongs.add(c.dataset.path); else selectedSongs.delete(c.dataset.path); });
            });
            document.querySelectorAll('.song-check').forEach(c => {
                c.addEventListener('change', e => { if(e.target.checked) selectedSongs.add(c.dataset.path); else selectedSongs.delete(c.dataset.path); });
            });
        } catch {}
    }

    $('deleteSelectedBtn').addEventListener('click', async () => {
        if (!selectedSongs.size) { showToast('请先选择歌曲', 'error'); return; }
        if (!confirm(`确认删除 ${selectedSongs.size} 首歌曲？`)) return;
        const r = await fetch(`${API}/api/admin/songs/delete`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:Array.from(selectedSongs)})});
        const d = await r.json(); showToast(d.msg, 'success'); loadSongs();
    });

    // ==================== Accounts ====================
    async function loadAccounts() {
        try {
            const r = await fetch(`${API}/api/admin/accounts`);
            const d = await r.json();
            $('adminListTable').innerHTML = `<table><thead><tr><th>用户名</th><th>创建时间</th><th>操作</th></tr></thead><tbody>` +
                d.accounts.map(a => `<tr><td>${escapeHtml(a.username)}${a.is_default?' <span style="color:var(--accent)">(默认)</span>':''}</td><td>${a.created}</td><td>${!a.is_default?`<button class="btn-danger btn-sm" data-del="${escapeHtml(a.username)}">删除</button>`:'-'}</td></tr>`).join('') +
                '</tbody></table>';
            document.querySelectorAll('[data-del]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`确认删除管理员 ${btn.dataset.del}？`)) return;
                    const r = await fetch(`${API}/api/admin/delete_account`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:btn.dataset.del})});
                    const d = await r.json(); showToast(d.msg, d.code===200?'success':'error'); loadAccounts();
                });
            });
        } catch {}
    }

    $('changePwdBtn').addEventListener('click', async () => {
        const o = $('oldPwd').value, n = $('newPwd').value;
        if (!o||!n) { showToast('请填写完整','error'); return; }
        const r = await fetch(`${API}/api/admin/change_password`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({old_password:o,new_password:n})});
        const d = await r.json(); showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { $('oldPwd').value=''; $('newPwd').value=''; }
    });

    $('changeNameBtn').addEventListener('click', async () => {
        const n = $('newUsername').value.trim(), p = $('confirmPwdForName').value;
        if (!n||!p) { showToast('请填写完整','error'); return; }
        const r = await fetch(`${API}/api/admin/change_username`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_username:n,password:p})});
        const d = await r.json(); showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { currentUser = d.new_username; $('userInfo').textContent = currentUser; loadAccounts(); }
    });

    $('createAdminBtn').addEventListener('click', async () => {
        const u = $('newAdminUser').value.trim(), p = $('newAdminPwd').value;
        if (!u||!p) { showToast('请填写完整','error'); return; }
        const r = await fetch(`${API}/api/admin/create_account`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
        const d = await r.json(); showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { $('newAdminUser').value=''; $('newAdminPwd').value=''; loadAccounts(); }
    });

    // ==================== Settings ====================
    async function loadSettings() {
        try {
            const r = await fetch(`${API}/api/admin/settings`);
            const d = await r.json();
            if (d.code===200) {
                $('settingCache').checked = d.settings.cache_downloads;
                $('settingAutoClean').checked = d.settings.auto_cleanup_enabled;
                $('settingCleanHours').value = d.settings.auto_cleanup_hours;
                $('settingAdminPath').value = d.settings.admin_path || '/aimdrd';
            }
        } catch {}
    }

    $('saveSettingsBtn').addEventListener('click', async () => {
        const adminPath = $('settingAdminPath').value.trim();
        if (!adminPath.startsWith('/')) { showToast('路径必须以 / 开头', 'error'); return; }
        const r = await fetch(`${API}/api/admin/settings/update`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                cache_downloads: $('settingCache').checked,
                auto_cleanup_enabled: $('settingAutoClean').checked,
                auto_cleanup_hours: parseInt($('settingCleanHours').value)||24,
                admin_path: adminPath
            })
        });
        const d = await r.json();
        showToast(d.msg, 'success');
        if (d.code === 200) {
            showToast('管理路径已更新，刷新页面后请使用新路径访问', 'success');
        }
    });

    // Init
    checkAuth();
})();
