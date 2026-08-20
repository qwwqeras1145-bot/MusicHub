/**
 * MusicHub 主应用逻辑
 * 搜索、榜单、批量下载、Tab 切换
 */
(function () {
    'use strict';

    // ==================== Tab 切换 ====================

    const navTabs = document.querySelectorAll('.nav-tab');
    const tabPanels = document.querySelectorAll('.tab-panel');

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabPanels.forEach(p => {
                p.classList.toggle('active', p.id === 'tab-' + target);
            });

            // 切换到特定 tab 时加载数据
            if (target === 'hot') loadHotList();
            if (target === 'library') loadLibraryStats();
        });
    });

    // ==================== 搜索 ====================

    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const suggestions = document.getElementById('searchSuggestions');

    let searchTimeout = null;

    searchBtn.addEventListener('click', () => doSearch());

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            doSearch();
            suggestions.classList.add('hidden');
        }
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const val = searchInput.value.trim();
        if (val.length < 1) {
            suggestions.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => fetchSuggestions(val), 300);
    });

    searchInput.addEventListener('blur', () => {
        setTimeout(() => suggestions.classList.add('hidden'), 200);
    });

    async function fetchSuggestions(keyword) {
        try {
            const resp = await fetch(`/api/search/suggest?q=${encodeURIComponent(keyword)}`);
            const data = await resp.json();
            const matches = data?.result?.allMatch || [];
            if (matches.length === 0) {
                suggestions.classList.add('hidden');
                return;
            }
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
        } catch (e) {
            suggestions.classList.add('hidden');
        }
    }

    async function doSearch() {
        const keyword = searchInput.value.trim();
        if (!keyword) return;

        searchResults.innerHTML = '<div class="loading">搜索中...</div>';
        suggestions.classList.add('hidden');

        try {
            const resp = await fetch(`/api/search?q=${encodeURIComponent(keyword)}&limit=50`);
            const data = await resp.json();

            if (data.code !== 200 || !data.songs || data.songs.length === 0) {
                searchResults.innerHTML = `
                    <div class="empty-state">
                        <p>没有找到相关歌曲</p>
                        <span>换个关键词试试？</span>
                    </div>`;
                return;
            }

            renderSongList(data.songs, searchResults);
            showToast(`找到 ${data.total || data.songs.length} 首歌曲`, 'success');
        } catch (err) {
            searchResults.innerHTML = `
                <div class="empty-state">
                    <p>搜索失败</p>
                    <span>${err.message}</span>
                </div>`;
        }
    }

    // ==================== 歌曲列表渲染 ====================

    function renderSongList(songs, container) {
        player.setPlaylist(songs);

        container.innerHTML = songs.map((song, i) => `
            <div class="song-item" data-id="${song.id}" data-index="${i}">
                <span class="song-index">${i + 1}</span>
                <img class="song-cover" src="${song.album?.pic || ''}" alt=""
                     onerror="this.style.display='none'">
                <div class="song-info">
                    <div class="song-name">${escapeHtml(song.name)}</div>
                    <div class="song-artist">${escapeHtml(song.artist_names)}</div>
                </div>
                <span class="song-duration">${formatDuration(song.duration)}</span>
                <div class="song-actions">
                    <button class="action-btn play-action" title="播放" data-id="${song.id}" data-index="${i}">▶</button>
                    <button class="action-btn download-action" title="下载" data-id="${song.id}" data-name="${escapeHtml(song.name)}">⬇</button>
                </div>
            </div>
        `).join('');

        // 绑定事件
        container.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('dblclick', () => {
                const idx = parseInt(item.dataset.index);
                player.play(songs[idx], idx);
            });
        });

        container.querySelectorAll('.play-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                player.play(songs[idx], idx);
            });
        });

        container.querySelectorAll('.download-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadSong(btn.dataset.id, btn.dataset.name, btn);
            });
        });
    }

    // ==================== 热门榜单 ====================

    const hotList = document.getElementById('hotList');
    const hotTabs = document.querySelectorAll('.hot-tab');

    hotTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            hotTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadHotList(tab.dataset.list);
        });
    });

    async function loadHotList(listId = 3778678) {
        hotList.innerHTML = '<div class="loading">加载中...</div>';

        try {
            const resp = await fetch(`/api/toplist/detail?id=${listId}`);
            const data = await resp.json();

            if (data.code !== 200 || !data.songs || data.songs.length === 0) {
                hotList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
                return;
            }

            renderSongList(data.songs, hotList);
        } catch (err) {
            hotList.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    }

    // ==================== 批量下载 ====================

    const batchCount = document.getElementById('batchCount');
    const countMinus = document.getElementById('countMinus');
    const countPlus = document.getElementById('countPlus');
    const batchQuality = document.getElementById('batchQuality');
    const startBatchBtn = document.getElementById('startBatchDownload');
    const batchProgress = document.getElementById('batchProgress');
    const progressText = document.getElementById('progressText');
    const progressCount = document.getElementById('progressCount');
    const progressFill = document.getElementById('progressFill');
    const progressLog = document.getElementById('progressLog');

    countMinus.addEventListener('click', () => {
        batchCount.value = Math.max(1, parseInt(batchCount.value) - 1);
    });

    countPlus.addEventListener('click', () => {
        batchCount.value = Math.min(200, parseInt(batchCount.value) + 1);
    });

    document.querySelectorAll('.quick-counts button').forEach(btn => {
        btn.addEventListener('click', () => {
            batchCount.value = btn.dataset.count;
        });
    });

    startBatchBtn.addEventListener('click', async () => {
        const count = parseInt(batchCount.value) || 5;
        const quality = batchQuality.value;

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

            // 显示将要下载的歌曲
            progressLog.innerHTML = songs.map(s =>
                `<div class="log-item">🎵 ${escapeHtml(s.name)} - ${escapeHtml(s.artist)}</div>`
            ).join('');

            progressText.textContent = '正在下载...';

            // 轮询进度
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

                if (!task) {
                    clearInterval(interval);
                    return;
                }

                const pct = total > 0 ? Math.round(task.completed / total * 100) : 0;
                progressFill.style.width = pct + '%';
                progressCount.textContent = `${task.completed}/${task.total}`;

                // 更新日志
                if (task.results) {
                    const lastResult = task.results[task.results.length - 1];
                    if (lastResult) {
                        const songInfo = (task.songs || []).find(s => s.id === lastResult.song_id);
                        const songName = songInfo ? songInfo.name : lastResult.song_id;
                        const statusClass = lastResult.success ? 'log-success' : 'log-error';
                        const statusIcon = lastResult.success ? '✅' : '❌';
                        const logEntry = `<div class="log-item ${statusClass}">${statusIcon} ${escapeHtml(songName)} - ${lastResult.success ? '下载完成' : (lastResult.error || '失败')}</div>`;
                        if (!progressLog.querySelector(`[data-sid="${lastResult.song_id}"]`)) {
                            const div = document.createElement('div');
                            div.innerHTML = logEntry;
                            div.firstElementChild.dataset.sid = lastResult.song_id;
                            progressLog.appendChild(div.firstElementChild);
                            progressLog.scrollTop = progressLog.scrollHeight;
                        }
                    }
                }

                if (task.status === 'completed') {
                    clearInterval(interval);
                    progressText.textContent = `下载完成！成功 ${task.success} 首，失败 ${task.failed} 首`;
                    startBatchBtn.disabled = false;
                    startBatchBtn.textContent = '开始随机下载';
                    showToast(`批量下载完成：成功 ${task.success} / ${task.total}`, 'success');
                }
            } catch (e) {
                // ignore
            }
        }, 1500);
    }

    // ==================== 单曲下载 ====================

    async function downloadSong(songId, songName, btn) {
        btn.classList.add('downloading');
        btn.textContent = '⏳';

        try {
            // 使用 fetch 下载
            const resp = await fetch(`/api/download/song?id=${songId}&quality=exhigh`);
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
            btn.textContent = '✅';
            showToast(`${songName} 下载完成`, 'success');

            setTimeout(() => { btn.textContent = '⬇'; }, 2000);
        } catch (err) {
            btn.classList.remove('downloading');
            btn.textContent = '⬇';
            showToast('下载失败: ' + err.message, 'error');
        }
    }

    // ==================== 本地曲库 ====================

    async function loadLibraryStats() {
        try {
            const resp = await fetch('/api/download/stats');
            const data = await resp.json();
            if (data.code === 200) {
                document.getElementById('libCount').textContent = data.count || 0;
                document.getElementById('libSize').textContent = (data.total_size_mb || 0) + ' MB';
                document.getElementById('libPath').textContent = data.download_dir || '-';
            }
        } catch (e) {
            // ignore
        }
    }

    document.getElementById('refreshLibrary').addEventListener('click', loadLibraryStats);

    // ==================== 工具函数 ====================

    function formatDuration(ms) {
        if (!ms) return '-';
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
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

})();
