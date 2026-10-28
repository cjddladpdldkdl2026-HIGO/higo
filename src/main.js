/* ============================================================================
 * main.js — entry point & game orchestration
 * Wires the world (3D), targets, UI, and storage together; owns the game state
 * machine (menu → playing → results), the input handlers, and the loop.
 * ========================================================================== */

import { ROUND_SECONDS, DIFF, SCENARIOS, ANATOMY_SCENARIOS, BONE3D_SCENARIOS } from './config.js';
import { Storage } from './storage.js';
import { createWorld } from './scene.js';
import { Targets } from './targets.js';
import { Anatomy } from './anatomy.js';
import { Bone3D } from './bone3d.js';
import { UI } from './ui.js';
import { MusicPlayer } from './music.js';

const canvas = document.getElementById('canvas');
const world = createWorld(canvas);
const targets = new Targets(world.scene);
const anatomy = new Anatomy(world.scene, world.camera);
const bone3d = new Bone3D();
const ui = new UI();
const music = new MusicPlayer(document.getElementById('bgm'));

// ── Persistent settings + run state ──────────────────────────────────────────
const settings = Storage.getSettings();

const state = {
  // The start screen only offers the 3D bone stages (the other scenarios are
  // still wired up but hidden in the menu).
  scenario: 'bones3d',
  difficulty: settings.difficulty,
  sensitivity: settings.sensitivity,
  players: settings.players,
  playing: false,
  // per-run
  score: 0, shots: 0, hits: 0, streak: 0, bestStreak: 0,
  reactTimes: [], get avgReact() {
    return this.reactTimes.length
      ? this.reactTimes.reduce((a, b) => a + b, 0) / this.reactTimes.length : 0;
  },
};

let timeLeft = ROUND_SECONDS;
let timerInterval = null;
let spawnInterval = null;

targets.configure(state.scenario, state.difficulty);
anatomy.configure(state.difficulty);

const isAnatomy = () => ANATOMY_SCENARIOS.has(state.scenario);
const roundSeconds = () =>
  SCENARIOS.find(s => s.id === state.scenario)?.seconds || ROUND_SECONDS;

anatomy.onPrompt = (landmark, lifeMs) => ui.setPrompt(landmark, lifeMs);
anatomy.onExpire = (landmark) => {
  // An unanswered question counts against accuracy like a wrong answer.
  state.shots++;
  state.streak = 0;
  ui.promptNote(`Time's up — ${landmark.name} is in green`, 'bad');
  ui.updateHUD(state);
};

// ── UI wiring ─────────────────────────────────────────────────────────────────
ui.init(state, {
  onScenario(id) {
    state.scenario = id;
    targets.configure(state.scenario, state.difficulty);
    Storage.saveSettings({ scenario: id });
    ui.setScenarioBlurb(id);
    ui.refreshBest(state.scenario, state.difficulty);
  },
  onDifficulty(id) {
    state.difficulty = id;
    targets.configure(state.scenario, state.difficulty);
    anatomy.configure(state.difficulty);
    Storage.saveSettings({ difficulty: id });
    ui.refreshBest(state.scenario, state.difficulty);
  },
  onPlayers(id) {
    state.players = id;
    Storage.saveSettings({ players: id });
  },
  onSensitivity(v) {
    state.sensitivity = v;
    Storage.saveSettings({ sensitivity: v });
  },
  onStart: startGame,
  onReset() { ui.refreshBest(state.scenario, state.difficulty); },
});

// ── Pointer lock & input ───────────────────────────────────────────────────────
const isLocked = () => document.pointerLockElement === canvas;

/* Anatomy scenarios keep the view still and aim with the free cursor: the
 * crosshair follows the mouse and shots raycast through that screen point. */
const cursorAim = () => state.playing && isAnatomy();
const crosshair = document.getElementById('crosshair');
const hitmarkerEl = document.getElementById('hitmarker');
const aim = { x: 0, y: 0 };

function setAim(x, y) {
  aim.x = x; aim.y = y;
  for (const el of [crosshair, hitmarkerEl]) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }
}

function resetAim() {
  for (const el of [crosshair, hitmarkerEl]) el.style.left = el.style.top = '';
}

