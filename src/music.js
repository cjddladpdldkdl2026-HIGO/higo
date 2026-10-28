/* ============================================================================
 * music.js — background music player (bottom-left corner widget)
 * Plays TRACKS from playlist.js through one <audio> element. Nothing plays
 * until the player presses ▶ (browsers block autoplay); after that the
 * choice, volume and current track are remembered via Storage. Independent of
 * the sound-effects mute (M key), so BGM and SFX can be toggled separately.
 * ========================================================================== */

import { TRACKS } from './playlist.js';
import { Storage } from './storage.js';

export class MusicPlayer {
  constructor(root) {
    this.root = root;
    this.$ = (sel) => root.querySelector(sel);
    this.audio = new Audio();
    this.audio.preload = 'none';
    const saved = Storage.getSettings().bgm || {};
    this.index = Math.min(saved.index || 0, Math.max(0, TRACKS.length - 1));
    this.audio.volume = saved.volume ?? 0.4;
    this.failures = 0;   // consecutive unplayable tracks, to stop skipping forever

    this.$('#bgm-vol').value = this.audio.volume;
    this.$('#bgm-next').classList.toggle('hide', TRACKS.length < 2);
    this._bind();
    this._load(this.index);
    this._render();
  }

  get playing() { return !this.audio.paused; }

  toggle() {
    if (!TRACKS.length) return;
    if (this.playing) this.audio.pause();
    else this._play();
  }

  next() {
    if (!TRACKS.length) return;
    const wasPlaying = this.playing;
    this._load((this.index + 1) % TRACKS.length);
    if (wasPlaying) this._play();
  }

  /* ── internals ──────────────────────────────────────────────────────────── */

  _load(i) {
    this.index = i;
    const t = TRACKS[i];
    if (!t) return;
    this.audio.src = t.src;
    // A single track repeats; a list advances on 'ended'.
    this.audio.loop = TRACKS.length === 1;
    this._save();
    this._render();
  }

  _play() {
    this.audio.play().then(() => { this.failures = 0; }).catch(() => this._render());
  }

  _bind() {
    this.$('#bgm-play').addEventListener('click', (e) => { this.toggle(); e.currentTarget.blur(); });
    this.$('#bgm-next').addEventListener('click', (e) => { this.next(); e.currentTarget.blur(); });
    this.$('#bgm-vol').addEventListener('input', (e) => {
      this.audio.volume = parseFloat(e.target.value);
      this._save();
    });
    this.audio.addEventListener('play', () => this._render());
    this.audio.addEventListener('pause', () => this._render());
    this.audio.addEventListener('ended', () => this.next());
    // Missing or unreadable file: try the next one, but give up after a full lap.
    this.audio.addEventListener('error', () => {
      this.failures++;
      if (this.failures >= TRACKS.length) { this._render('No music file'); return; }
      this._load((this.index + 1) % TRACKS.length);
      this._play();
    });
  }

  _save() {
    Storage.saveSettings({ bgm: { index: this.index, volume: this.audio.volume } });
  }

  _render(status) {
    const t = TRACKS[this.index];
    this.$('#bgm-play').textContent = this.playing ? '⏸' : '▶';
    this.$('#bgm-play').setAttribute('aria-label', this.playing ? 'Pause music' : 'Play music');
    this.$('#bgm-title').textContent = status || (t ? `${t.title} — ${t.artist}` : 'No tracks');
    this.root.classList.toggle('playing', this.playing);
  }
}
