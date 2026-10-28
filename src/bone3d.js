/* ============================================================================
 * bone3d.js — 3D bone stages (1P or split-screen 2P)
 * Plays the bones in bones.js (STAGES) one after another. Each stage asks a
 * set of landmarks on one 3D bone: the bone turns to face the landmark and
 * identical targets appear on the real landmark and on decoy landmarks. The
 * first player to shoot the real one scores; shooting a decoy costs points
 * but play goes on. In 1P a stage is cleared at CLEAR_RATE correct and
 * retried otherwise; in 2P every stage is played once and the totals decide.
 * P1 aims with the mouse, P2 with the keyboard. Runs its own renderers and
 * loop inside the #arena overlay, so it never touches the FPS world.
 * ========================================================================== */

import * as THREE from 'three';
import { STAGES } from './bones.js';
import { Sfx } from './sfx.js';

// Per-difficulty tuning: `radius` is the target radius in mm for a
// scapula-sized bone (scaled per bone), `life` is ms per question, `mult`
// scales points, `decoys` is how many fake targets join the real one.
export const BONE3D_DIFF = {
  easy:   { radius: 7.5, life: 8000, mult: 1.0, decoys: 2 },
  medium: { radius: 5.5, life: 6000, mult: 1.5, decoys: 4 },
  hard:   { radius: 4.0, life: 4000, mult: 2.0, decoys: 4 },
};

const QUESTIONS_PER_STAGE = 8;
const CLEAR_RATE = 0.6;   // share of a stage's questions needed to clear it (1P)
const CARD_MS = 1800;     // stage title / result card

const TURN_MS = 450;      // bone turning to face the new landmark
const REVEAL_MS = 900;    // answer shown before the next question
const WRONG_PENALTY = 150; // points lost for shooting a decoy (× difficulty mult)
const KEY_SPEED = [260, 950]; // P2 crosshair px/s: start → full after ramp
const KEY_RAMP = 0.45;    // s to reach full speed
const ROT_SPEED = 2.2;    // rad/s for keyboard rotation
const REF_RADIUS = 95;    // bounding radius (mm) the target radius is tuned for

const TARGET_COLOR = '#2de2e6';
const RIGHT_COLOR = '#39ff88';
const WRONG_COLOR = '#ff3d6e';

// Mesh axes → three.js (y up, +z toward the camera = anterior).
const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);

/* ── One player's view ────────────────────────────────────────────────────── */

