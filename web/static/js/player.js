/**
 * MusicHub 播放器模块
 * 负责音频播放、暂停、进度控制、音量调节
 */
class Player {
    constructor() {
        this.audio = document.getElementById('audioPlayer');
        this.playBtn = document.getElementById('playBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.progressTrack = document.getElementById('progressTrack');
        this.progressCurrent = document.getElementById('progressCurrent');
        this.currentTimeEl = document.getElementById('currentTime');
        this.totalTimeEl = document.getElementById('totalTime');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.titleEl = document.getElementById('playerTitle');
        this.artistEl = document.getElementById('playerArtist');
        this.coverEl = document.getElementById('playerCover');

        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.currentSong = null;

        this._bindEvents();
    }

    _bindEvents() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());

        this.audio.addEventListener('timeupdate', () => this._updateProgress());
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('loadedmetadata', () => {
            this.totalTimeEl.textContent = this._formatTime(this.audio.duration);
        });
        this.audio.addEventListener('error', (e) => {
            console.error('音频播放错误:', e);
            this._showToast('播放失败，尝试下一首', 'error');
            setTimeout(() => this.next(), 1500);
        });

        // 进度条点击
        this.progressTrack.addEventListener('click', (e) => {
            const rect = this.progressTrack.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (this.audio.duration) {
                this.audio.currentTime = pct * this.audio.duration;
            }
        });

        // 音量控制
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            this._updateVolumeIcon();
        });

        this.volumeBtn.addEventListener('click', () => {
            if (this.audio.volume > 0) {
                this.audio.volume = 0;
                this.volumeSlider.value = 0;
            } else {
                this.audio.volume = 0.8;
                this.volumeSlider.value = 80;
            }
            this._updateVolumeIcon();
        });

        // 初始音量
        this.audio.volume = 0.8;
    }

    setPlaylist(songs) {
        this.playlist = songs;
    }

    play(song, index = -1) {
        if (!song) return;

        this.currentSong = song;
        if (index >= 0) this.currentIndex = index;

        // 更新 UI
        this.titleEl.textContent = song.name;
        this.artistEl.textContent = song.artist_names || '';

        // 设置封面
        const coverUrl = song.album?.pic || '';
        if (coverUrl) {
            this.coverEl.innerHTML = `<img src="${coverUrl}" alt="cover">`;
        } else {
            this.coverEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>`;
        }

        // 获取播放链接并播放
        this._loadAndPlay(song.id);

        // 高亮当前播放歌曲
        document.querySelectorAll('.song-item').forEach(el => {
            el.classList.toggle('playing', el.dataset.id == song.id);
        });
    }

    async _loadAndPlay(songId) {
        try {
            const resp = await fetch(`/api/song/url?ids=${songId}&br=320000`);
            const data = await resp.json();

            let url = null;
            if (data.code === 200 && data.urls && data.urls.length > 0) {
                url = data.urls[0].url;
            }

            if (!url) {
                // 尝试直链
                url = `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;
            }

            this.audio.src = url;
            this.audio.play();
            this.isPlaying = true;
            this.playBtn.textContent = '⏸';
        } catch (err) {
            console.error('获取播放链接失败:', err);
            this._showToast('获取播放链接失败', 'error');
        }
    }

    togglePlay() {
        if (!this.audio.src) return;

        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
            this.playBtn.textContent = '▶';
        } else {
            this.audio.play();
            this.isPlaying = true;
            this.playBtn.textContent = '⏸';
        }
    }

    prev() {
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.play(this.playlist[this.currentIndex], this.currentIndex);
    }

    next() {
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        this.play(this.playlist[this.currentIndex], this.currentIndex);
    }

    _updateProgress() {
        if (!this.audio.duration) return;
        const pct = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressCurrent.style.width = pct + '%';
        this.currentTimeEl.textContent = this._formatTime(this.audio.currentTime);
    }

    _updateVolumeIcon() {
        const vol = this.audio.volume;
        if (vol === 0) this.volumeBtn.textContent = '🔇';
        else if (vol < 0.5) this.volumeBtn.textContent = '🔉';
        else this.volumeBtn.textContent = '🔊';
    }

    _formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// 全局播放器实例
const player = new Player();
