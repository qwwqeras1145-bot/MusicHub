/**
 * MusicHub v2.0 主应用逻辑
 */
(function () {
    'use strict';

    // ==================== Auth State ====================
    let currentUser = null; // { username, role, token }

    async function checkAuth() {
        try {
            const resp = await fetch('/api/auth/status');
            const data = await resp.json();
            if (data.logged_in) {
                currentUser = data;
                updateAuthUI();
            }
        } catch (e) { /* ignore */ }
    }

    function updateAuthUI() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const userInfo = document.getElementById('userInfo');
        const adminTab = document.getElementById('adminTab');

        if (currentUser) {
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            userInfo.textContent = currentUser.username +
                (currentUser.role === 'admin' ? ' (管理员)' : '');
            if (currentUser.role === 'admin') {
                adminTab.classList.remove('hidden');
            } else {
                adminTab.classList.add('hidden');
            }
        } else {
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
            userInfo.textContent = '';
            adminTab.classList.add('hidden');
        }
    }

    // ==================== Login Modal ====================
    const loginModal = document.getElementById('loginModal');
    const loginClose = document.getElementById('loginClose');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginForm = document.getElementById('loginForm');
    const neteaseForm = document.getElementById('neteaseForm');
    const loginTabs = document.querySelectorAll('.login-tab');

    loginBtn.addEventListener('click', () => loginModal.classList.remove('hidden'));
    loginClose.addEventListener('click', () => loginModal.classList.add('hidden'));
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) loginModal.classList.add('hidden');
    });

    loginTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            loginTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.mode === 'account') {
                loginForm.classList.remove('hidden');
                neteaseForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                neteaseForm.classList.remove('hidden');
            }
        });
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!username) return showToast('请输入用户名', 'error');

        try {
            const resp = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await resp.json();
            if (data.code === 200) {
                currentUser = { username: data.username, role: data.role, token: data.token };
                updateAuthUI();
                loginModal.classList.add('hidden');
                showToast(`欢迎回来，${data.username}！`, 'success');
            } else {
                showToast(data.msg || '登录失败', 'error');
            }
        } catch (err) {
            showToast('登录失败: ' + err.message, 'error');
        }
    });

    neteaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cookie = document.getElementById('neteaseCookie').value.trim();
        try {
            const resp = await fetch('/api/user/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookie }),
            });
            const data = await resp.json();
            showToast(data.msg || '设置成功', 'success');
        } catch (err) {
            showToast('设置失败: ' + err.message, 'error');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        updateAuthUI();
        showToast('已退出登录', 'info');
    });

    // ==================== Tab Switching ====================
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabPanels = document.querySelectorAll('.tab-panel');

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            if (target === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
                showToast('需要管理员权限', 'error');
                return;
            }
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + target));
            if (target === 'hot') loadHotList();
            if (target === 'library') loadLibraryStats();
            if (target === 'admin') loadAdminData();
        });
    });

    // ==================== Search ====================
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const suggestions = document.getElementById('searchSuggestions');
    let searchTimeout = null;

    searchBtn.addEventListener('click', () => doSearch());
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(); suggestions.classList.add('hidden'); }
    });
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const val = searchInput.value.trim();
        if (val.length < 1) { suggestions.classList.add('hidden'); return; }
        searchTimeout = setTimeout(() => fetchSuggestions(val), 300);
    });
    searchInput.addEventListener('blur', () => setTimeout(() => suggestions.classList.add('hidden'), 200));

    async function fetchSuggestions(keyword) {
        try {
            const resp = await fetch(`/api/search/suggest?q=${encodeURIComponent(keyword)}`);
            const data = await resp.json();
            const matches = data?.result?.allMatch || [];
            if (!matches.length) { suggestions.classList.add('hidden'); return; }
            suggestions.innerHTML = matches.slice(0, 8).map(m =>
                `<div class="suggestion-item" data-kw="${escapeHtml(m.keyword)}">${escapeHtml(m.keyword)}</div>`
            ).join('');
            suggestions.classList.remove('hidden');
            suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    searchInput.value = item.dataset.kw;
                    suggestions.classList.add('hidden');
                    doSearch();
                });
            });
        } catch (e) { suggestions.classList.add('hidden'); }
    }

    async function doSearch() {
        const keyword = searchInput.value.trim();
        if (!keyword) return;
        searchResults.innerHTML = '<div class="loading">搜索中...</div>';
        suggestions.classList.add('hidden');
        try {
            const resp = await fetch(`/api/search?q=${encodeURIComponent(keyword)}&limit=50`);
            const data = await resp.json();
            if (data.code !== 200 || !data.songs || !data.songs.length) {
                searchResults.innerHTML = '<div class="empty-state"><p>没有找到相关歌曲</p><span>换个关键词试试？</span></div>';
                return;
            }
            renderSongList(data.songs, searchResults);
            showToast(`找到 ${data.total || data.songs.length} 首歌曲`, 'success');
        } catch (err) {
            searchResults.innerHTML = `<div class="empty-state"><p>搜索失败</p><span>${err.message}</span></div>`;
        }
    }

    // ==================== Song List Rendering ====================
    function renderSongList(songs, container) {
        player.setPlaylist(songs);
        container.innerHTML = songs.map((song, i) => {
            const playable = song.playable !== false;
            const reason = song.unavailable_reason || '';
            let badge = '';
            if (!playable) {
                badge = `<span class="song-badge badge-unavailable">${escapeHtml(reason || '不可用')}</span>`;
            } else if (song.fee === 1 || song.fee === 4) {
                badge = '<span class="song-badge badge-vip">VIP</span>';
            } else if (song.fee === 0) {
                badge = '<span class="song-badge badge-free">免费</span>';
            }

            return `
            <div class="song-item ${!playable ? 'unavailable' : ''}" data-id="${song.id}" data-index="${i}">
                <span class="song-index">${i + 1}</span>
                <img class="song-cover" src="${song.album?.pic || ''}" alt="" onerror="this.style.display='none'">
                <div class="song-info">
                    <div class="song-name">${escapeHtml(song.name)} ${badge}</div>
                    <div class="song-artist">${escapeHtml(song.artist_names)}</div>
                </div>
                <span class="song-duration">${formatDuration(song.duration)}</span>
                <div class="song-actions">
                    <button class="action-btn play-action" title="播放" data-id="${song.id}" data-index="${i}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <button class="action-btn download-action ${!playable ? 'disabled' : ''}" title="${playable ? '下载' : reason}" data-id="${song.id}" data-name="${escapeHtml(song.name)}" data-playable="${playable}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('dblclick', () => {
                const idx = parseInt(item.dataset.index);
                player.play(songs[idx], idx);
            });
        });
        container.querySelectorAll('.play-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                player.play(songs[parseInt(btn.dataset.index)], parseInt(btn.dataset.index));
            });
        });
        container.querySelectorAll('.download-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.classList.contains('disabled')) {
                    showToast(btn.title || '该歌曲不可下载', 'error');
                    return;
                }
                downloadSong(btn.dataset.id, btn.dataset.name, btn);
            });
        });
    }

    // ==================== Hot Lists ====================
    const hotList = document.getElementById('hotList');
    document.querySelectorAll('.hot-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.hot-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadHotList(tab.dataset.list);
        });
    });

    async function loadHotList(listId = 3778678) {
        hotList.innerHTML = '<div class="loading">加载中...</div>';
        try {
            const resp = await fetch(`/api/toplist/detail?id=${listId}`);
            const data = await resp.json();
            if (data.code !== 200 || !data.songs || !data.songs.length) {
                hotList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
                return;
            }
            renderSongList(data.songs, hotList);
        } catch (err) {
            hotList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    }

    // ==================== Batch Download ====================
    const batchCount = document.getElementById('batchCount');
    document.getElementById('countMinus').addEventListener('click', () => { batchCount.value = Math.max(1, parseInt(batchCount.value) - 1); });
    document.getElementById('countPlus').addEventListener('click', () => { batchCount.value = Math.min(200, parseInt(batchCount.value) + 1); });
    document.querySelectorAll('.quick-counts button').forEach(btn => {
        btn.addEventListener('click', () => { batchCount.value = btn.dataset.count; });
    });

    const startBatchBtn = document.getElementById('startBatchDownload');
    const batchProgress = document.getElementById('batchProgress');
    const progressText = document.getElementById('progressText');
    const progressCount = document.getElementById('progressCount');
    const progressFill = document.getElementById('progressFill');
    const progressLog = document.getElementById('progressLog');

    startBatchBtn.addEventListener('click', async () => {
        const count = parseInt(batchCount.value) || 5;
        const quality = document.getElementById('batchQuality').value;
        startBatchBtn.disabled = true;
        startBatchBtn.textContent = '正在获取热门歌曲...';
        batchProgress.classList.remove('hidden');
        progressLog.innerHTML = '';
        progressFill.style.width = '0%';
        progressText.textContent = '正在获取热门歌曲...';
        progressCount.textContent = '0/' + count;

        try {
            const resp = await fetch('/api/download/random', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count, quality }),
            });
            const data = await resp.json();
            if (data.code !== 200) {
                progressText.textContent = '获取歌曲失败: ' + (data.msg || '');
                startBatchBtn.disabled = false;
                startBatchBtn.textContent = '开始随机下载';
                return;
            }
            const taskId = data.task_id;
            const songs = data.songs || [];
            progressLog.innerHTML = songs.map(s =>
                `<div class="log-item">🎵 ${escapeHtml(s.name)} - ${escapeHtml(s.artist)}</div>`
            ).join('');
            progressText.textContent = '正在下载...';
            pollDownloadProgress(taskId, count);
        } catch (err) {
            progressText.textContent = '请求失败: ' + err.message;
            startBatchBtn.disabled = false;
            startBatchBtn.textContent = '开始随机下载';
        }
    });

    async function pollDownloadProgress(taskId, total) {
        const interval = setInterval(async () => {
            try {
                const resp = await fetch(`/api/download/status?task_id=${taskId}`);
                const data = await resp.json();
                const task = data.task;
                if (!task) { clearInterval(interval); return; }
                progressFill.style.width = Math.round(task.completed / total * 100) + '%';
                progressCount.textContent = `${task.completed}/${task.total}`;
                if (task.results) {
                    const last = task.results[task.results.length - 1];
                    if (last && !progressLog.querySelector(`[data-sid="${last.song_id}"]`)) {
                        const songInfo = (task.songs || []).find(s => s.id === last.song_id);
                        const name = songInfo ? songInfo.name : last.song_id;
                        const cls = last.success ? 'log-success' : 'log-error';
                        const icon = last.success ? '✅' : '❌';
                        const div = document.createElement('div');
                        div.innerHTML = `<div class="log-item ${cls}" data-sid="${last.song_id}">${icon} ${escapeHtml(name)} - ${last.success ? '下载完成' : (last.error || '失败')}</div>`;
                        progressLog.appendChild(div.firstElementChild);
                        progressLog.scrollTop = progressLog.scrollHeight;
                    }
                }
                if (task.status === 'completed') {
                    clearInterval(interval);
                    progressText.textContent = `下载完成！成功 ${task.success} 首，失败 ${task.failed} 首`;
                    startBatchBtn.disabled = false;
                    startBatchBtn.textContent = '开始随机下载';
                    showToast(`批量下载完成：成功 ${task.success} / ${task.total}`, 'success');
                }
            } catch (e) { /* ignore */ }
        }, 1500);
    }

    // ==================== Single Download ====================
    async function downloadSong(songId, songName, btn) {
        btn.classList.add('downloading');
        const dlIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        const clockIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>';
        btn.innerHTML = clockIcon;
        try {
            const resp = await fetch(`/api/download/song?id=${songId}&quality=exhigh`);
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await resp.json();
                throw new Error(data.msg || '下载失败');
            }
            if (!resp.ok) throw new Error('下载失败');
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${songName}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            btn.classList.remove('downloading');
            btn.innerHTML = checkIcon;
            btn.style.color = '#1db954';
            showToast(`${songName} 下载完成`, 'success');
            setTimeout(() => { btn.innerHTML = dlIcon; btn.style.color = ''; }, 2000);
        } catch (err) {
            btn.classList.remove('downloading');
            btn.innerHTML = dlIcon;
            showToast('下载失败: ' + err.message, 'error');
        }
    }

    // ==================== Library ====================
    async function loadLibraryStats() {
        try {
            const resp = await fetch('/api/download/stats');
            const data = await resp.json();
            if (data.code === 200) {
                document.getElementById('libCount').textContent = data.count || 0;
                document.getElementById('libSize').textContent = (data.total_size_mb || 0) + ' MB';
                document.getElementById('libPath').textContent = data.download_dir || '-';
            }
        } catch (e) { /* ignore */ }
    }
    document.getElementById('refreshLibrary').addEventListener('click', loadLibraryStats);

    // ==================== Admin Panel ====================
    async function loadAdminData() {
        if (!currentUser || currentUser.role !== 'admin') return;
        try {
            // Stats
            const statsResp = await fetch('/api/admin/stats');
            const stats = await statsResp.json();
            if (stats.code === 200) {
                document.getElementById('adminDlCount').textContent = stats.downloads?.count || 0;
                document.getElementById('adminDlSize').textContent = (stats.downloads?.total_size_mb || 0) + ' MB';
                document.getElementById('adminOnline').textContent = stats.online_users || 0;
                document.getElementById('adminSessions').textContent = stats.total_sessions || 0;
            }
            // Users
            const usersResp = await fetch('/api/admin/users');
            const usersData = await usersResp.json();
            if (usersData.code === 200) {
                const userList = document.getElementById('adminUserList');
                if (!usersData.users.length) {
                    userList.innerHTML = '<p style="color:var(--text-muted)">暂无在线用户</p>';
                } else {
                    userList.innerHTML = `<table><thead><tr><th>用户名</th><th>角色</th><th>登录时间</th><th>状态</th><th>操作</th></tr></thead><tbody>` +
                        usersData.users.map(u => `<tr>
                            <td>${escapeHtml(u.username)}</td>
                            <td>${u.role === 'admin' ? '管理员' : '普通用户'}</td>
                            <td>${u.login_time}</td>
                            <td class="${u.active ? 'status-active' : 'status-inactive'}">${u.active ? '在线' : '离线'}</td>
                            <td>${u.role !== 'admin' ? `<button class="kick-btn" data-user="${escapeHtml(u.username)}">踢出</button>` : '-'}</td>
                        </tr>`).join('') + '</tbody></table>';
                    userList.querySelectorAll('.kick-btn').forEach(btn => {
                        btn.addEventListener('click', () => kickUser(btn.dataset.user));
                    });
                }
            }
            // Tasks
            const tasksResp = await fetch('/api/admin/tasks');
            const tasksData = await tasksResp.json();
            if (tasksData.code === 200) {
                const taskList = document.getElementById('adminTaskList');
                if (!tasksData.tasks.length) {
                    taskList.innerHTML = '<p style="color:var(--text-muted)">暂无下载任务</p>';
                } else {
                    taskList.innerHTML = `<table><thead><tr><th>ID</th><th>状态</th><th>进度</th><th>成功</th><th>失败</th></tr></thead><tbody>` +
                        tasksData.tasks.map(t => `<tr>
                            <td>#${t.id}</td>
                            <td>${t.status === 'completed' ? '已完成' : '下载中'}</td>
                            <td>${t.completed}/${t.total}</td>
                            <td style="color:var(--accent)">${t.success}</td>
                            <td style="color:var(--danger)">${t.failed}</td>
                        </tr>`).join('') + '</tbody></table>';
                }
            }
        } catch (e) { showToast('加载管理数据失败', 'error'); }
    }

    async function kickUser(username) {
        try {
            const resp = await fetch('/api/admin/kick_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            const data = await resp.json();
            showToast(data.msg || '操作完成', data.code === 200 ? 'success' : 'error');
            loadAdminData();
        } catch (e) { showToast('操作失败', 'error'); }
    }

    document.getElementById('refreshAdmin').addEventListener('click', loadAdminData);

    document.getElementById('changePwdForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPwd = document.getElementById('oldPwd').value;
        const newPwd = document.getElementById('newPwd').value;
        if (!oldPwd || !newPwd) return showToast('请填写完整', 'error');
        try {
            const resp = await fetch('/api/auth/change_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
            });
            const data = await resp.json();
            showToast(data.msg || '操作完成', data.code === 200 ? 'success' : 'error');
            if (data.code === 200) {
                document.getElementById('oldPwd').value = '';
                document.getElementById('newPwd').value = '';
            }
        } catch (e) { showToast('修改失败', 'error'); }
    });

    // ==================== Utils ====================
    function formatDuration(ms) {
        if (!ms) return '-';
        const s = Math.floor(ms / 1000);
        return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    }
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Init
    checkAuth();
})();