class View {
  constructor(el) {
    this.el = el;
    // Fresh canvas per game so each renderer gets its own WebGL context.
    this.canvas = document.createElement('canvas');
    el.querySelector('canvas').replaceWith(this.canvas);
    this.cross = el.querySelector('.v-cross');
    this.note = el.querySelector('.v-note');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 10, 4000);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a0a45, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(120, 160, 300);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x2de2e6, 0.8);
    rim.position.set(-200, 60, -200);
    this.scene.add(rim);

    this.bone = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({
      color: 0xeadfc6, roughness: 0.72, metalness: 0.02,
    }));
    this.scene.add(this.bone);
    this.center = new THREE.Vector3();
    this.boneRadius = REF_RADIUS;

    this.targets = [];   // one per answer option: real + decoys

    // Orientation (yaw about vertical, then pitch) with smooth turning.
    this.yaw = 0; this.pitch = 0;
    this.from = { yaw: 0, pitch: 0 }; this.to = { yaw: 0, pitch: 0 }; this.turnT = 1;
    this.aim = { x: 0, y: 0 };
  }

  get rect() { return this.canvas.getBoundingClientRect(); }

  setBone({ geometry, center, radius }, fitRadius = radius) {
    this.bone.geometry = geometry;
    this.center = center;
    this.boneRadius = radius;
    this.fitRadius = fitRadius;
    this._clearTargets();
    this.resize();
  }

  resize() {
    const r = this.rect;
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    // Fit the bone's bounding sphere (grown to cover its targets) into the
    // view's shorter side so it stays whole whichever way it faces. A sphere
    // under perspective needs R / sin(half-fov), not R / tan, plus a small margin.
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const sinHalf = Math.sin(Math.atan(Math.tan(half) * Math.min(1, this.camera.aspect)));
    this.camera.position.set(0, 0, (this.fitRadius || this.boneRadius) * 1.03 / sinHalf);
    this.camera.updateProjectionMatrix();
  }

  centreAim() {
    const r = this.rect;
    this.setAim(r.width / 2, r.height / 2);
  }

  setAim(x, y) {
    const r = this.rect;
    this.aim.x = Math.max(0, Math.min(r.width, x));
    this.aim.y = Math.max(0, Math.min(r.height, y));
    this.cross.style.left = this.aim.x + 'px';
    this.cross.style.top = this.aim.y + 'px';
  }

  turnTo(face) {
    const f = toThree(face).normalize();
    const yaw = Math.atan2(-f.x, f.z);
    const h = Math.hypot(f.x, f.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(f.y, h), -0.75, 0.75);
    this.from = { yaw: this.yaw, pitch: this.pitch };
    // Take the short way round.
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.to = { yaw: this.yaw + dy, pitch };
    this.turnT = 0;
  }

  rotateBy(dyaw, dpitch) {
    this.turnT = 1;
    this.yaw += dyaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dpitch, -1.3, 1.3);
  }

  /** Show one identical target per landmark option. */
  setOptions(landmarks) {
    this._clearTargets();
    for (const l of landmarks) {
      const t = makeTarget();
      t.userData.landmark = l;
      t.visible = false;
      this.scene.add(t);
      this.targets.push(t);
    }
  }

  /** Landmark whose visible circle holds the crosshair (nearest wins), or null. */
  pick() {
    const r = this.rect;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    let best = null, bestD = Infinity;
    for (const t of this.targets) {
      if (!t.visible || t.userData.out) continue;
      const c = t.position.clone().project(this.camera);
      const e = t.position.clone().addScaledVector(right, t.userData.radius).project(this.camera);
      const cx = (c.x + 1) / 2 * r.width, cy = (1 - c.y) / 2 * r.height;
      const rad = Math.hypot((e.x + 1) / 2 * r.width - cx, (1 - e.y) / 2 * r.height - cy);
      const d = Math.hypot(this.aim.x - cx, this.aim.y - cy);
      if (d <= rad && d < bestD) { bestD = d; best = t.userData.landmark; }
    }
    return best;
  }

  /** Recolour the target on a landmark; `out` targets can't be picked again. */
  mark(landmark, hex, out = true) {
    const t = this.targets.find(t => t.userData.landmark === landmark);
    if (!t) return;
    t.traverse(m => { if (m.isMesh) m.material.color.set(hex); });
    t.userData.out = out;
  }

  /** Answer time: real target green, shot decoys stay red, the rest go. */
  reveal(answer) {
    for (const t of this.targets) {
      if (t.userData.landmark === answer) { this.mark(answer, RIGHT_COLOR); t.userData.grow = 1.25; }
      else if (!t.userData.out) t.userData.hidden = true;
    }
  }

  flash(text, kind) {
    this.note.textContent = text;
    this.note.className = 'v-note show ' + (kind || '');
    clearTimeout(this._noteTO);
    this._noteTO = setTimeout(() => { this.note.className = 'v-note'; }, 900);
  }

  render(now, dt, radius, pop, settled) {
    if (this.turnT < 1) {
      this.turnT = Math.min(1, this.turnT + dt / (TURN_MS / 1000));
      const k = easeInOut(this.turnT);
      this.yaw = this.from.yaw + (this.to.yaw - this.from.yaw) * k;
      this.pitch = this.from.pitch + (this.to.pitch - this.from.pitch) * k;
    }
    this.bone.rotation.set(this.pitch, this.yaw, 0, 'XYZ');
    this.bone.updateMatrixWorld();

    // Float each target just off the surface, facing the camera.
    const pulse = settled ? 1 : 1 + 0.06 * Math.sin(now / 160);
    for (const t of this.targets) {
      const l = t.userData.landmark;
      const local = toThree(l.p).sub(this.center);
      const out = toThree(l.face).normalize().multiplyScalar(radius * 0.4);
      t.position.copy(local.add(out).applyMatrix4(this.bone.matrixWorld));
      t.quaternion.copy(this.camera.quaternion);
      t.userData.radius = radius;
      t.visible = pop > 0 && !t.userData.hidden;
      t.scale.setScalar(radius * pop * (t.userData.grow || pulse));
    }
    if (this.bone.geometry) this.renderer.render(this.scene, this.camera);
  }

  _clearTargets() {
    for (const t of this.targets) {
      this.scene.remove(t);
      t.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    }
    this.targets = [];
  }

  dispose() {
    this._clearTargets();
    this.renderer.dispose();
    this.bone.material.dispose();
  }
}

