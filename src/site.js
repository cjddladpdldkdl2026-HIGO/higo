/* ============================================================================
 * site.js — the website around the game (home, bone atlas, about).
 * A small 3D bone viewer that reuses the game's meshes and landmark data
 * (bones.js), plus the bits of each page that are generated from that data
 * so the site never drifts from what the game actually asks.
 * ========================================================================== */

import * as THREE from 'three';
import { STAGES } from './bones.js';

// Mesh axes → three.js (y up, +z toward the camera = anterior). Same as bone3d.js.
const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);

const meshes = new Map();
async function loadMesh(url) {
  if (!meshes.has(url)) meshes.set(url, (async () => {
    const buf = await (await fetch(url)).arrayBuffer();
    const [nV, nI] = new Uint32Array(buf, 0, 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 8, nV * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, 8 + nV * 12, nI), 1));
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, center, radius: geometry.boundingSphere.radius };
  })());
  return meshes.get(url);
}

/* ── 3D viewer ────────────────────────────────────────────────────────────── */

export class BoneViewer {
  constructor(canvas, { spin = false } = {}) {
    this.canvas = canvas;
    this.spin = spin;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 10, 4000);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a0a45, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(120, 160, 300);
    const rim = new THREE.DirectionalLight(0x2de2e6, 0.8);
    rim.position.set(-200, 60, -200);
    this.scene.add(key, rim);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.bone = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({
      color: 0xeadfc6, roughness: 0.72, metalness: 0.02,
    }));
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff2e88, depthTest: false, transparent: true }),
    );
    this.marker.renderOrder = 1;
    this.marker.visible = false;
    this.pivot.add(this.bone, this.marker);

    this.yaw = 0; this.pitch = 0;
    this.goal = null;            // { yaw, pitch } we're easing toward
    this.radius = 100;

    // Drag to turn; dragging stops the idle spin.
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      this.spin = false; this.goal = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw += (e.clientX - drag.x) * 0.01;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - drag.y) * 0.01, -1.3, 1.3);
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    new ResizeObserver(() => this._resize()).observe(canvas);
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }

  async setBone(bone) {
    const mesh = await loadMesh(bone.mesh);
    this.bone.geometry = mesh.geometry;
    this.center = mesh.center;
    this.radius = mesh.radius;
    this.marker.visible = false;
    this.marker.scale.setScalar(mesh.radius * 0.035);
    this._resize();
  }

  /** Turn the bone so `landmark` faces the viewer and mark it. */
  focus(landmark) {
    const f = toThree(landmark.face).normalize();
    const yaw = Math.atan2(-f.x, f.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(f.y, Math.hypot(f.x, f.z)), -0.75, 0.75);
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));     // short way round
    this.goal = { yaw: this.yaw + dy, pitch };
    this.spin = false;
    this.marker.position.copy(toThree(landmark.p).sub(this.center).addScaledVector(f, this.radius * 0.02));
    this.marker.visible = true;
  }

  _resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const sinHalf = Math.sin(Math.atan(Math.tan(half) * Math.min(1, this.camera.aspect)));
    this.camera.position.set(0, 0, this.radius * 1.05 / sinHalf);
    this.camera.updateProjectionMatrix();
  }

  _loop = (now) => {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (this.spin) this.yaw += dt * 0.5;
    if (this.goal) {
      const k = 1 - Math.exp(-dt * 8);
      this.yaw += (this.goal.yaw - this.yaw) * k;
      this.pitch += (this.goal.pitch - this.pitch) * k;
    }
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'XYZ');
    if (this.marker.visible) {
      this.marker.material.opacity = 0.75 + 0.25 * Math.sin(now / 180);
    }
    if (this.bone.geometry) this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  };
}

/* ── pages ────────────────────────────────────────────────────────────────── */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function home() {
  const hero = document.getElementById('hero-bone');
  if (hero) {
    const v = new BoneViewer(hero, { spin: true });
    v.setBone(STAGES[0]);
  }
  const list = document.getElementById('stage-list');
  if (list) {
    STAGES.forEach((s, i) => {
      const a = el('a', 'stage-card');
      a.href = `bones.html#${s.id}`;
      a.append(
        el('span', 'stage-num', `STAGE ${i + 1}`),
        el('strong', 'stage-ko', s.ko),
        el('span', 'stage-en', s.name),
        el('span', 'stage-count', `랜드마크 ${s.landmarks.length}개`),
      );
      list.append(a);
    });
  }
  const total = document.getElementById('landmark-total');
  if (total) total.textContent = STAGES.reduce((n, s) => n + s.landmarks.length, 0);
}

function atlas() {
  const canvas = document.getElementById('atlas-bone');
  if (!canvas) return;
  const viewer = new BoneViewer(canvas);
  const tabs = document.getElementById('atlas-tabs');
  const list = document.getElementById('atlas-list');
  const title = document.getElementById('atlas-title');
  const filter = document.getElementById('atlas-filter');
  let current = null;

  const show = (stage) => {
    current = stage;
    history.replaceState(null, '', `#${stage.id}`);
    [...tabs.children].forEach(b => b.setAttribute('aria-selected', b.dataset.id === stage.id));
    title.textContent = `${stage.ko} · ${stage.name}`;
    viewer.spin = true;
    viewer.setBone(stage);
    renderList();
  };

  const renderList = () => {
    const q = filter.value.trim().toLowerCase();
    list.replaceChildren(...current.landmarks
      .filter(l => !q || l.ko.includes(q) || l.name.toLowerCase().includes(q))
      .map(l => {
        const b = el('button', 'term');
        b.type = 'button';
        b.append(el('strong', 'term-ko', l.ko), el('span', 'term-en', l.name));
        b.addEventListener('click', () => {
          list.querySelectorAll('.term').forEach(t => t.classList.toggle('on', t === b));
          viewer.focus(l);
        });
        return b;
      }));
    if (!list.children.length) list.append(el('p', 'term-empty', '찾는 용어가 없어요.'));
  };

  STAGES.forEach((s, i) => {
    const b = el('button', 'tab', `${i + 1}. ${s.ko}`);
    b.type = 'button';
    b.role = 'tab';
    b.dataset.id = s.id;
    b.addEventListener('click', () => { filter.value = ''; show(s); });
    tabs.append(b);
  });
  filter.addEventListener('input', renderList);
  show(STAGES.find(s => `#${s.id}` === location.hash) || STAGES[0]);
}

home();
atlas();