document.addEventListener('mousemove', (e) => {
  if (cursorAim()) { setAim(e.clientX, e.clientY); return; }
  if (!isLocked()) return;
  world.addLook(e.movementX, e.movementY, state.sensitivity);
});

document.addEventListener('pointerlockchange', () => {
  if (state.playing && !isAnatomy()) ui.setPaused(!isLocked());
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cursorAim()) endGame();
});

canvas.addEventListener('mousedown', (e) => {
  if (cursorAim()) {
    if (e.button !== 0) return;
    setAim(e.clientX, e.clientY);
    shoot();
    return;
  }
  if (touchMode) return;                 // touch devices use the touch handlers
  if (e.button !== 0 || !state.playing) return;
  if (!isLocked()) { canvas.requestPointerLock(); return; }
  shoot();
});

window.addEventListener('resize', () => world.resize());

/* ── Touch / mobile controls ───────────────────────────────────────────────────
 * Pointer lock doesn't exist on touch devices, so on a coarse pointer we switch
 * to a mobile control scheme: drag anywhere on the view to look, a quick tap (or
 * the on-screen FIRE button) to shoot, and an EXIT button to bail out early.   */
const touchMode =
  window.matchMedia('(pointer: coarse)').matches ||
  ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const fireBtn = document.getElementById('fire-btn');
const quitBtn = document.getElementById('quit-btn');
const TOUCH_SENS = 1.6;                   // touch drags feel better a bit faster

let lookId = null, lastX = 0, lastY = 0, startT = 0, moved = 0;

if (touchMode) {
  document.body.classList.add('touch');

  canvas.addEventListener('touchstart', (e) => {
    if (!state.playing) return;
    if (lookId === null) {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastX = t.clientX; lastY = t.clientY;
      startT = performance.now(); moved = 0;
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!state.playing || lookId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      lastX = t.clientX; lastY = t.clientY;
      moved += Math.hypot(dx, dy);
      if (cursorAim()) setAim(t.clientX, t.clientY);
      else world.addLook(dx, dy, state.sensitivity * TOUCH_SENS);
    }
    e.preventDefault();
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      // A short, near-stationary touch counts as a tap-to-fire.
      if (state.playing && moved < 14 && performance.now() - startT < 260) {
        if (cursorAim()) setAim(t.clientX, t.clientY);
        shoot();
      }
      lookId = null;
    }
  };
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', () => { lookId = null; }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state.playing) shoot();
  }, { passive: false });

  quitBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state.playing) endGame();
  }, { passive: false });

  // Tailor the menu copy for touch.
  const hint = document.querySelector('.footer-row .hint');
  if (hint) hint.textContent = 'Drag to aim · tap or FIRE to shoot · best in landscape.';
  ui.el.start.textContent = 'Game Start';
}

// ── Game lifecycle ─────────────────────────────────────────────────────────────
/* The 3D bone stages run in their own overlay with their own loop; the FPS
 * world just idles behind them until the run ends. */
bone3d.onEnd = ({ players, difficulty, scores, stagesCleared, completed }) => {
  ui.showMenu();
  const progress = completed ? 'All 5 bones cleared' : `${stagesCleared} / 5 bones cleared`;
  if (players === 2) {
    ui.showDuelResults(scores);
  } else {
    const s = scores[0];
    const run = { scenario: state.scenario, difficulty, ...s, ts: Date.now() };
    const { records } = Storage.recordRun(run);
    ui.showResults(run, records);
    ui.refreshBest(state.scenario, state.difficulty);
  }
  ui.el.sub.textContent = progress;
  ui.el.start.textContent = 'Game Start';
};

function startBone3D() {
  // Drop focus from the start button so P2's Enter/Space can't re-click it.
  document.activeElement?.blur();
  ui.hideMenu();
  ui.el.hud.classList.add('hide');
  ui.clearResults();
  bone3d.start({
    players: state.players === '2' ? 2 : 1,
    difficulty: state.difficulty,
  });
}

