/**
 * MusicHub Admin Panel - Complete Rewrite for v4.4+
 */
(function () {
    'use strict';

    const API = '';
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (t) => { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

    let currentUser = null;
    let qrCheckInterval = null;
    let smsCooldown = 0;
    let smsTimer = null;
    let selectedSongs = new Set();

    // ==================== Toast ====================
    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // ==================== Auth ====================
    async function checkAuth() {
        try {
            const r = await fetch(`${API}/api/auth/status`);
            const d = await r.json();
            if (d.logged_in) {
                currentUser = d.username;
                showMain();
            } else {
                showLogin();
            }
        } catch (e) {
            showLogin();
        }
    }

    function showLogin() {
        $('loginPage').classList.remove('hidden');
        $('mainApp').classList.add('hidden');
    }

    function showMain() {
        $('loginPage').classList.add('hidden');
        $('mainApp').classList.remove('hidden');
        loadDashboard();
    }

    // Login form
    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('loginSubmitBtn');
        const errorEl = $('loginError');
        btn.disabled = true;
        btn.textContent = '登录中...';
        errorEl.classList.add('hidden');

        try {
            const r = await fetch(`${API}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: $('loginUsername').value.trim(),
                    password: $('loginPassword').value
                })
            });
            const d = await r.json();
            if (d.code === 200) {
                currentUser = d.username;
                showMain();
            } else {
                errorEl.textContent = d.msg || '登录失败';
                errorEl.classList.remove('hidden');
            }
        } catch (err) {
            errorEl.textContent = '网络错误';
            errorEl.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.textContent = '登 录';
    });

    // Logout
    $('logoutBtn').addEventListener('click', async () => {
        await fetch(`${API}/api/auth/logout`, { method: 'POST' });
        currentUser = null;
        showLogin();
    });

    // ==================== Navigation ====================
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show corresponding panel
            const tabName = btn.dataset.tab;
            document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
            $(`tab-${tabName}`).classList.add('active');

            // Load data
            loadTabData(tabName);
        });
    });

    function loadTabData(tabName) {
        switch (tabName) {
            case 'dashboard': loadDashboard(); break;
            case 'ncm': loadNcmStatus(); break;
            case 'songs': loadSongs(); break;
            case 'accounts': loadAccounts(); break;
            case 'settings': loadSettings(); break;
        }
    }

    // ==================== Dashboard ====================
    async function loadDashboard() {
        try {
            const r = await fetch(`${API}/api/admin/stats`);
            const d = await r.json();
            if (d.code === 200) {
                $('serverCpu').textContent = `${d.cpu_usage || 0}%`;
                $('serverMemory').textContent = `${d.memory_usage || 0}%`;
                $('serverDisk').textContent = `${d.disk_usage || 0}%`;
                $('downloadCount').textContent = d.total_downloads || 0;
            }
        } catch (e) {
            console.error('Failed to load dashboard:', e);
        }
    }

    // ==================== NCM Login ====================
    // Login method tabs
    document.querySelectorAll('.login-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.login-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const method = btn.dataset.method;
            document.querySelectorAll('.login-form-panel').forEach(p => p.classList.remove('active'));
            $(`${method}Form`).classList.add('active');

            // Clear QR interval if switching away
            if (method !== 'qr' && qrCheckInterval) {
                clearInterval(qrCheckInterval);
                qrCheckInterval = null;
            }
        });
    });

    async function loadNcmStatus() {
        try {
            const r = await fetch(`${API}/api/admin/ncm/status`);
            const d = await r.json();

            if (d.logged_in) {
                const statusColor = d.cookie_expired ? 'var(--danger)' : 'var(--accent)';
                const statusText = d.cookie_expired ? 'Cookie 已过期' : 'Cookie 有效';
                const vipBadge = d.vip ? '<span class="vip-badge">VIP</span>' : '';
                const avatarHtml = d.avatar ? `<img src="${escapeHtml(d.avatar)}" class="ncm-avatar">` : '';

                $('ncmStatus').innerHTML = `
                    <div class="ncm-status-card">
                        ${avatarHtml}
                        <div class="ncm-status-info">
                            <div class="ncm-status-header">
                                <span class="ncm-username">${escapeHtml(d.username)}</span>
                                ${vipBadge}
                                <span class="ncm-status-dot" style="background:${statusColor}"></span>
                                <span class="ncm-status-text">${statusText}</span>
                            </div>
                            <div class="ncm-status-details">
                                <span>登录方式: ${escapeHtml(d.login_method || '未知')}</span>
                                ${d.masked_cookie ? `<span>Cookie: ${escapeHtml(d.masked_cookie)}</span>` : ''}
                                ${d.last_check ? `<span>最后检测: ${d.last_check}</span>` : ''}
                            </div>
                        </div>
                        <div class="ncm-status-actions">
                            <button id="validateCookieBtn" class="btn-secondary btn-sm">验证</button>
                            <button id="logoutNcmBtn" class="btn-danger btn-sm">退出</button>
                        </div>
                    </div>
                `;

                $('validateCookieBtn').addEventListener('click', async () => {
                    $('validateCookieBtn').disabled = true;
                    $('validateCookieBtn').textContent = '验证中...';
                    try {
                        const r = await fetch(`${API}/api/admin/ncm/validate`, { method: 'POST' });
                        const d = await r.json();
                        showToast(d.msg, d.code === 200 ? 'success' : 'error');
                        loadNcmStatus();
                    } catch (e) {
                        showToast('验证失败', 'error');
                    }
                    $('validateCookieBtn').disabled = false;
                    $('validateCookieBtn').textContent = '验证';
                });

                $('logoutNcmBtn').addEventListener('click', async () => {
                    if (!confirm('确定要退出网易云登录吗？')) return;
                    await fetch(`${API}/api/admin/ncm/logout`, { method: 'POST' });
                    showToast('已退出网易云', 'success');
                    loadNcmStatus();
                });
            } else {
                $('ncmStatus').innerHTML = '<div class="ncm-status-empty">未登录网易云音乐</div>';
            }
        } catch (e) {
            console.error('Failed to load NCM status:', e);
        }
    }

    // SMS Login
    $('sendSmsBtn').addEventListener('click', async () => {
        const phone = $('smsPhone').value.trim();
        if (!phone) {
            showToast('请输入手机号', 'error');
            return;
        }
        if (smsCooldown > 0) {
            showToast(`请等待 ${smsCooldown} 秒`, 'error');
            return;
        }

        $('sendSmsBtn').disabled = true;
        $('sendSmsBtn').textContent = '发送中...';

        try {
            const r = await fetch(`${API}/api/admin/ncm/sms/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast('验证码已发送', 'success');
                smsCooldown = 60;
                smsTimer = setInterval(() => {
                    smsCooldown--;
                    if (smsCooldown <= 0) {
                        clearInterval(smsTimer);
                        $('sendSmsBtn').disabled = false;
                        $('sendSmsBtn').textContent = '发送验证码';
                    } else {
                        $('sendSmsBtn').textContent = `${smsCooldown}s`;
                    }
                }, 1000);
            } else {
                showToast(d.msg || '发送失败', 'error');
                $('sendSmsBtn').disabled = false;
                $('sendSmsBtn').textContent = '发送验证码';
            }
        } catch (e) {
            showToast('网络错误', 'error');
            $('sendSmsBtn').disabled = false;
            $('sendSmsBtn').textContent = '发送验证码';
        }
    });

    $('smsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = $('smsPhone').value.trim();
        const captcha = $('smsCode').value.trim();

        if (!phone || !captcha) {
            showToast('请输入手机号和验证码', 'error');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '登录中...';

        try {
            const r = await fetch(`${API}/api/admin/ncm/phone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, captcha })
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast('登录成功', 'success');
                $('smsPhone').value = '';
                $('smsCode').value = '';
                loadNcmStatus();
            } else {
                showToast(d.msg || '登录失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }

        btn.disabled = false;
        btn.textContent = '登录';
    });

    // QR Login
    $('genQrBtn').addEventListener('click', async () => {
        $('genQrBtn').disabled = true;
        $('genQrBtn').textContent = '生成中...';
        $('qrHint').textContent = '生成中...';

        try {
            const r = await fetch(`${API}/api/admin/ncm/qr/create`);
            const d = await r.json();

            if (d.code === 200) {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(d.qr_url)}`;
                $('qrCode').innerHTML = `<img src="${qrUrl}" class="qr-img">`;
                $('qrHint').textContent = '请使用网易云音乐 App 扫码';
                $('genQrBtn').style.display = 'none';

                // Start polling
                qrCheckInterval = setInterval(async () => {
                    try {
                        const r = await fetch(`${API}/api/admin/ncm/qr/check?key=${d.key}`);
                        const cd = await r.json();

                        if (cd.status === 'success') {
                            clearInterval(qrCheckInterval);
                            qrCheckInterval = null;
                            showToast('扫码登录成功', 'success');
                            loadNcmStatus();
                        } else if (cd.status === 'scanned') {
                            $('qrHint').textContent = '已扫码，请在手机上确认';
                        } else if (cd.status === 'expired') {
                            clearInterval(qrCheckInterval);
                            qrCheckInterval = null;
                            $('qrHint').textContent = '二维码已过期，请重新生成';
                            $('genQrBtn').style.display = '';
                            $('genQrBtn').disabled = false;
                            $('genQrBtn').textContent = '生成二维码';
                        } else {
                            $('qrHint').textContent = cd.msg || '等待扫码...';
                        }
                    } catch (e) {
                        console.error('QR check failed:', e);
                    }
                }, 2000);
            } else {
                showToast(d.msg || '生成失败', 'error');
                $('qrHint').textContent = '生成失败，请重试';
            }
        } catch (e) {
            showToast('网络错误', 'error');
            $('qrHint').textContent = '网络错误，请重试';
        }

        $('genQrBtn').disabled = false;
        $('genQrBtn').textContent = '生成二维码';
    });

    // Cookie Login
    $('cookieForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const cookie = $('cookieInput').value.trim();

        if (!cookie) {
            showToast('请输入 Cookie', 'error');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '登录中...';

        try {
            const r = await fetch(`${API}/api/admin/ncm/cookie`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookie })
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast('登录成功', 'success');
                $('cookieInput').value = '';
                loadNcmStatus();
            } else {
                showToast(d.msg || '登录失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }

        btn.disabled = false;
        btn.textContent = '登录';
    });

    // ==================== Songs Management ====================
    $('refreshSongsBtn').addEventListener('click', loadSongs);

    async function loadSongs() {
        selectedSongs.clear();
        try {
            const r = await fetch(`${API}/api/admin/songs`);
            const d = await r.json();

            if (d.code === 200 && d.songs && d.songs.length > 0) {
                let html = `
                    <table class="songs-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" id="selectAll"></th>
                                <th>歌曲</th>
                                <th>艺术家</th>
                                <th>大小</th>
                                <th>下载时间</th>
                                <th>状态</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                d.songs.forEach(song => {
                    const statusClass = song.exists ? 'status-ok' : 'status-missing';
                    const statusText = song.exists ? '存在' : '已删除';
                    html += `
                        <tr>
                            <td><input type="checkbox" class="song-checkbox" data-path="${escapeHtml(song.path)}"></td>
                            <td>${escapeHtml(song.name)}</td>
                            <td>${escapeHtml(song.artist)}</td>
                            <td>${song.size_mb} MB</td>
                            <td>${song.downloaded_at}</td>
                            <td><span class="${statusClass}">${statusText}</span></td>
                        </tr>
                    `;
                });

                html += '</tbody></table>';
                $('songsList').innerHTML = html;

                // Select all checkbox
                $('selectAll').addEventListener('change', (e) => {
                    document.querySelectorAll('.song-checkbox').forEach(cb => {
                        cb.checked = e.target.checked;
                        if (e.target.checked) {
                            selectedSongs.add(cb.dataset.path);
                        } else {
                            selectedSongs.delete(cb.dataset.path);
                        }
                    });
                });

                // Individual checkboxes
                document.querySelectorAll('.song-checkbox').forEach(cb => {
                    cb.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            selectedSongs.add(cb.dataset.path);
                        } else {
                            selectedSongs.delete(cb.dataset.path);
                        }
                    });
                });
            } else {
                $('songsList').innerHTML = '<div class="empty-state">暂无歌曲</div>';
            }
        } catch (e) {
            console.error('Failed to load songs:', e);
            $('songsList').innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }

    $('deleteSelectedBtn').addEventListener('click', async () => {
        if (selectedSongs.size === 0) {
            showToast('请先选择歌曲', 'error');
            return;
        }

        if (!confirm(`确定要删除选中的 ${selectedSongs.size} 首歌曲吗？`)) {
            return;
        }

        try {
            const r = await fetch(`${API}/api/admin/songs/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: Array.from(selectedSongs) })
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast(`已删除 ${d.deleted} 首歌曲`, 'success');
                loadSongs();
            } else {
                showToast(d.msg || '删除失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
    });

    $('cleanupBtn').addEventListener('click', async () => {
        if (!confirm('确定要清理所有过期歌曲吗？')) {
            return;
        }

        try {
            const r = await fetch(`${API}/api/admin/songs/cleanup`, { method: 'POST' });
            const d = await r.json();

            if (d.code === 200) {
                showToast(`已清理 ${d.cleaned} 首歌曲`, 'success');
                loadSongs();
            } else {
                showToast(d.msg || '清理失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
    });

    // ==================== Accounts Management ====================
    async function loadAccounts() {
        try {
            const r = await fetch(`${API}/api/admin/accounts`);
            const d = await r.json();

            if (d.code === 200 && d.accounts && d.accounts.length > 0) {
                let html = '<ul class="admin-list">';
                d.accounts.forEach(acc => {
                    const badge = acc.is_default ? '<span class="badge">默认</span>' : '';
                    const deleteBtn = !acc.is_default ? `<button class="btn-danger btn-sm" data-username="${escapeHtml(acc.username)}">删除</button>` : '';
                    html += `
                        <li class="admin-list-item">
                            <span class="admin-username">${escapeHtml(acc.username)} ${badge}</span>
                            <span class="admin-created">创建于 ${acc.created}</span>
                            ${deleteBtn}
                        </li>
                    `;
                });
                html += '</ul>';
                $('adminList').innerHTML = html;

                // Delete buttons
                document.querySelectorAll('[data-username]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const username = btn.dataset.username;
                        if (!confirm(`确定要删除管理员 ${username} 吗？`)) return;

                        try {
                            const r = await fetch(`${API}/api/admin/delete_account`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ username })
                            });
                            const d = await r.json();

                            if (d.code === 200) {
                                showToast('删除成功', 'success');
                                loadAccounts();
                            } else {
                                showToast(d.msg || '删除失败', 'error');
                            }
                        } catch (e) {
                            showToast('网络错误', 'error');
                        }
                    });
                });
            } else {
                $('adminList').innerHTML = '<div class="empty-state">加载失败</div>';
            }
        } catch (e) {
            console.error('Failed to load accounts:', e);
        }
    }

    $('changePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPwd = $('oldPassword').value;
        const newPwd = $('newPassword').value;
        const confirmPwd = $('confirmPassword').value;

        if (!oldPwd || !newPwd || !confirmPwd) {
            showToast('请填写所有字段', 'error');
            return;
        }

        if (newPwd !== confirmPwd) {
            showToast('新密码不匹配', 'error');
            return;
        }

        if (newPwd.length < 6) {
            showToast('密码至少6位', 'error');
            return;
        }

        try {
            const r = await fetch(`${API}/api/admin/change_password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast('密码修改成功', 'success');
                $('oldPassword').value = '';
                $('newPassword').value = '';
                $('confirmPassword').value = '';
            } else {
                showToast(d.msg || '修改失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
    });

    $('addAdminForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('newAdminUsername').value.trim();
        const password = $('newAdminPassword').value;

        if (!username || !password) {
            showToast('请填写所有字段', 'error');
            return;
        }

        if (password.length < 6) {
            showToast('密码至少6位', 'error');
            return;
        }

        try {
            const r = await fetch(`${API}/api/admin/create_account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast('创建成功', 'success');
                $('newAdminUsername').value = '';
                $('newAdminPassword').value = '';
                loadAccounts();
            } else {
                showToast(d.msg || '创建失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
    });

    // ==================== Settings ====================
    async function loadSettings() {
        try {
            const r = await fetch(`${API}/api/admin/settings`);
            const d = await r.json();

            if (d.code === 200) {
                $('cacheMode').value = d.settings.cache_mode || 'server';
                $('cleanupHours').value = d.settings.cleanup_hours || 24;
                $('adminPath').value = d.settings.admin_path || '/admin';
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    $('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const settings = {
            cache_mode: $('cacheMode').value,
            cleanup_hours: parseInt($('cleanupHours').value) || 24,
            admin_path: $('adminPath').value.trim() || '/admin'
        };

        try {
            const r = await fetch(`${API}/api/admin/settings/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const d = await r.json();

            if (d.code === 200) {
                showToast('设置已保存', 'success');
            } else {
                showToast(d.msg || '保存失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
    });

    // ==================== Init ====================
    checkAuth();
})();