function makeTarget() {
  const g = new THREE.Group();
  const mat = (opacity) => new THREE.MeshBasicMaterial({
    color: TARGET_COLOR, transparent: true, opacity, depthTest: false,
  });
  // Unit radius; scaled to the stage's target radius in mm.
  const parts = [
    new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat(0.25)),
    new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40), mat(0.95)),
    new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), mat(0.95)),
  ];
  for (const p of parts) { p.renderOrder = 10; g.add(p); }
  g.userData.radius = 1;
  return g;
}

const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/* ── The stage run ────────────────────────────────────────────────────────── */

export class Bone3D {
  constructor() {
    this.root = document.getElementById('arena');
    this.$ = (sel) => this.root.querySelector(sel);
    this.meshes = new Map();   // bone id → { geometry, center, radius }
    this.views = [];
    this.running = false;
    this.onEnd = () => {};     // ({ players, difficulty, scores, stagesCleared, completed }) => void
    this.keys = new Set();
    this._bind();
  }

  async _loadMesh(bone) {
    if (this.meshes.has(bone.id)) return this.meshes.get(bone.id);
    const buf = await (await fetch(bone.mesh)).arrayBuffer();
    const head = new Uint32Array(buf, 0, 2);
    const nV = head[0], nI = head[1];
    const pos = new Float32Array(buf, 8, nV * 3);
    const idx = new Uint16Array(buf, 8 + nV * 12, nI);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    geometry.rotateX(-Math.PI / 2);      // mesh z-up → three.js y-up
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = { geometry, center, radius: geometry.boundingSphere.radius };
    this.meshes.set(bone.id, mesh);
    return mesh;
  }

  async start({ players, difficulty }) {
    this.players = players;
    this.difficulty = difficulty;
    this.root.classList.remove('hide');
    this.root.classList.toggle('two', players === 2);
    this.$('#arena-p2').classList.toggle('hide', players !== 2);
    this.$('#view-2').classList.toggle('hide', players !== 2);
    this.$('#arena-help').textContent = players === 2
      ? 'P1: mouse aim · click fire · right-drag turn  |  P2: arrows aim · Enter fire · Shift+arrows turn  |  M: sound  |  Esc: quit'
      : 'Mouse aim · click fire · right-drag to turn the bone · M: sound · Esc: quit';

    const els = [this.$('#view-1'), this.$('#view-2')].slice(0, players);
    this.views = els.map(el => new View(el));
    this.stats = this.views.map(() => ({ score: 0, hits: 0, shots: 0, streak: 0, bestStreak: 0, react: [] }));
    this.stage = 0;
    this.stagesCleared = 0;
    this.current = null;
    this.phase = 'card';
    this.running = true;
    this.last = performance.now();
    this._updateScores();
    requestAnimationFrame(this._loop);
    this._startStage();
  }

