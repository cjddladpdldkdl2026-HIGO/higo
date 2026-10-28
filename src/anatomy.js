/* ============================================================================
 * anatomy.js — bone-landmark quiz scenario
 * A bone photo hangs in front of the player as a board. Each question names a
 * landmark and shows several identical targets on the bone: one on the real
 * landmark, the rest on other landmarks as decoys. Shooting a target answers
 * the question; the visible circle is exactly the hit area. Hit detection
 * works in the photo's own pixel space via the raycast UV, so adding a new
 * bone is just a new entry in BONES (an image + landmark pixel coordinates).
 * ========================================================================== */

import * as THREE from 'three';

// Board placement: straight ahead of the camera (z=7, y=1.2) and close, then
// scaled every frame to fill most of the view whatever the window shape.
const BOARD_DIST = 8;
const BOARD_POS = new THREE.Vector3(0, 1.2, 7 - BOARD_DIST);
// Max share of the view the board may use; leaves room for the prompt above
// and the HUD dock below.
const FILL_H = 0.8, FILL_W = 0.94;
const PAD = 24;                        // texture px of panel around the photo
const REVEAL_MS = 900;                 // how long an answer stays shown

const TARGET_COLOR = '#2de2e6';
const RIGHT_COLOR = '#39ff88';
const WRONG_COLOR = '#ff3d6e';

// Per-difficulty tuning: `radius` is the target radius in photo pixels (and
// the hit area), `life` is ms to answer, `decoys` is how many fake targets.
export const ANATOMY_DIFF = {
  easy:   { radius: 40, life: 8000, decoys: 2 },
  medium: { radius: 34, life: 6000, decoys: 4 },
  hard:   { radius: 26, life: 4000, decoys: 4 },
};

/* ── Bone library ─────────────────────────────────────────────────────────── */

// Right scapula, anterior (costal) view: glenoid, acromion and coracoid on the
// left, medial border on the right. Coordinates are pixels in the source photo.
const SCAPULA = {
  id: 'scapula',
  label: 'Scapula',
  image: 'assets/scapula-anterior.jpg',
  crop: { x: 120, y: 60, w: 710, h: 833 },
  // Leftover label smudges in the source photo, painted out before use.
  erase: [
    [0, 295, 215, 80], [295, 735, 180, 50], [700, 865, 180, 28],
    [805, 730, 175, 60], [835, 350, 189, 90], [835, 510, 175, 50], [835, 55, 189, 275],
  ],
  landmarks: [
    { id: 'acromion',      name: 'Acromion',               ko: '견봉',           x: 220, y: 115 },
    { id: 'coracoid',      name: 'Coracoid process',       ko: '오훼돌기',       x: 190, y: 210 },
    { id: 'glenoid',       name: 'Glenoid cavity',         ko: '관절오목',       x: 262, y: 340 },
    { id: 'infraglenoid',  name: 'Infraglenoid tubercle',  ko: '관절아래결절',   x: 285, y: 415 },
    { id: 'notch',         name: 'Suprascapular notch',    ko: '어깨위패임',     x: 452, y: 232 },
    { id: 'sup-border',    name: 'Superior border',        ko: '위모서리',       x: 560, y: 180 },
    { id: 'sup-angle',     name: 'Superior angle',         ko: '위각',           x: 680, y: 130 },
    { id: 'medial-border', name: 'Medial border',          ko: '안쪽모서리',     x: 800, y: 450 },
    { id: 'lateral-border',name: 'Lateral border',         ko: '가쪽모서리',     x: 445, y: 570 },
    { id: 'inf-angle',     name: 'Inferior angle',         ko: '아래각',         x: 640, y: 862 },
    { id: 'subscapular',   name: 'Subscapular fossa',      ko: '어깨밑오목',     x: 620, y: 480 },
  ],
};

export const BONES = { scapula: SCAPULA };

/* ── Scenario ─────────────────────────────────────────────────────────────── */

