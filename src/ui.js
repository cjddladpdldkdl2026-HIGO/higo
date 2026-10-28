/* ============================================================================
 * ui.js — all DOM rendering & feedback
 * Builds the menu controls, renders HUD / results / stats, and fires the
 * transient hit/miss/combo feedback. Holds no game state; main.js calls in.
 * ========================================================================== */

import { SCENARIOS, DIFFICULTIES, PLAYERS, BONE3D_SCENARIOS } from './config.js';
import { Storage } from './storage.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

export class UI {
  constructor() {
    this.el = {
      overlay: $('overlay'), sub: $('overlay-sub'), results: $('results-area'),
      scenario: $('scenario'), difficulty: $('difficulty'), blurb: $('scenario-blurb'),
      sens: $('sens-slider'), sensOut: $('sens-readout'),
      bestBadge: $('best-badge'), bestScore: $('best-score'),
      start: $('start-btn'), statsBtn: $('stats-btn'),
      hud: $('hud'), score: $('score-val'), acc: $('acc-val'), streak: $('streak-val'),
      react: $('react-val'), timer: $('timer-val'),
      combo: $('combo-flash'), hit: $('hitmarker'), miss: $('miss-flash'),
      pause: $('pause-hint'),
      prompt: $('prompt'), promptName: $('prompt-name'), promptKo: $('prompt-ko'),
      promptBar: $('prompt-bar-fill'), promptNote: $('prompt-note'),
      modal: $('stats-modal'), modalBody: $('stats-body'),
      statsClose: $('stats-close'), statsReset: $('stats-reset'),
    };
    this._flashTO = null; this._hitTO = null;
  }

  /** Build segmented controls from config and wire callbacks. */
  init(state, handlers) {
    this._buildSeg(this.el.scenario, SCENARIOS, state.scenario, (id) => {
      handlers.onScenario(id);
    });
    this._buildSeg(this.el.difficulty, DIFFICULTIES, state.difficulty, (id) => {
      handlers.onDifficulty(id);
    });
    this._buildSeg($('players'), PLAYERS, state.players, (id) => {
      handlers.onPlayers(id);
    });

    this.el.sens.value = state.sensitivity;
    this.el.sensOut.textContent = (+state.sensitivity).toFixed(2);
    this.el.sens.addEventListener('input', () => {
      this.el.sensOut.textContent = (+this.el.sens.value).toFixed(2);
      handlers.onSensitivity(parseFloat(this.el.sens.value));
    });

    this.el.start.addEventListener('click', handlers.onStart);
    this.el.statsBtn.addEventListener('click', () => this.openStats());
    this.el.statsClose.addEventListener('click', () => this.closeStats());
    this.el.modal.addEventListener('click', (e) => { if (e.target === this.el.modal) this.closeStats(); });
    this.el.statsReset.addEventListener('click', () => {
      Storage.reset();
      this.renderStats();
      handlers.onReset();
    });

    this.setScenarioBlurb(state.scenario);
    this.refreshBest(state.scenario, state.difficulty);
  }

