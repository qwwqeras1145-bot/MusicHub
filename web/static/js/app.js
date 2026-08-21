/**
 * MusicHub v4.1 - Main App JS (No login required)
 */
(function () {
    'use strict';
    const API = '';
    function $(id) { return document.getElementById(id); }
    function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function formatDuration(ms) { if (!ms) return '-'; const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
    function showToast(msg, type='info') {
        const t = document.createElement('div');
        t.className = `toast ${type}`; t.textContent = msg;
        document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
    }

    // ==================== Tab Navigation ====================
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + target));
            if (target === 'hot') loadHotList();
            if (target === 'library') loadLibraryStats();
        });
    });

    // ==================== Search ====================
    const searchInput = $('searchInput');
    const suggestions = $('searchSuggestions');
    let searchTimeout = null;

    $('searchBtn').addEventListener('click', doSearch);
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
        console.log('doSearch called');
        const kw = searchInput.value.trim();
        console.log('Search keyword:', kw);
        if (!kw) {
            console.log('Empty keyword, returning');
            return;
        }
        $('searchResults').innerHTML = '<div class="loading">搜索中...</div>';
        suggestions.classList.add('hidden');
        try {
            const url = `${API}/api/search?q=${encodeURIComponent(kw)}&limit=50`;
            console.log('Fetching:', url);
            const r = await fetch(url);
            console.log('Response status:', r.status);
            const d = await r.json();
            console.log('Response data:', d);
            console.log('Code:', d.code, 'Songs:', d.songs?.length);
            if (d.code !== 200 || !d.songs?.length) {
                console.log('No results or error');
                $('searchResults').innerHTML = '<div class="empty-state"><p>没有找到相关歌曲</p></div>';
                return;
            }
            console.log('Rendering', d.songs.length, 'songs');
            renderSongList(d.songs, $('searchResults'));
            showToast(`找到 ${d.total || d.songs.length} 首`, 'success');
        } catch (err) {
            console.error('Search error:', err);
            $('searchResults').innerHTML = '<div class="empty-state"><p>搜索失败</p></div>';
        }
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
                    const a = document.createElement('a'); a.href = d.url; a.download = `${songName}.mp3`; a.target = '_blank';
                    document.body.appendChild(a); a.click(); a.remove();
                    btn.classList.remove('downloading'); btn.innerHTML = checkSvg; btn.style.color = '#1db954';
                    showToast(`${songName} 下载完成`, 'success');
                    setTimeout(() => { btn.innerHTML = dlSvg; btn.style.color = ''; }, 2000); return;
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
    document.querySelectorAll('.hot-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.hot-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active'); loadHotList(tab.dataset.list);
        });
    });

    async function loadHotList(listId = 3778678) {
        $('hotList').innerHTML = '<div class="loading">加载中...</div>';
        try {
            const r = await fetch(`${API}/api/toplist/detail?id=${listId}`);
            const d = await r.json();
            if (d.code !== 200 || !d.songs?.length) { $('hotList').innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; return; }
            renderSongList(d.songs, $('hotList'));
        } catch { $('hotList').innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; }
    }

    // ==================== Batch Download ====================
    const batchCount = $('batchCount');
    const batchMode = $('batchMode');
    const batchModeHint = $('batchModeHint');
    
    $('countMinus').addEventListener('click', () => { batchCount.value = Math.max(1, parseInt(batchCount.value)-1); });
    $('countPlus').addEventListener('click', () => { batchCount.value = Math.min(200, parseInt(batchCount.value)+1); });
    document.querySelectorAll('.quick-counts button').forEach(btn => { btn.addEventListener('click', () => { batchCount.value = btn.dataset.count; }); });
    
    // Update hint text when mode changes
    batchMode.addEventListener('change', () => {
        if (batchMode.value === 'direct') {
            batchModeHint.textContent = '歌曲直接从网易云下载到您的设备，不占用服务器空间';
        } else {
            batchModeHint.textContent = '歌曲先下载到服务器缓存，再从服务器下载到您的设备（受空间限制）';
        }
    });

    const startBatchBtn = $('startBatchDownload');
    const batchProgress = $('batchProgress');

    startBatchBtn.addEventListener('click', async () => {
        const count = parseInt(batchCount.value) || 5;
        const quality = $('batchQuality').value;
        const mode = batchMode.value; // 'direct' or 'cache'
        
        startBatchBtn.disabled = true; startBatchBtn.textContent = '获取歌曲...';
        batchProgress.classList.remove('hidden');
        $('progressLog').innerHTML = '';
        $('progressFill').style.width = '0%';
        $('progressText').textContent = '获取中...';
        $('progressCount').textContent = '0/'+count;
        
        try {
            const r = await fetch(`${API}/api/download/random`, { 
                method:'POST', 
                headers:{'Content-Type':'application/json'}, 
                body: JSON.stringify({count, quality, mode}) 
            });
            const d = await r.json();
            
            if (d.code !== 200) { 
                $('progressText').textContent = '失败: '+(d.msg||''); 
                startBatchBtn.disabled=false; 
                startBatchBtn.textContent='开始随机下载'; 
                return; 
            }
            
            // Check if direct mode
            if (d.mode === 'direct') {
                // Direct mode: download files one by one to user's device
                const songs = d.songs || [];
                $('progressLog').innerHTML = songs.map(s=>`<div class="log-item">🎵 ${escapeHtml(s.name)} - ${escapeHtml(s.artist)}</div>`).join('');
                $('progressText').textContent = '正在下载到您的设备...';
                
                // Download each song using fetch + blob (works on mobile)
                let successCount = 0;
                for (let i = 0; i < songs.length; i++) {
                    const song = songs[i];
                    try {
                        $('progressCount').textContent = `${i+1}/${songs.length}`;
                        $('progressFill').style.width = Math.round((i+1)/songs.length*100)+'%';
                        
                        // Fetch the file as blob, then trigger download
                        const resp = await fetch(song.url);
                        if (!resp.ok) throw new Error('下载失败');
                        const blob = await resp.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = `${song.name} - ${song.artist}.mp3`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        
                        // Clean up blob URL after a short delay
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                        
                        successCount++;
                        const div = document.createElement('div');
                        div.innerHTML = `<div class="log-item log-success" data-sid="${song.id}">✅ ${escapeHtml(song.name)}</div>`;
                        $('progressLog').appendChild(div.firstElementChild);
                        $('progressLog').scrollTop = $('progressLog').scrollHeight;
                        
                        // Delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 800));
                    } catch (err) {
                        const div = document.createElement('div');
                        div.innerHTML = `<div class="log-item log-error" data-sid="${song.id}">❌ ${escapeHtml(song.name)}: ${err.message}</div>`;
                        $('progressLog').appendChild(div.firstElementChild);
                        $('progressLog').scrollTop = $('progressLog').scrollHeight;
                    }
                }
                
                $('progressText').textContent = `完成！成功下载 ${successCount} 首到设备`;
                startBatchBtn.disabled = false; 
                startBatchBtn.textContent = '开始随机下载';
                showToast(`批量下载完成：${successCount} 首已保存到设备`, 'success');
            } else {
                // Cache mode: poll for progress
                const songs = d.songs||[];
                $('progressLog').innerHTML = songs.map(s=>`<div class="log-item">🎵 ${escapeHtml(s.name)} - ${escapeHtml(s.artist)}</div>`).join('');
                $('progressText').textContent = '下载中...';
                pollProgress(d.task_id, count);
            }
        } catch (err) { 
            $('progressText').textContent='失败: '+err.message; 
            startBatchBtn.disabled=false; 
            startBatchBtn.textContent='开始随机下载'; 
        }
    });

    function pollProgress(taskId, total) {
        const iv = setInterval(async () => {
            try {
                const r = await fetch(`${API}/api/download/status?task_id=${taskId}`);
                const d = await r.json();
                const t = d.task; if (!t) { clearInterval(iv); return; }
                $('progressFill').style.width = Math.round(t.completed/total*100)+'%';
                $('progressCount').textContent = `${t.completed}/${t.total}`;
                if (t.results) {
                    const last = t.results[t.results.length-1];
                    if (last && !$('progressLog').querySelector(`[data-sid="${last.song_id}"]`)) {
                        const si = (t.songs||[]).find(s=>s.id===last.song_id);
                        const name = si ? si.name : last.song_id;
                        const cls = last.success?'log-success':'log-error';
                        const icon = last.success?'✅':'❌';
                        const div = document.createElement('div');
                        div.innerHTML = `<div class="log-item ${cls}" data-sid="${last.song_id}">${icon} ${escapeHtml(name)}</div>`;
                        $('progressLog').appendChild(div.firstElementChild);
                        $('progressLog').scrollTop = $('progressLog').scrollHeight;
                    }
                }
                if (t.status === 'completed') {
                    clearInterval(iv);
                    $('progressText').textContent = `完成！成功 ${t.success} 首，失败 ${t.failed} 首`;
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
})();