export class Anatomy {
  constructor(scene, camera, bone = SCAPULA) {
    this.scene = scene;
    this.camera = camera;
    this.bone = bone;
    this.difficulty = 'medium';
    this.current = null;      // landmark being asked for
    this.options = [];        // { landmark, mesh } targets shown this question
    this.born = 0;            // when the question appeared
    this.revealUntil = 0;     // answer is on show (input ignored) until then
    this.photo = null;        // background-keyed bone image, once loaded
    this.onPrompt = () => {}; // (landmark, lifeMs) => void
    this.onExpire = () => {}; // (landmark) => void

    const { w, h } = bone.crop;
    this.texW = w + PAD * 2;
    this.texH = h + PAD * 2;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.texW;
    this.canvas.height = this.texH;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;

    // Board geometry is 1 unit tall; update() scales it to fit the view.
    this.aspect = this.texW / this.texH;
    this.board = new THREE.Mesh(
      new THREE.PlaneGeometry(this.aspect, 1),
      new THREE.MeshBasicMaterial({
        map: this.texture, transparent: true, fog: false, depthTest: false,
      })
    );
    // Drawn last and through everything so the floor grid never clips it.
    this.board.renderOrder = 10;
    this.board.position.copy(BOARD_POS);
    this.board.visible = false;
    scene.add(this.board);

    this._loadPhoto();
  }

  get meshes() { return [this.board]; }

  /** Camera pitch (radians) that centres the board on screen. */
  get aimPitch() { return 0; }

  /** True while the last answer is being shown; shots are ignored. */
  get revealing() { return performance.now() < this.revealUntil; }

  configure(difficulty) {
    this.difficulty = difficulty;
  }

  start() {
    this._paint();
    this.board.visible = true;
    this.current = null;
    this.next();
  }

  stop() {
    this.board.visible = false;
    this.current = null;
    this.revealUntil = 0;
    this._clearOptions();
  }

  /** Ask for a new landmark (never the same twice running) with decoys. */
  next() {
    this._clearOptions();
    const { decoys } = ANATOMY_DIFF[this.difficulty];
    const pool = this.bone.landmarks.filter(l => l !== this.current);
    this.current = pool[Math.floor(Math.random() * pool.length)];

    const others = shuffle(this.bone.landmarks.filter(l => l !== this.current));
    for (const l of [this.current, ...others.slice(0, decoys)]) {
      this.options.push({ landmark: l, mesh: this._makeTarget(l) });
    }

    this.born = performance.now();
    this.revealUntil = 0;
    this.onPrompt(this.current, ANATOMY_DIFF[this.difficulty].life);
  }

  /**
   * Judge a shot from the world raycast.
   * Returns { result: 'hit' | 'wrong' | 'miss' | 'busy', target, struck, rt }:
   * 'wrong' means a decoy was shot (`struck`), 'miss' means no target was
   * hit, and 'busy' means an answer is still on show and the shot is ignored.
   */
  judge(intersections) {
    const target = this.current;
    const rt = performance.now() - this.born;
    if (this.revealing || !target) return { result: 'busy', target, struck: null, rt };

    const hit = intersections.find(i => i.object === this.board);
    if (!hit) return { result: 'miss', target, struck: null, rt };

    // Board UV → photo pixel coordinates.
    const { crop } = this.bone;
    const px = hit.uv.x * this.texW - PAD + crop.x;
    const py = (1 - hit.uv.y) * this.texH - PAD + crop.y;
    const r = ANATOMY_DIFF[this.difficulty].radius;

    // Only the targets on screen count, and their circle is the hit area.
    let shot = null, best = Infinity;
    for (const o of this.options) {
      const d = Math.hypot(o.landmark.x - px, o.landmark.y - py);
      if (d <= r && d < best) { best = d; shot = o; }
    }
    if (!shot) return { result: 'miss', target, struck: null, rt };

    const struck = shot.landmark;
    this._reveal(struck === target ? null : shot);
    return { result: struck === target ? 'hit' : 'wrong', target, struck, rt };
  }