  stop(completed = false) {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this._cardTO);
    this._hideCard();
    this.root.classList.add('hide');
    this.views.forEach(v => v.dispose());
    this.views = [];
    this.keys.clear();
    const scores = this.stats.map(s => ({
      score: s.score,
      hits: s.hits,
      accuracy: s.shots ? Math.round(s.hits / s.shots * 100) : 0,
      avgReact: s.react.length ? Math.round(s.react.reduce((a, b) => a + b, 0) / s.react.length) : 0,
      bestStreak: s.bestStreak,
    }));
    this.onEnd({
      players: this.players, difficulty: this.difficulty, scores,
      stagesCleared: this.stagesCleared, completed,
    });
  }

  /* ── stages ─────────────────────────────────────────────────────────────── */

  async _startStage() {
    const bone = STAGES[this.stage];
    this.bone = bone;
    this.phase = 'card';
    this.current = null;
    this.$('#arena-time').textContent = `${this.stage + 1}/${STAGES.length}`;
    this._setQuestion(bone.name, bone.ko);
    this._showCard(`Stage ${this.stage + 1}`, bone.name, bone.ko);
    Sfx.stage();

    const mesh = await this._loadMesh(bone);
    if (!this.running) return;
    this.targetRadius = BONE3D_DIFF[this.difficulty].radius
      * (mesh.radius / REF_RADIUS) * (bone.targetScale || 1);
    // Frame the bone plus every target ring (floated 0.4r off the surface, r
    // wide), so long bones like the humerus don't push end targets off-screen.
    const fit = Math.max(mesh.radius, ...bone.landmarks.map(l =>
      toThree(l.p).sub(mesh.center).length() + this.targetRadius * 1.4));
    this.views.forEach(v => { v.setBone(mesh, fit); v.centreAim(); });

    // A fixed, shuffled set of landmarks for this stage.
    this.queue = shuffle([...bone.landmarks]).slice(0, QUESTIONS_PER_STAGE);
    this.asked = 0;
    this.stageHits = this.views.map(() => 0);

    this._cardTO = setTimeout(() => {
      if (!this.running) return;
      this._hideCard();
      this.phase = 'play';
      this._next();
    }, CARD_MS);
  }

  _endStage() {
    this.phase = 'card';
    this.views.forEach(v => v.setOptions([]));
    const asked = this.queue.length;
    const last = this.stage === STAGES.length - 1;

    if (this.players === 2) {
      const [a, b] = this.stageHits;
      this.stagesCleared++;
      (last ? Sfx.win : Sfx.clear)();
      this._showCard(`Stage ${this.stage + 1} done`, `P1 ${a} : ${b} P2`, last ? 'Final results next' : 'Next bone coming up');
      this._cardTO = setTimeout(() => {
        if (last) this.stop(true);
        else { this.stage++; this._startStage(); }
      }, CARD_MS);
      return;
    }

    const got = this.stageHits[0];
    const cleared = got >= Math.ceil(asked * CLEAR_RATE);
    if (cleared) this.stagesCleared++;
    (cleared ? (last ? Sfx.win : Sfx.clear) : Sfx.fail)();
    this._showCard(
      cleared ? 'Stage clear' : 'Try again',
      `${got} / ${asked}`,
      cleared ? (last ? 'All bones cleared!' : 'Next bone coming up')
              : `Need ${Math.ceil(asked * CLEAR_RATE)} to clear`,
      cleared ? 'good' : 'bad'
    );
    this._cardTO = setTimeout(() => {
      if (cleared && last) this.stop(true);
      else { if (cleared) this.stage++; this._startStage(); }
    }, CARD_MS + 400);
  }

  _showCard(kicker, title, sub, kind = '') {
    const c = this.$('#arena-card');
    c.querySelector('.ac-kicker').textContent = kicker;
    c.querySelector('.ac-title').textContent = title;
    c.querySelector('.ac-sub').textContent = sub;
    c.className = 'arena-card ' + kind;
  }

  _hideCard() { this.$('#arena-card').classList.add('hide'); }

  _setQuestion(name, ko) {
    this.$('#arena-name').textContent = name;
    this.$('#arena-ko').textContent = ko;
  }

  /* ── question flow ──────────────────────────────────────────────────────── */

  _next() {
    if (this.asked >= this.queue.length) { this._endStage(); return; }
    this.current = this.queue[this.asked++];
    this.revealUntil = 0;
    this.born = performance.now() + TURN_MS;   // clock starts once turned
    const options = this._options();
    this.views.forEach(v => {
      v.turnTo(this.current.face);
      v.setOptions(options);
    });
    this.$('.arena-label').textContent = `${this.bone.name} · ${this.asked}/${this.queue.length} — hit the`;
    this._setQuestion(this.current.name, this.current.ko);
    const bar = this.$('#arena-bar-fill');
    const life = BONE3D_DIFF[this.difficulty].life;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;
    bar.style.transition = `transform ${life}ms linear ${TURN_MS}ms`;
    bar.style.transform = 'scaleX(0)';
  }

  /**
   * The real landmark plus decoys on other landmarks. Decoys must face the
   * same way (so they're on the side being shown) and sit far enough apart
   * that no two circles overlap.
   */
  _options() {
    const { decoys } = BONE3D_DIFF[this.difficulty];
    const radius = this.targetRadius;
    const dir = (l) => new THREE.Vector3(...l.face).normalize();
    const facing = dir(this.current);
    const others = shuffle(this.bone.landmarks.filter(l => l !== this.current))
      .sort((a, b) => (dir(b).dot(facing) > 0.2) - (dir(a).dot(facing) > 0.2));
    const picked = [this.current];
    const dist = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
    for (const l of others) {
      if (picked.length > decoys) break;
      if (dir(l).dot(facing) <= 0.2) break;               // only the visible side
      if (picked.every(p => dist(p, l) >= radius * 2.4)) picked.push(l);
    }
    return shuffle(picked);
  }

  _shoot(i) {
    const v = this.views[i], s = this.stats[i];
    if (!v || !this.running || this.phase !== 'play' || this.revealUntil
        || performance.now() < this.born) return;
    Sfx.shot();   // every trigger pull bangs, on a target or not
    const picked = v.pick();
    if (!picked) { v.flash('shoot a target', ''); return; }   // off every target: not counted

    s.shots++;
    if (picked === this.current) {
      Sfx.hit();
      const rt = performance.now() - this.born;
      const pts = Math.round(Math.max(50, 500000 / Math.max(rt, 250)) * BONE3D_DIFF[this.difficulty].mult);
      s.hits++; s.score += pts; s.react.push(rt);
      s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
      this.stageHits[i]++;
      v.flash(`+${pts}`, 'good');
      this._reveal(this.players === 2 ? `P${i + 1} got it — ${this.current.name}` : '✓ ' + this.current.name);
    } else {
      // A decoy: lose points, but play goes on. That decoy turns red and
      // can't be shot again, so the same mistake isn't charged twice.
      Sfx.wrong();
      const penalty = Math.round(WRONG_PENALTY * BONE3D_DIFF[this.difficulty].mult);
      s.score -= penalty;
      s.streak = 0;
      v.mark(picked, WRONG_COLOR);
      v.flash(`−${penalty}  ✗ ${picked.name}`, 'bad');
    }
    this._updateScores();
  }

  _reveal(text) {
    this.revealUntil = performance.now() + REVEAL_MS;
    this.views.forEach(v => v.reveal(this.current));
    this.$('#arena-note').textContent = text;
    this.$('#arena-note').className = 'arena-note show';
    clearTimeout(this._noteTO);
    this._noteTO = setTimeout(() => { this.$('#arena-note').className = 'arena-note'; }, REVEAL_MS);
  }

  _updateScores() {
    this.stats.forEach((s, i) => {
      this.$(`#arena-p${i + 1} .ap-score`).textContent = s.score.toLocaleString('en-US');
      this.$(`#arena-p${i + 1} .ap-sub`).textContent = `${s.hits} hit${s.hits === 1 ? '' : 's'} · streak ${s.streak}`;
    });
  }

  /* ── loop & input ───────────────────────────────────────────────────────── */

  _loop = (now) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.phase === 'play') {
      if (this.revealUntil && now >= this.revealUntil) this._next();
      else if (!this.revealUntil && now - this.born >= BONE3D_DIFF[this.difficulty].life) {
        this.stats.forEach(s => { s.streak = 0; s.shots++; });   // unanswered counts as a miss
        Sfx.timeout();
        this._reveal(`Time's up — ${this.current.name}`);
        this._updateScores();
      }
    }

    this._keyboard(dt);

    // Targets pop in once the bone has finished turning.
    const pop = this.phase !== 'play' || now < this.born ? 0 : Math.min(1, (now - this.born) / 140);
    this.views.forEach(v => v.render(now, dt, this.targetRadius || 1, pop, !!this.revealUntil));
    requestAnimationFrame(this._loop);
  };

  _keyboard(dt) {
    const v = this.views[1];
    if (!v) return;
    const k = this.keys;
    const shift = k.has('Shift');
    const dx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    const dy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    if (shift) {
      v.rotateBy(dx * ROT_SPEED * dt, dy * ROT_SPEED * dt);
      this.held = 0;
      return;
    }
    if (dx || dy) {
      this.held = (this.held || 0) + dt;
      const t = Math.min(1, this.held / KEY_RAMP);
      const speed = KEY_SPEED[0] + (KEY_SPEED[1] - KEY_SPEED[0]) * t;
      const n = Math.hypot(dx, dy);
      v.setAim(v.aim.x + dx / n * speed * dt, v.aim.y + dy / n * speed * dt);
    } else {
      this.held = 0;
    }
  }

  _resize() {
    this.views.forEach(v => v.resize());
  }

  _bind() {
    const p1 = this.$('#view-1');
    let drag = null;

    p1.addEventListener('mousemove', (e) => {
      const v = this.views[0];
      if (!v) return;
      const r = v.rect;
      if (drag) {
        v.rotateBy((e.clientX - drag.x) * 0.01, (e.clientY - drag.y) * 0.01);
        drag = { x: e.clientX, y: e.clientY };
      }
      v.setAim(e.clientX - r.left, e.clientY - r.top);
    });
    p1.addEventListener('mousedown', (e) => {
      const v = this.views[0];
      if (!v) return;
      if (e.button === 2) { drag = { x: e.clientX, y: e.clientY }; return; }
      if (e.button !== 0) return;
      const r = v.rect;
      v.setAim(e.clientX - r.left, e.clientY - r.top);
      this._shoot(0);
    });
    window.addEventListener('mouseup', () => { drag = null; });
    p1.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: tap to fire at that point (1P view).
    p1.addEventListener('touchstart', (e) => {
      const v = this.views[0];
      if (!v) return;
      const t = e.changedTouches[0], r = v.rect;
      v.setAim(t.clientX - r.left, t.clientY - r.top);
      this._shoot(0);
      e.preventDefault();
    }, { passive: false });

    const mute = this.$('#arena-mute');
    const showMute = () => { mute.textContent = Sfx.muted ? '🔇' : '🔊'; };
    showMute();
    mute.addEventListener('click', () => { Sfx.toggle(); showMute(); Sfx.unlock(); mute.blur(); });

    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (e.key === 'Escape') { this.stop(); return; }
      if (e.key === 'm' || e.key === 'M') { Sfx.toggle(); showMute(); return; }
      if (this.players !== 2) return;
      if (e.key.startsWith('Arrow') || e.key === 'Shift') {
        this.keys.add(e.key);
        e.preventDefault();
      }
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        this._shoot(1);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key); });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this._resize());
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