  _buildSeg(container, items, active, onPick) {
    container.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.dataset.id = it.id;
      if (it.id === active) b.classList.add('active');
      b.addEventListener('click', () => {
        container.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        onPick(it.id);
      });
      container.appendChild(b);
    }
  }

  setScenarioBlurb(id) {
    const s = SCENARIOS.find(s => s.id === id);
    this.el.blurb.textContent = s ? s.blurb : '';
    $('players-field').classList.toggle('hide', !BONE3D_SCENARIOS.has(id));
  }

  refreshBest(scenario, difficulty) {
    const best = Storage.getBest(scenario, difficulty);
    if (best && best.score > 0) {
      this.el.bestScore.textContent = fmt(best.score);
      this.el.bestBadge.classList.remove('hide');
    } else {
      this.el.bestBadge.classList.add('hide');
    }
  }

  /* ── Overlay show/hide ───────────────────────────────────────────────────── */
  showMenu() {
    this.el.overlay.style.display = 'flex';
    this.el.hud.classList.add('hide');
    this.el.pause.classList.add('hide');
  }
  hideMenu() {
    this.el.overlay.style.display = 'none';
    this.el.hud.classList.remove('hide');
  }
  setPaused(paused) {
    this.el.pause.classList.toggle('hide', !paused);
  }

  /* ── HUD ─────────────────────────────────────────────────────────────────── */
  updateHUD(s) {
    this.el.score.textContent = fmt(s.score);
    this.el.acc.textContent = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) + '%' : '—';
    this.el.streak.textContent = s.streak;
    this.el.react.textContent = s.avgReact > 0 ? Math.round(s.avgReact) + 'ms' : '—';
  }
  setTimer(t) { this.el.timer.textContent = t; }

  /* ── Feedback ────────────────────────────────────────────────────────────── */
  hitmarker() {
    this.el.hit.style.opacity = '1';
    this.el.hit.style.transform = 'translate(-50%,-50%) scale(1)';
    clearTimeout(this._hitTO);
    this._hitTO = setTimeout(() => {
      this.el.hit.style.opacity = '0';
      this.el.hit.style.transform = 'translate(-50%,-50%) scale(1.4)';
    }, 90);
  }
  miss() {
    this.el.miss.style.opacity = '1';
    setTimeout(() => { this.el.miss.style.opacity = '0'; }, 120);
  }
  combo(n) {
    this.el.combo.textContent = n + '× STREAK';
    this.el.combo.style.opacity = '1';
    clearTimeout(this._flashTO);
    this._flashTO = setTimeout(() => { this.el.combo.style.opacity = '0'; }, 700);
  }

  /* ── Anatomy prompt ──────────────────────────────────────────────────────── */
  setPrompt(landmark, lifeMs) {
    this.el.promptName.textContent = landmark.name;
    this.el.promptKo.textContent = landmark.ko;
    this.el.prompt.classList.remove('hide');
    // Restart the countdown bar animation for this prompt's lifetime.
    const bar = this.el.promptBar;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;
    bar.style.transition = `transform ${lifeMs}ms linear`;
    bar.style.transform = 'scaleX(0)';
  }
  promptNote(text, kind) {
    const n = this.el.promptNote;
    n.textContent = text;
    n.className = 'prompt-note show ' + (kind || '');
    clearTimeout(this._noteTO);
    this._noteTO = setTimeout(() => { n.className = 'prompt-note'; }, 1400);
  }
  hidePrompt() { this.el.prompt.classList.add('hide'); }

  /* ── Results screen ──────────────────────────────────────────────────────── */
  showResults(run, records) {
    this.el.sub.textContent = 'Round complete';
    const cell = (label, value, isRec) =>
      `<div class="res ${isRec ? 'record' : ''}">
         ${isRec ? '<span class="pb">PB</span>' : ''}
         <span>${label}</span><strong>${value}</strong>
       </div>`;
    this.el.results.innerHTML = `
      <div class="results">
        <p class="results-title">${records.score ? '★ New Personal Best ★' : 'Run Summary'}</p>
        <div class="results-grid">
          ${cell('Score', fmt(run.score), records.score)}
          ${cell('Accuracy', run.accuracy + '%', records.accuracy)}
          ${cell('Avg React', (run.avgReact || 0) + 'ms', records.avgReact)}
          ${cell('Best Streak', run.bestStreak, false)}
        </div>
      </div>`;
    this.el.start.textContent = 'Run It Back';
  }
  clearResults() { this.el.results.innerHTML = ''; }

  /** Head-to-head summary for a 2-player 3D round. */
  showDuelResults(scores) {
    this.el.sub.textContent = 'Round complete';
    const [a, b] = scores;
    const title = a.score === b.score ? 'Draw' : (a.score > b.score ? '★ P1 Wins ★' : '★ P2 Wins ★');
    const col = (label, s, win) =>
      `<div class="res ${win ? 'record' : ''}">
         <span>${label}</span><strong>${fmt(s.score)}</strong>
         <span>${s.hits} hits · ${s.accuracy}% · ${s.avgReact || 0}ms</span>
       </div>`;
    this.el.results.innerHTML = `
      <div class="results">
        <p class="results-title">${title}</p>
        <div class="results-grid">
          ${col('P1 · Mouse', a, a.score > b.score)}
          ${col('P2 · Keyboard', b, b.score > a.score)}
        </div>
      </div>`;
    this.el.start.textContent = 'Rematch';
  }

  /* ── Stats modal ─────────────────────────────────────────────────────────── */
  openStats() { this.renderStats(); this.el.modal.classList.remove('hide'); }
  closeStats() { this.el.modal.classList.add('hide'); }

  renderStats() {
    const rows = [];
    for (const s of SCENARIOS) {
      for (const d of DIFFICULTIES) {
        const b = Storage.getBest(s.id, d.id);
        if (b && b.plays > 0) {
          rows.push(`<tr>
            <td class="k">${s.label} · ${d.label}</td>
            <td class="num">${fmt(b.score)}</td>
            <td>${b.accuracy}%</td>
            <td>${b.avgReact ? b.avgReact + 'ms' : '—'}</td>
            <td>${b.plays}</td>
          </tr>`);
        }
      }
    }
    const history = Storage.getHistory(8).map(h => {
      const sc = SCENARIOS.find(x => x.id === h.scenario)?.label || h.scenario;
      const dl = DIFFICULTIES.find(x => x.id === h.difficulty)?.label || h.difficulty;
      const when = new Date(h.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<tr><td class="k">${sc} · ${dl}</td><td class="num">${fmt(h.score)}</td>
              <td>${h.accuracy}%</td><td>${h.avgReact || '—'}ms</td><td>${when}</td></tr>`;
    });

    this.el.modalBody.innerHTML = `
      <div class="stat-group">
        <h3>Personal Bests</h3>
        ${rows.length ? `<table class="rec-table">
          <thead><tr><th>Mode</th><th>Score</th><th>Acc</th><th>React</th><th>Plays</th></tr></thead>
          <tbody>${rows.join('')}</tbody></table>`
          : `<p class="empty-note">No records yet — play a round to set one.</p>`}
      </div>
      <div class="stat-group">
        <h3>Recent Runs</h3>
        ${history.length ? `<table class="rec-table">
          <thead><tr><th>Mode</th><th>Score</th><th>Acc</th><th>React</th><th>When</th></tr></thead>
          <tbody>${history.join('')}</tbody></table>`
          : `<p class="empty-note">No runs logged yet.</p>`}
      </div>`;
  }
}
