// MusicHub Admin JavaScript

const API = '';

class MusicHubAdmin {
    constructor() {
        this.currentTab = 'dashboard';
        this.currentLoginMethod = 'sms';
        this.selectedSongs = new Set();
        this.qrCheckInterval = null;
        this.smsCooldown = 0;
        this.smsTimer = null;
        
        this.init();
    }

    init() {
        this.setupAdminLogin();
        this.setupNavigation();
        this.setupLoginMethods();
        this.setupDashboard();
        this.setupNCM();
        this.setupSongs();
        this.setupAccounts();
        this.setupSettings();
        this.setupLogout();
        
        // Check if already logged in
        this.checkAuth();
    }

    async checkAuth() {
        try {
            const r = await fetch(`${API}/api/auth/status`);
            const d = await r.json();
            if (d.logged_in) {
                this.currentUser = d.username;
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('mainApp').classList.remove('hidden');
                document.getElementById('userInfo').textContent = d.username;
                this.loadDashboardData();
            }
        } catch (e) {
            // Not logged in, show login page (already visible by default)
        }
    }

    // ==================== Admin Login ====================
    setupAdminLogin() {
        const form = document.getElementById('loginForm');
        const btn = document.getElementById('loginSubmitBtn');
        const errorEl = document.getElementById('loginError');
        
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('loginUsername').value.trim();
                const password = document.getElementById('loginPassword').value;
                
                btn.disabled = true;
                btn.textContent = '登录中...';
                errorEl.classList.add('hidden');
                
                try {
                    const r = await fetch(`${API}/api/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const d = await r.json();
                    
                    if (d.code === 200) {
                        // Login successful, show main app
                        this.currentUser = d.username;
                        document.getElementById('loginPage').classList.add('hidden');
                        document.getElementById('mainApp').classList.remove('hidden');
                        document.getElementById('userInfo').textContent = d.username;
                        this.loadDashboardData();
                    } else {
                        errorEl.textContent = d.msg || '登录失败';
                        errorEl.classList.remove('hidden');
                    }
                } catch (err) {
                    errorEl.textContent = '网络错误，请重试';
                    errorEl.classList.remove('hidden');
                }
                
                btn.disabled = false;
                btn.textContent = '登 录';
            });
        }
    }

    // ==================== Navigation ====================
    setupNavigation() {
        document.querySelectorAll('.admin-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tab) {
        // Update navigation buttons
        document.querySelectorAll('.admin-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        // Update panels
        document.querySelectorAll('.admin-tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab-${tab}`);
        });
        
        this.currentTab = tab;
        
