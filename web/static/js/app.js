/**
 * MusicHub v4.0 - Main Application
 */
(function () {
    'use strict';

    const API = ''; // same origin

    // ==================== Helpers ====================
    function $(id) { return document.getElementById(id); }
    function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function formatDuration(ms) { if (!ms) return '-'; const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
    function showToast(msg, type='info') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    // ==================== Auth ====================
    const loginPage = $('loginPage');
    const mainApp = $('mainApp');

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
        } catch { showLogin(); }
    }

    function showLogin() {
        loginPage.classList.remove('hidden');
        mainApp.classList.add('hidden');
    }

    function showMain() {
        loginPage.classList.add('hidden');
        mainApp.classList.remove('hidden');
        $('userInfo').textContent = currentUser;
    }

    let currentUser = null;

    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('loginSubmitBtn');
        const errEl = $('loginError');
        btn.disabled = true; btn.textContent = '登录中...';
        errEl.classList.add('hidden');
        try {
            const r = await fetch(`${API}/api/auth/login`, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ username: $('loginUsername').value.trim(), password: $('loginPassword').value })
            });
            const d = await r.json();
            if (d.code === 200) {
                currentUser = d.username;
                showMain();
            } else {
                errEl.textContent = d.msg || '登录失败';
                errEl.classList.remove('hidden');
            }
        } catch (err) {
            errEl.textContent = '网络错误';
            errEl.classList.remove('hidden');
        }
        btn.disabled = false; btn.textContent = '登 录';
    });

    $('logoutBtn').addEventListener('click', async () => {
        await fetch(`${API}/api/auth/logout`, { method: 'POST' });
        currentUser = null;
        showLogin();
        $('loginUsername').value = '';
        $('loginPassword').value = '';
    });

    // ==================== Tab Navigation ====================
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabPanels = document.querySelectorAll('.tab-panel');

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + target));
            if (target === 'hot') loadHotList();
            if (target === 'library') loadLibraryStats();
            if (target === 'admin') loadAdminDefault();
        });
    });

    // Admin sub-tabs
    document.querySelectorAll('.admin-sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-sub-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.admin-sub-panel').forEach(p => p.classList.remove('active'));
            $('admin-' + tab.dataset.panel).classList.add('active');
            loadAdminPanel(tab.dataset.panel);
        });
    });

    // ==================== Search ====================
    const searchInput = $('searchInput');
    const searchBtn = $('searchBtn');
    const searchResults = $('searchResults');
    const suggestions = $('searchSuggestions');
    let searchTimeout = null;

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); suggestions.classList.add('hidden'); } });
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const v = searchInput.value.trim();
        if (v.length < 1) { suggestions.classList.add('hidden'); return; }
        searchTimeout = setTimeout(() => fetchSuggestions(v), 300);
    });
    searchInput.addEventListener('blur', () => setTimeout(() => suggestions.classList.add('hidden'), 200));

    async function fetchSuggestions(kw) {
        try {
            const r = await fetch(`${API}/api/search/suggest?q=${encodeURIComponent(kw)}`);
            const d = await r.json();
            const m = d?.result?.allMatch || [];
            if (!m.length) { suggestions.classList.add('hidden'); return; }
            suggestions.innerHTML = m.slice(0,8).map(x => `<div class="suggestion-item" data-kw="${escapeHtml(x.keyword)}">${escapeHtml(x.keyword)}</div>`).join('');
            suggestions.classList.remove('hidden');
            suggestions.querySelectorAll('.suggestion-item').forEach(i => {
                i.addEventListener('click', () => { searchInput.value = i.dataset.kw; suggestions.classList.add('hidden'); doSearch(); });
            });
        } catch { suggestions.classList.add('hidden'); }
    }

    async function doSearch() {
        const kw = searchInput.value.trim();
        if (!kw) return;
        searchResults.innerHTML = '<div class="loading">搜索中...</div>';
        suggestions.classList.add('hidden');
        try {
            const r = await fetch(`${API}/api/search?q=${encodeURIComponent(kw)}&limit=50`);
            const d = await r.json();
            if (d.code !== 200 || !d.songs?.length) {
                searchResults.innerHTML = '<div class="empty-state"><p>没有找到相关歌曲</p></div>';
                return;
            }
            renderSongList(d.songs, searchResults);
            showToast(`找到 ${d.total || d.songs.length} 首`, 'success');
        } catch (err) { searchResults.innerHTML = `<div class="empty-state"><p>搜索失败</p></div>`; }
    }

    // ==================== Song List ====================
    function renderSongList(songs, container) {
        if (typeof player !== 'undefined') player.setPlaylist(songs);
        container.innerHTML = songs.map((song, i) => {
            const playable = song.playable !== false;
            const reason = song.unavailable_reason || '';
            let badge = '';
            if (!playable) badge = `<span class="song-badge badge-unavailable">${escapeHtml(reason||'不可用')}</span>`;
            else if (song.fee===1||song.fee===4) badge = '<span class="song-badge badge-vip">VIP</span>';
            else if (song.fee===0) badge = '<span class="song-badge badge-free">免费</span>';
            return `<div class="song-item ${!playable?'unavailable':''}" data-id="${song.id}" data-index="${i}">
                <span class="song-index">${i+1}</span>
                <img class="song-cover" src="${song.album?.pic||''}" alt="" onerror="this.style.display='none'">
                <div class="song-info"><div class="song-name">${escapeHtml(song.name)} ${badge}</div><div class="song-artist">${escapeHtml(song.artist_names)}</div></div>
                <span class="song-duration">${formatDuration(song.duration)}</span>
                <div class="song-actions">
                    <button class="action-btn play-action" title="播放" data-id="${song.id}" data-index="${i}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
                    <button class="action-btn download-action ${!playable?'disabled':''}" title="${playable?'下载':reason}" data-id="${song.id}" data-name="${escapeHtml(song.name)}" data-playable="${playable}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button>
                </div>
            </div>`;
        }).join('');
        container.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('dblclick', () => player.play(songs[parseInt(item.dataset.index)], parseInt(item.dataset.index)));
        });
        container.querySelectorAll('.play-action').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); player.play(songs[parseInt(btn.dataset.index)], parseInt(btn.dataset.index)); });
        });
        container.querySelectorAll('.download-action').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (btn.classList.contains('disabled')) { showToast(btn.title || '不可下载', 'error'); return; }
                downloadSong(btn.dataset.id, btn.dataset.name, btn);
            });
        });
    }

    async function downloadSong(songId, songName, btn) {
        btn.classList.add('downloading');
        const dlSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="spin"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>';
        try {
            const r = await fetch(`${API}/api/download/song?id=${songId}&quality=exhigh`);
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                const d = await r.json();
                if (d.direct && d.url) {
                    // Direct mode: client downloads from NCM CDN
                    const a = document.createElement('a'); a.href = d.url; a.download = `${songName}.mp3`; a.target = '_blank';
                    document.body.appendChild(a); a.click(); a.remove();
                    btn.classList.remove('downloading'); btn.innerHTML = checkSvg; btn.style.color = '#1db954';
                    showToast(`${songName} 下载完成`, 'success');
                    setTimeout(() => { btn.innerHTML = dlSvg; btn.style.color = ''; }, 2000);
                    return;
                }
                throw new Error(d.msg || '下载失败');
            }
            if (!r.ok) throw new Error('下载失败');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${songName}.mp3`;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            btn.classList.remove('downloading'); btn.innerHTML = checkSvg; btn.style.color = '#1db954';
            showToast(`${songName} 下载完成`, 'success');
            setTimeout(() => { btn.innerHTML = dlSvg; btn.style.color = ''; }, 2000);
        } catch (err) {
            btn.classList.remove('downloading'); btn.innerHTML = dlSvg;
            showToast('下载失败: ' + err.message, 'error');
        }
    }

    // ==================== Hot Lists ====================
    const hotList = $('hotList');
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
            const r = await fetch(`${API}/api/toplist/detail?id=${listId}`);
            const d = await r.json();
            if (d.code !== 200 || !d.songs?.length) { hotList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; return; }
            renderSongList(d.songs, hotList);
        } catch { hotList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; }
    }

    // ==================== Batch Download ====================
    const batchCount = $('batchCount');
    $('countMinus').addEventListener('click', () => { batchCount.value = Math.max(1, parseInt(batchCount.value)-1); });
    $('countPlus').addEventListener('click', () => { batchCount.value = Math.min(200, parseInt(batchCount.value)+1); });
    document.querySelectorAll('.quick-counts button').forEach(btn => { btn.addEventListener('click', () => { batchCount.value = btn.dataset.count; }); });

    const startBatchBtn = $('startBatchDownload');
    const batchProgress = $('batchProgress');
    const progressText = $('progressText');
    const progressCount = $('progressCount');
    const progressFill = $('progressFill');
    const progressLog = $('progressLog');

    startBatchBtn.addEventListener('click', async () => {
        const count = parseInt(batchCount.value) || 5;
        const quality = $('batchQuality').value;
        startBatchBtn.disabled = true; startBatchBtn.textContent = '获取歌曲...';
        batchProgress.classList.remove('hidden'); progressLog.innerHTML = '';
        progressFill.style.width = '0%'; progressText.textContent = '获取中...'; progressCount.textContent = '0/'+count;
        try {
            const r = await fetch(`${API}/api/download/random`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({count,quality}) });
            const d = await r.json();
            if (d.code !== 200) { progressText.textContent = '失败: '+(d.msg||''); startBatchBtn.disabled=false; startBatchBtn.textContent='开始随机下载'; return; }
            const songs = d.songs||[];
            progressLog.innerHTML = songs.map(s=>`<div class="log-item">🎵 ${escapeHtml(s.name)} - ${escapeHtml(s.artist)}</div>`).join('');
            progressText.textContent = '下载中...';
            pollProgress(d.task_id, count);
        } catch (err) { progressText.textContent='失败: '+err.message; startBatchBtn.disabled=false; startBatchBtn.textContent='开始随机下载'; }
    });

    function pollProgress(taskId, total) {
        const iv = setInterval(async () => {
            try {
                const r = await fetch(`${API}/api/download/status?task_id=${taskId}`);
                const d = await r.json();
                const t = d.task; if (!t) { clearInterval(iv); return; }
                progressFill.style.width = Math.round(t.completed/total*100)+'%';
                progressCount.textContent = `${t.completed}/${t.total}`;
                if (t.results) {
                    const last = t.results[t.results.length-1];
                    if (last && !progressLog.querySelector(`[data-sid="${last.song_id}"]`)) {
                        const si = (t.songs||[]).find(s=>s.id===last.song_id);
                        const name = si ? si.name : last.song_id;
                        const cls = last.success?'log-success':'log-error';
                        const icon = last.success?'✅':'❌';
                        const div = document.createElement('div');
                        div.innerHTML = `<div class="log-item ${cls}" data-sid="${last.song_id}">${icon} ${escapeHtml(name)}</div>`;
                        progressLog.appendChild(div.firstElementChild);
                        progressLog.scrollTop = progressLog.scrollHeight;
                    }
                }
                if (t.status === 'completed') {
                    clearInterval(iv);
                    progressText.textContent = `完成！成功 ${t.success} 首，失败 ${t.failed} 首`;
                    startBatchBtn.disabled = false; startBatchBtn.textContent = '开始随机下载';
                    showToast(`批量下载完成：${t.success}/${t.total}`, 'success');
                }
            } catch {}
        }, 1500);
    }

    // ==================== Library ====================
    async function loadLibraryStats() {
        try {
            const r = await fetch(`${API}/api/download/stats`);
            const d = await r.json();
            if (d.code === 200) {
                $('libCount').textContent = d.count||0;
                $('libSize').textContent = (d.total_size_mb||0)+' MB';
                $('libPath').textContent = d.download_dir||'-';
            }
        } catch {}
    }
    $('refreshLibrary').addEventListener('click', loadLibraryStats);

    // ==================== Admin Panel ====================
    function loadAdminDefault() { loadAdminPanel('dashboard'); }

    function loadAdminPanel(panel) {
        switch(panel) {
            case 'dashboard': loadDashboard(); break;
            case 'ncm': loadNcmStatus(); break;
            case 'songs': loadAdminSongs(); break;
            case 'accounts': loadAccounts(); break;
            case 'settings': loadSettings(); break;
        }
    }

    // -- Dashboard --
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

    // -- NCM Login --
    async function loadNcmStatus() {
        try {
            const r = await fetch(`${API}/api/admin/ncm/status`);
            const d = await r.json();
            if (d.logged_in) {
                $('ncmCurrentStatus').innerHTML = `<div style="display:flex;align-items:center;gap:12px">
                    <span style="color:var(--accent);font-size:18px">●</span>
                    <div><strong>已登录</strong><br><span style="color:var(--text-secondary)">${escapeHtml(d.username)} (${d.login_method})</span></div>
                    <button id="ncmLogoutBtn" class="btn-danger" style="margin-left:auto">退出</button></div>`;
                $('ncmLogoutBtn').addEventListener('click', async () => {
                    await fetch(`${API}/api/admin/ncm/logout`, {method:'POST'});
                    loadNcmStatus();
                    showToast('已退出网易云', 'success');
                });
            } else {
                $('ncmCurrentStatus').innerHTML = '<div style="color:var(--text-muted)">未登录网易云音乐，登录后解锁 VIP 歌曲和高音质</div>';
            }
        } catch {}
    }

    $('ncmCookieBtn').addEventListener('click', async () => {
        const cookie = $('ncmCookieInput').value.trim();
        if (!cookie) { showToast('请输入 Cookie', 'error'); return; }
        const r = await fetch(`${API}/api/admin/ncm/cookie`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) loadNcmStatus();
    });

    $('ncmPhoneBtn').addEventListener('click', async () => {
        const phone = $('ncmPhone').value.trim();
        const password = $('ncmPwd').value;
        if (!phone) { showToast('请输入手机号', 'error'); return; }
        const r = await fetch(`${API}/api/admin/ncm/phone`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) loadNcmStatus();
    });

    let qrCheckInterval = null;
    $('qrGenBtn').addEventListener('click', async () => {
        const r = await fetch(`${API}/api/admin/ncm/qr/create`);
        const d = await r.json();
        if (d.code !== 200) { showToast('生成失败', 'error'); return; }
        $('qrContainer').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(d.qr_url)}" alt="QR" class="qr-img">`;
        $('qrStatusText').textContent = '等待扫码...';
        if (qrCheckInterval) clearInterval(qrCheckInterval);
        qrCheckInterval = setInterval(async () => {
            const cr = await fetch(`${API}/api/admin/ncm/qr/check?key=${d.key}`);
            const cd = await cr.json();
            $('qrStatusText').textContent = cd.msg;
            if (cd.status === 'success') { clearInterval(qrCheckInterval); loadNcmStatus(); showToast('扫码登录成功', 'success'); }
            if (cd.status === 'expired') { clearInterval(qrCheckInterval); $('qrContainer').innerHTML = '<button id="qrGenBtn2" class="btn-secondary">二维码已过期，重新生成</button>'; }
        }, 2000);
    });

    // -- Song Management --
    $('refreshSongs').addEventListener('click', loadAdminSongs);
    $('cleanupBtn').addEventListener('click', async () => {
        const r = await fetch(`${API}/api/admin/songs/cleanup`, {method:'POST'});
        const d = await r.json();
        showToast(d.msg, 'success');
        loadAdminSongs();
    });

    let selectedSongs = new Set();
    async function loadAdminSongs() {
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
        const d = await r.json();
        showToast(d.msg, 'success');
        loadAdminSongs();
    });

    // -- Accounts --
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
                    const d = await r.json();
                    showToast(d.msg, d.code===200?'success':'error');
                    loadAccounts();
                });
            });
        } catch {}
    }

    $('changePwdBtn').addEventListener('click', async () => {
        const o = $('oldPwd').value, n = $('newPwd').value;
        if (!o||!n) { showToast('请填写完整','error'); return; }
        const r = await fetch(`${API}/api/admin/change_password`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({old_password:o,new_password:n})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { $('oldPwd').value=''; $('newPwd').value=''; }
    });

    $('changeNameBtn').addEventListener('click', async () => {
        const n = $('newUsername').value.trim(), p = $('confirmPwdForName').value;
        if (!n||!p) { showToast('请填写完整','error'); return; }
        const r = await fetch(`${API}/api/admin/change_username`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_username:n,password:p})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { currentUser = d.new_username; $('userInfo').textContent = currentUser; loadAccounts(); }
    });

    $('createAdminBtn').addEventListener('click', async () => {
        const u = $('newAdminUser').value.trim(), p = $('newAdminPwd').value;
        if (!u||!p) { showToast('请填写完整','error'); return; }
        const r = await fetch(`${API}/api/admin/create_account`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
        const d = await r.json();
        showToast(d.msg, d.code===200?'success':'error');
        if (d.code===200) { $('newAdminUser').value=''; $('newAdminPwd').value=''; loadAccounts(); }
    });

    // -- Settings --
    async function loadSettings() {
        try {
            const r = await fetch(`${API}/api/admin/settings`);
            const d = await r.json();
            if (d.code===200) {
                $('settingCache').checked = d.settings.cache_downloads;
                $('settingAutoClean').checked = d.settings.auto_cleanup_enabled;
                $('settingCleanHours').value = d.settings.auto_cleanup_hours;
            }
        } catch {}
    }

    $('saveSettingsBtn').addEventListener('click', async () => {
        const r = await fetch(`${API}/api/admin/settings/update`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                cache_downloads: $('settingCache').checked,
                auto_cleanup_enabled: $('settingAutoClean').checked,
                auto_cleanup_hours: parseInt($('settingCleanHours').value)||24
            })
        });
        const d = await r.json();
        showToast(d.msg, 'success');
    });

    // ==================== Init ====================
    checkAuth();
})();