  update(now, dt, playing) {
    if (this.board.visible) this._fit();
    if (!playing || !this.current) return;

    if (this.revealUntil) {
      if (now >= this.revealUntil) this.next();
    } else if (now - this.born >= ANATOMY_DIFF[this.difficulty].life) {
      this._reveal(null);
      this.onExpire(this.current);
    }

    // Gentle pulse on live targets; answered ones hold still.
    const pulse = this.revealUntil ? 1 : 1 + 0.06 * Math.sin(now / 160);
    for (const o of this.options) {
      const pop = Math.min(1, (now - this.born) / 140);
      o.mesh.scale.setScalar(pop * (o.grow || pulse));
    }
  }

  /* ── internals ──────────────────────────────────────────────────────────── */

  /** Show the answer: real target green, the shot decoy (if any) red. */
  _reveal(wrongOption) {
    for (const o of this.options) {
      if (o.landmark === this.current) { setTargetColor(o.mesh, RIGHT_COLOR); o.grow = 1.25; }
      else if (o === wrongOption)      { setTargetColor(o.mesh, WRONG_COLOR); }
      else                             { o.mesh.visible = false; }
    }
    this.revealUntil = performance.now() + REVEAL_MS;
  }

  /** A target: translucent disc + bright ring + centre dot, on the board. */
  _makeTarget(landmark) {
    const r = ANATOMY_DIFF[this.difficulty].radius / this.texH; // board units
    const group = new THREE.Group();
    const mat = (opacity) => new THREE.MeshBasicMaterial({
      color: TARGET_COLOR, transparent: true, opacity, fog: false, depthTest: false,
    });
    const parts = [
      new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat(0.22)),
      new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 40), mat(0.95)),
      new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 20), mat(0.95)),
    ];
    for (const p of parts) { p.renderOrder = 11; group.add(p); }

    const x = landmark.x - this.bone.crop.x + PAD;
    const y = landmark.y - this.bone.crop.y + PAD;
    group.position.set((x / this.texW - 0.5) * this.aspect, 0.5 - y / this.texH, 0.001);
    group.scale.setScalar(0.001);
    this.board.add(group);
    return group;
  }

  _clearOptions() {
    for (const o of this.options) {
      this.board.remove(o.mesh);
      o.mesh.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    }
    this.options = [];
  }

  /** Scale the board so it fills most of the view at the current aspect. */
  _fit() {
    const cam = this.camera;
    const viewH = 2 * BOARD_DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const viewW = viewH * cam.aspect;
    const h = Math.min(viewH * FILL_H, (viewW * FILL_W) / this.aspect);
    this.board.scale.set(h, h, 1);
  }

  _loadPhoto() {
    const img = new Image();
    img.onload = () => {
      this.photo = keyOutBackground(img, this.bone);
      this._paint();
    };
    img.src = this.bone.image;
  }

  _paint() {
    const ctx = this.canvas.getContext('2d');
    const W = this.texW, H = this.texH;
    ctx.clearRect(0, 0, W, H);

    // Dark neon panel behind the bone.
    ctx.fillStyle = 'rgba(17, 4, 42, 0.9)';
    roundRect(ctx, 4, 4, W - 8, H - 8, 22);
    ctx.fill();
    ctx.strokeStyle = '#2de2e6'; ctx.lineWidth = 4; ctx.stroke();

    if (this.photo) {
      const { crop } = this.bone;
      ctx.save();
      ctx.shadowColor = 'rgba(45, 226, 230, 0.35)';
      ctx.shadowBlur = 18;
      ctx.drawImage(this.photo, crop.x, crop.y, crop.w, crop.h, PAD, PAD, crop.w, crop.h);
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }
}

function setTargetColor(group, hex) {
  group.traverse(m => { if (m.isMesh) m.material.color.set(hex); });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Return a canvas of the photo with its white studio background made
 * transparent. Flood-fills from the edges so pale highlights inside the bone
 * are kept; label smudges listed in `bone.erase` are whited out first.
 */
function keyOutBackground(img, bone) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = '#fff';
  for (const [x, y, w, h] of bone.erase) ctx.fillRect(x, y, w, h);

  const { width: W, height: H } = c;
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  const isBg = (i) => {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    return Math.min(r, g, b) > 222 && Math.max(r, g, b) - Math.min(r, g, b) < 20;
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    px[p * 4 + 3] = 0;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