        // Load data for specific tabs
        if (tab === 'dashboard') this.loadDashboardData();
        if (tab === 'songs') this.loadSongsList();
        if (tab === 'accounts') this.loadAccountsList();
        if (tab === 'settings') this.loadSettingsData();
        if (tab === 'ncm') this.loadNCMStatus();
    }

    // ==================== Login Methods ====================
    setupLoginMethods() {
        document.querySelectorAll('.login-method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const method = btn.dataset.method;
                this.switchLoginMethod(method);
            });
        });
    }

    switchLoginMethod(method) {
        // Update buttons
        document.querySelectorAll('.login-method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });
        
        // Update forms
        document.querySelectorAll('.login-form-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${method}Form`);
        });
        
        this.currentLoginMethod = method;
    }

    // ==================== Dashboard ====================
    setupDashboard() {
        // No special setup needed for dashboard
    }

    async loadDashboardData() {
        try {
            const response = await fetch('/api/admin/stats');
            const data = await response.json();
            
            if (data.code === 200) {
                document.getElementById('serverCpu').textContent = `${data.cpu_usage || 0}%`;
                document.getElementById('serverMemory').textContent = `${data.memory_usage || 0}%`;
                document.getElementById('serverDisk').textContent = `${data.disk_usage || 0}%`;
                document.getElementById('downloadCount').textContent = data.total_downloads || 0;
            }
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    }

    // ==================== NCM ====================
    setupNCM() {
        // SMS Form
        document.getElementById('smsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.loginWithSMS();
        });
        
        document.getElementById('sendSmsBtn').addEventListener('click', () => {
            this.sendSMSCode();
        });
        
        // QR Form
        document.getElementById('genQrBtn').addEventListener('click', () => {
            this.generateQRCode();
        });
        
        // Cookie Form
        document.getElementById('cookieForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.loginWithCookie();
        });
    }

    async loadNCMStatus() {
        try {
            const response = await fetch('/api/admin/ncm/status');
            const data = await response.json();
            
            const statusDiv = document.getElementById('ncmStatus');
            
            if (data.code === 200 && data.logged_in) {
                const vipBadge = data.vip ? '<span class="vip-badge">VIP</span>' : '';
                const avatar = data.avatar ? `<img src="${data.avatar}" class="ncm-avatar" alt="avatar">` : '';
                
                statusDiv.innerHTML = `
                    <div class="ncm-status-card">
                        ${avatar}
                        <div class="ncm-status-info">
                            <div class="ncm-status-header">
                                <span class="ncm-username">${this.escapeHtml(data.username)}</span>
                                ${vipBadge}
                            </div>
                            <div class="ncm-status-details">
                                <span>登录方式: ${this.escapeHtml(data.login_method || 'unknown')}</span>
                                <span>Cookie: ${this.escapeHtml(data.masked_cookie || '')}</span>
                                <span>最后检查: ${this.escapeHtml(data.last_check || '')}</span>
                            </div>
                        </div>
                        <div class="ncm-status-actions">
                            <button class="btn-secondary btn-sm" id="validateCookieBtn">验证</button>
                            <button class="btn-danger btn-sm" id="logoutNcmBtn">退出</button>
                        </div>
                    </div>
                `;
                
                // Setup action buttons
                document.getElementById('validateCookieBtn').addEventListener('click', () => {
                    this.validateCookie();
                });
                document.getElementById('logoutNcmBtn').addEventListener('click', () => {
                    this.logoutNCM();
                });
            } else {
                statusDiv.innerHTML = '<div class="ncm-status-empty">未登录网易云音乐</div>';
            }
        } catch (error) {
            console.error('Failed to load NCM status:', error);
        }
    }

    async sendSMSCode() {
        const phone = document.getElementById('smsPhone').value.trim();
        
        if (!phone) {
            this.showToast('请输入手机号', 'error');
            return;
        }
        
        if (this.smsCooldown > 0) {
            this.showToast(`请等待 ${this.smsCooldown} 秒后再试`, 'error');
            return;
        }
        
        const btn = document.getElementById('sendSmsBtn');
        btn.disabled = true;
        btn.textContent = '发送中...';
        
        try {
            const response = await fetch('/api/admin/ncm/sms/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('验证码已发送', 'success');
                this.startSMSCooldown();
            } else {
                this.showToast(data.msg || '发送失败', 'error');
                btn.disabled = false;
                btn.textContent = '发送验证码';
            }
        } catch (error) {
            this.showToast('发送失败', 'error');
            btn.disabled = false;
            btn.textContent = '发送验证码';
        }
    }

    startSMSCooldown() {
        this.smsCooldown = 60;
        const btn = document.getElementById('sendSmsBtn');
        
        this.smsTimer = setInterval(() => {
            this.smsCooldown--;
            btn.textContent = `${this.smsCooldown}s`;
            
            if (this.smsCooldown <= 0) {
                clearInterval(this.smsTimer);
                btn.disabled = false;
                btn.textContent = '发送验证码';
            }
        }, 1000);
    }

    async loginWithSMS() {
        const phone = document.getElementById('smsPhone').value.trim();
        const captcha = document.getElementById('smsCode').value.trim();
        
        if (!phone || !captcha) {
            this.showToast('请输入手机号和验证码', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/ncm/phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, captcha })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('登录成功', 'success');
                document.getElementById('smsForm').reset();
                this.loadNCMStatus();
            } else {
                this.showToast(data.msg || '登录失败', 'error');
            }
        } catch (error) {
            this.showToast('登录失败', 'error');
        }
    }

    async generateQRCode() {
        const btn = document.getElementById('genQrBtn');
        const qrCode = document.getElementById('qrCode');
        const qrHint = document.getElementById('qrHint');
        
        btn.disabled = true;
        btn.textContent = '生成中...';
        qrHint.textContent = '正在生成二维码...';
        
        try {
            const response = await fetch('/api/admin/ncm/qr/create');
            const data = await response.json();
            
            if (data.code === 200) {
                const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qr_url)}`;
                qrCode.innerHTML = `<img src="${qrImgUrl}" class="qr-img" alt="QR Code">`;
                qrHint.textContent = '请使用网易云音乐 App 扫码';
                btn.style.display = 'none';
                
                this.startQRCheck(data.key);
            } else {
                qrHint.textContent = '生成失败，请重试';
                btn.disabled = false;
                btn.textContent = '生成二维码';
            }
        } catch (error) {
            qrHint.textContent = '生成失败，请重试';
            btn.disabled = false;
            btn.textContent = '生成二维码';
        }
    }

    startQRCheck(key) {
        const qrHint = document.getElementById('qrHint');
        const btn = document.getElementById('genQrBtn');
        
        this.qrCheckInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/admin/ncm/qr/check?key=${key}`);
                const data = await response.json();
                
                if (data.status === 'success') {
                    clearInterval(this.qrCheckInterval);
                    this.showToast('扫码登录成功', 'success');
                    this.loadNCMStatus();
                    btn.style.display = '';
                    btn.disabled = false;
                    btn.textContent = '生成二维码';
                } else if (data.status === 'scanned') {
                    qrHint.textContent = '已扫码，请在手机上确认';
                } else if (data.status === 'expired') {
                    clearInterval(this.qrCheckInterval);
                    qrHint.textContent = '二维码已过期，请重新生成';
                    btn.style.display = '';
                    btn.disabled = false;
                    btn.textContent = '生成二维码';
                } else {
                    qrHint.textContent = '等待扫码...';
                }
            } catch (error) {
                console.error('QR check failed:', error);
            }
        }, 2000);
    }

    async loginWithCookie() {
        const cookie = document.getElementById('cookieInput').value.trim();
        
        if (!cookie) {
            this.showToast('请输入 Cookie', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/ncm/cookie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookie })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('登录成功', 'success');
                document.getElementById('cookieForm').reset();
                this.loadNCMStatus();
            } else {
                this.showToast(data.msg || '登录失败', 'error');
            }
        } catch (error) {
            this.showToast('登录失败', 'error');
        }
    }

    async validateCookie() {
        try {
            const response = await fetch('/api/admin/ncm/validate', { method: 'POST' });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('Cookie 有效', 'success');
                this.loadNCMStatus();
            } else {
                this.showToast(data.msg || 'Cookie 无效', 'error');
            }
        } catch (error) {
            this.showToast('验证失败', 'error');
        }
    }

    async logoutNCM() {
        if (!confirm('确定要退出网易云登录吗？')) return;
        
        try {
            const response = await fetch('/api/admin/ncm/logout', { method: 'POST' });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('已退出网易云', 'success');
                this.loadNCMStatus();
            } else {
                this.showToast(data.msg || '退出失败', 'error');
            }
        } catch (error) {
            this.showToast('退出失败', 'error');
        }
    }

    // ==================== Songs ====================
    setupSongs() {
        document.getElementById('refreshSongsBtn').addEventListener('click', () => {
            this.loadSongsList();
        });
        
        document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
            this.deleteSelectedSongs();
        });
        
        document.getElementById('cleanupBtn').addEventListener('click', () => {
            this.cleanupSongs();
        });
    }

    async loadSongsList() {
        this.selectedSongs.clear();
        
        try {
            const response = await fetch('/api/admin/songs');
            const data = await response.json();
            
            const songsList = document.getElementById('songsList');
            
            if (data.code === 200 && data.songs && data.songs.length > 0) {
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
                
                data.songs.forEach(song => {
                    const statusClass = song.exists ? 'status-ok' : 'status-missing';
                    const statusText = song.exists ? '存在' : '已删除';
                    html += `
                        <tr>
                            <td><input type="checkbox" class="song-checkbox" data-path="${this.escapeHtml(song.path)}"></td>
                            <td>${this.escapeHtml(song.name)}</td>
                            <td>${this.escapeHtml(song.artist)}</td>
                            <td>${song.size_mb} MB</td>
                            <td>${song.downloaded_at}</td>
                            <td><span class="${statusClass}">${statusText}</span></td>
                        </tr>
                    `;
                });
                
                html += '</tbody></table>';
                songsList.innerHTML = html;
                
                this.setupSongCheckboxes();
            } else {
                songsList.innerHTML = '<div class="empty-state">暂无歌曲</div>';
            }
        } catch (error) {
            console.error('Failed to load songs:', error);
            document.getElementById('songsList').innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }

    setupSongCheckboxes() {
        // Select all
        document.getElementById('selectAll').addEventListener('change', (e) => {
            document.querySelectorAll('.song-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
                if (e.target.checked) {
                    this.selectedSongs.add(cb.dataset.path);
                } else {
                    this.selectedSongs.delete(cb.dataset.path);
                }
            });
        });
        
        // Individual checkboxes
        document.querySelectorAll('.song-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedSongs.add(cb.dataset.path);
                } else {
                    this.selectedSongs.delete(cb.dataset.path);
                }
            });
        });
    }

    async deleteSelectedSongs() {
        if (this.selectedSongs.size === 0) {
            this.showToast('请先选择歌曲', 'error');
            return;
        }
        
        if (!confirm(`确定要删除选中的 ${this.selectedSongs.size} 首歌曲吗？`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/admin/songs/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: Array.from(this.selectedSongs) })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast(`已删除 ${data.deleted} 首歌曲`, 'success');
                this.loadSongsList();
            } else {
                this.showToast(data.msg || '删除失败', 'error');
            }
        } catch (error) {
            this.showToast('删除失败', 'error');
        }
    }

    async cleanupSongs() {
        if (!confirm('确定要清理所有过期歌曲吗？')) return;
        
        try {
            const response = await fetch('/api/admin/songs/cleanup', { method: 'POST' });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast(`已清理 ${data.cleaned} 首歌曲`, 'success');
                this.loadSongsList();
            } else {
                this.showToast(data.msg || '清理失败', 'error');
            }
        } catch (error) {
            this.showToast('清理失败', 'error');
        }
    }

    // ==================== Accounts ====================
    setupAccounts() {
        document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });
        
        document.getElementById('addAdminForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addAdmin();
        });
    }

    async loadAccountsList() {
        try {
            const response = await fetch('/api/admin/accounts');
            const data = await response.json();
            
            const adminList = document.getElementById('adminList');
            
            if (data.code === 200 && data.accounts && data.accounts.length > 0) {
                let html = '<ul class="admin-list">';
                
                data.accounts.forEach(acc => {
                    const badge = acc.is_default ? '<span class="badge">默认</span>' : '';
                    const deleteBtn = !acc.is_default ? 
                        `<button class="btn-danger btn-sm" data-username="${this.escapeHtml(acc.username)}">删除</button>` : '';
                    
                    html += `
                        <li class="admin-list-item">
                            <span class="admin-username">${this.escapeHtml(acc.username)} ${badge}</span>
                            <span class="admin-created">创建于 ${acc.created}</span>
                            ${deleteBtn}
                        </li>
                    `;
                });
                
                html += '</ul>';
                adminList.innerHTML = html;
                
                // Setup delete buttons
                document.querySelectorAll('[data-username]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.deleteAdmin(btn.dataset.username);
                    });
                });
            } else {
                adminList.innerHTML = '<div class="empty-state">加载失败</div>';
            }
        } catch (error) {
            console.error('Failed to load accounts:', error);
        }
    }

    async changePassword() {
        const oldPwd = document.getElementById('oldPassword').value;
        const newPwd = document.getElementById('newPassword').value;
        const confirmPwd = document.getElementById('confirmPassword').value;
        
        if (!oldPwd || !newPwd || !confirmPwd) {
            this.showToast('请填写所有字段', 'error');
            return;
        }
        
        if (newPwd !== confirmPwd) {
            this.showToast('新密码不匹配', 'error');
            return;
        }
        
        if (newPwd.length < 6) {
            this.showToast('密码至少6位', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/change_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('密码修改成功', 'success');
                document.getElementById('changePasswordForm').reset();
            } else {
                this.showToast(data.msg || '修改失败', 'error');
            }
        } catch (error) {
            this.showToast('修改失败', 'error');
        }
    }

    async addAdmin() {
        const username = document.getElementById('newAdminUsername').value.trim();
        const password = document.getElementById('newAdminPassword').value;
        
        if (!username || !password) {
            this.showToast('请填写所有字段', 'error');
            return;
        }
        
        if (password.length < 6) {
            this.showToast('密码至少6位', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/create_account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('创建成功', 'success');
                document.getElementById('addAdminForm').reset();
                this.loadAccountsList();
            } else {
                this.showToast(data.msg || '创建失败', 'error');
            }
        } catch (error) {
            this.showToast('创建失败', 'error');
        }
    }

    async deleteAdmin(username) {
        if (!confirm(`确定要删除管理员 ${username} 吗？`)) return;
        
        try {
            const response = await fetch('/api/admin/delete_account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('删除成功', 'success');
                this.loadAccountsList();
            } else {
                this.showToast(data.msg || '删除失败', 'error');
            }
        } catch (error) {
            this.showToast('删除失败', 'error');
        }
    }

    // ==================== Settings ====================
    setupSettings() {
        document.getElementById('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });
    }

    async loadSettingsData() {
        try {
            // Load settings
            const settingsResponse = await fetch('/api/admin/settings');
            const settingsData = await settingsResponse.json();
            
            if (settingsData.code === 200) {
                document.getElementById('cacheMode').value = settingsData.settings.cache_downloads ? 'server' : 'direct';
                document.getElementById('cleanupHours').value = settingsData.settings.auto_cleanup_hours || 24;
                document.getElementById('adminPath').value = settingsData.settings.admin_path || '/admin';
                document.getElementById('storageLimit').value = settingsData.settings.storage_limit_gb || 2.0;
            }
            
            // Load disk info
            const diskResponse = await fetch('/api/admin/system/disk');
            const diskData = await diskResponse.json();
            
            if (diskData.code === 200) {
                const diskInfoEl = document.getElementById('diskInfo');
                diskInfoEl.textContent = `磁盘总容量: ${diskData.total_gb} GB | 已用: ${diskData.used_gb} GB (${diskData.used_percent}%) | 可用: ${diskData.free_gb} GB`;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        const storageLimit = parseFloat(document.getElementById('storageLimit').value) || 2.0;
        
        // Validate storage limit
        if (storageLimit < 0.1) {
            this.showToast('存储空间限制不能小于 0.1 GB', 'error');
            return;
        }
        
        const settings = {
            cache_downloads: document.getElementById('cacheMode').value === 'server',
            auto_cleanup_hours: parseInt(document.getElementById('cleanupHours').value) || 24,
            admin_path: document.getElementById('adminPath').value.trim() || '/admin',
            storage_limit_gb: storageLimit
        };
        
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const data = await response.json();
            
            if (data.code === 200) {
                this.showToast('设置已保存', 'success');
            } else {
                this.showToast(data.msg || '保存失败', 'error');
            }
        } catch (error) {
            this.showToast('保存失败', 'error');
        }
    }

    // ==================== Logout ====================
    setupLogout() {
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/admin';
            } catch (error) {
                this.showToast('退出失败', 'error');
            }
        });
    }

    // ==================== Utilities ====================
    showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3500);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize admin when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.admin = new MusicHubAdmin();
});