function startGame() {
  if (BONE3D_SCENARIOS.has(state.scenario)) { startBone3D(); return; }

  // reset run state
  Object.assign(state, {
    playing: true, score: 0, shots: 0, hits: 0, streak: 0, bestStreak: 0, reactTimes: [],
  });
  timeLeft = roundSeconds();

  targets.configure(state.scenario, state.difficulty);
  targets.clear();
  anatomy.stop();
  world.resetLook(isAnatomy() ? anatomy.aimPitch : 0);
  // The gun would cover the lower-right of the bone board.
  world.setWeaponVisible(!isAnatomy());

  ui.hideMenu();
  ui.clearResults();
  ui.updateHUD(state);
  ui.setTimer(timeLeft);
  ui.el.start.textContent = 'Run It Back';

  if (isAnatomy()) {
    // Free cursor aiming: no pointer lock, crosshair starts at screen centre.
    document.body.classList.add('cursor-aim');
    setAim(window.innerWidth / 2, window.innerHeight / 2);
    if (touchMode) quitBtn.classList.remove('hide');
  } else if (touchMode) {
    fireBtn.classList.remove('hide');
    quitBtn.classList.remove('hide');
  } else {
    canvas.requestPointerLock();
  }

  if (isAnatomy()) {
    anatomy.start();
  } else {
    // seed the field
    const seed = state.scenario === 'flick' ? 1 : DIFF[state.difficulty].count;
    for (let i = 0; i < seed; i++) targets.spawn();
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    ui.setTimer(timeLeft);
    if (timeLeft <= 0) endGame();
  }, 1000);

  // keep tracking/flick fields topped up
  clearInterval(spawnInterval);
  spawnInterval = setInterval(() => { if (state.playing && !isAnatomy()) targets.refill(); }, 280);
}

function endGame() {
  state.playing = false;
  clearInterval(timerInterval);
  clearInterval(spawnInterval);
  targets.clear();
  anatomy.stop();
  ui.hidePrompt();
  document.body.classList.remove('cursor-aim');
  resetAim();
  if (isLocked()) document.exitPointerLock();
  ui.setPaused(false);
  lookId = null;
  fireBtn.classList.add('hide');
  quitBtn.classList.add('hide');

  const run = {
    scenario: state.scenario,
    difficulty: state.difficulty,
    score: state.score,
    accuracy: state.shots > 0 ? Math.round((state.hits / state.shots) * 100) : 0,
    avgReact: Math.round(state.avgReact),
    bestStreak: state.bestStreak,
    ts: Date.now(),
  };

  const { records } = Storage.recordRun(run);
  ui.showResults(run, records);
  ui.refreshBest(state.scenario, state.difficulty);
  ui.showMenu();
}

function shoot() {
  if (isAnatomy()) { shootAnatomy(); return; }
  state.shots++;
  world.kickRecoil();
  const hit = targets.resolveHit(world.raycastCenter(targets.meshes));

  if (hit) {
    const rt = performance.now() - hit.born;
    state.reactTimes.push(rt);
    state.hits++;
    state.score += scoreFor(rt);
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    if (state.streak > 1) ui.combo(state.streak);
    ui.hitmarker();
    targets.remove(hit);
    if (state.scenario !== 'tracking') targets.spawn();
  } else {
    state.streak = 0;
    ui.miss();
  }
  ui.updateHUD(state);
}

function shootAnatomy() {
  const { result, target, struck, rt } = anatomy.judge(world.raycastAt(aim.x, aim.y, anatomy.meshes));
  if (result === 'busy') return;          // answer still on show
  if (result === 'miss') {
    // Clicked off every target: no answer given, the question stays up.
    ui.promptNote('Shoot one of the targets', '');
    return;
  }

  state.shots++;
  if (result === 'hit') {
    state.reactTimes.push(rt);
    state.hits++;
    state.score += scoreFor(rt);
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    if (state.streak > 1) ui.combo(state.streak);
    ui.hitmarker();
    ui.promptNote('✓ ' + target.name, 'good');
  } else {
    // A decoy: the real target lights up green before the next question.
    state.streak = 0;
    ui.miss();
    ui.promptNote(`✗ That's the ${struck.name} — answer in green`, 'bad');
  }
  ui.updateHUD(state);
}

function scoreFor(rt) {
  const base = Math.max(10, Math.round(1000 / (rt / 500)));
  return Math.round(base * DIFF[state.difficulty].mult);
}

// ── Master loop ──────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  targets.update(now, dt, state.playing);
  anatomy.update(now, dt, state.playing);
  world.update(now, dt, state.playing);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
