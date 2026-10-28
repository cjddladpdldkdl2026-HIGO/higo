/* ============================================================================
 * scene.js — the synthwave 3D world
 * Builds the renderer, camera, gradient sky, neon grid horizon, retro sun, and
 * the first-person weapon viewmodel. Exposes a small API the game loop drives:
 * setLook(), kickRecoil(), update(), resize(), raycastCenter().
 * ========================================================================== */

import * as THREE from 'three';
import { COLORS, BASE_SENS } from './config.js';

const PITCH_LIMIT = Math.PI / 2 - 0.08;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(new THREE.Color(COLORS.bgMid), 30, 90);

  const camera = new THREE.PerspectiveCamera(
    95, window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(0, 1.2, 7);
  camera.rotation.order = 'YXZ';

  // ── Lighting ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x8a6cff, 0.7));
  const sunLight = new THREE.PointLight(0xff66aa, 1.1, 200);
  sunLight.position.set(0, 6, -60);
  scene.add(sunLight);
  const fill = new THREE.PointLight(0x2de2e6, 0.7, 80);
  fill.position.set(0, 4, 10);
  scene.add(fill);

  buildGrid(scene);
  buildSun(scene);

  // ── Weapon viewmodel (parented to camera) ──────────────────────────────────
  scene.add(camera); // camera must be in the graph so its children render
  const weapon = buildWeapon();
  const weaponRest = new THREE.Vector3(0.36, -0.32, -0.8);
  weapon.position.copy(weaponRest);
  camera.add(weapon);

  // ── Look state ──────────────────────────────────────────────────────────────
  let yaw = 0, pitch = 0, recoil = 0;
  const raycaster = new THREE.Raycaster();
  const CENTER = new THREE.Vector2(0, 0);

  return {
    scene, camera, renderer,

    resetLook(startPitch = 0) { yaw = 0; pitch = startPitch; },

    addLook(dx, dy, sensitivity) {
      const k = BASE_SENS * sensitivity;
      yaw -= dx * k;
      pitch -= dy * k;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    },

    kickRecoil() { recoil = 1; },

    setWeaponVisible(v) { weapon.visible = v; },

    raycastCenter(meshes) {
      raycaster.setFromCamera(CENTER, camera);
      return raycaster.intersectObjects(meshes, false);
    },

    /** Raycast through a screen point given in CSS pixels. */
    raycastAt(clientX, clientY, meshes) {
      const ndc = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(meshes, false);
    },

    update(now, dt, playing) {
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Recoil decay + idle bob for the weapon.
      recoil = Math.max(0, recoil - 0.08);
      const kick = recoil * recoil;
      const bob = playing ? Math.sin(now / 380) * 0.004 : 0;
      weapon.position.set(
        weaponRest.x,
        weaponRest.y + bob + kick * 0.05,
        weaponRest.z + kick * 0.12
      );
      weapon.rotation.x = kick * 0.25;
      weapon.rotation.y = -0.06;

      renderer.render(scene, camera);
    },

    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
  };
}

/* ── Sky: vertical synthwave gradient as the scene background ───────────────── */
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, COLORS.bgTop);
  grad.addColorStop(0.45, COLORS.bgMid);
  grad.addColorStop(0.72, '#7a1f6a');
  grad.addColorStop(0.86, COLORS.horizon);
  grad.addColorStop(1.0, '#1a0530');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Neon grid: a classic receding floor + faint ceiling reflection ─────────── */
function buildGrid(scene) {
  const size = 220, divisions = 60;
  const floor = new THREE.GridHelper(size, divisions,
    new THREE.Color(COLORS.grid), new THREE.Color(COLORS.gridFar));
  floor.material.transparent = true;
  floor.material.opacity = 0.55;
  floor.position.y = -3;
  scene.add(floor);

  // Dark base plane just under the grid so targets read against a solid floor.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color: 0x0a0118 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -3.05;
  scene.add(base);

  // Faint mirrored grid overhead for that boxed-in synthwave tunnel feel.
  const ceil = new THREE.GridHelper(size, divisions,
    new THREE.Color(COLORS.gridFar), new THREE.Color(COLORS.grid));
  ceil.material.transparent = true;
  ceil.material.opacity = 0.12;
  ceil.position.y = 16;
  scene.add(ceil);
}

/* ── Retro sun: gradient disc with horizontal scanline gaps ─────────────────── */
function buildSun(scene) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');

  // Circular clip, fill with a top→bottom sunset gradient.
  g.save();
  g.beginPath();
  g.arc(256, 256, 250, 0, Math.PI * 2);
  g.clip();
  const grad = g.createLinearGradient(0, 6, 0, 506);
  grad.addColorStop(0.0, COLORS.sunTop);
  grad.addColorStop(0.5, COLORS.sunMid);
  grad.addColorStop(1.0, COLORS.sunBot);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);

  // Carve horizontal gaps in the lower half, widening toward the bottom.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 12; i++) {
    const y = 300 + i * 17;
    const h = 3 + i * 1.3;
    g.fillRect(0, y, 512, h);
  }
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), mat);
  sun.position.set(0, 5, -75);
  scene.add(sun);

  // Additive glow halo behind the sun.
  scene.add(makeGlow(60, '#ff5fae', 0.5, new THREE.Vector3(0, 5, -76)));
}

/* ── Reusable additive radial glow sprite ──────────────────────────────────── */
const glowTexCache = {};
function glowTexture(hex) {
  if (glowTexCache[hex]) return glowTexCache[hex];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, hex);
  grad.addColorStop(0.4, hex);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTexCache[hex] = tex;
  return tex;
}

export function makeGlow(size, hex, opacity, pos) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(hex), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sprite.scale.set(size, size, 1);
  if (pos) sprite.position.copy(pos);
  return sprite;
}

/* ── First-person weapon viewmodel (low-poly, neon-accented) ────────────────── */
function buildWeapon() {
  const group = new THREE.Group();
  const matBody   = new THREE.MeshStandardMaterial({ color: 0x14121f, roughness: 0.45, metalness: 0.7 });
  const matDark   = new THREE.MeshStandardMaterial({ color: 0x0a0912, roughness: 0.6, metalness: 0.5 });
  const matNeon   = new THREE.MeshStandardMaterial({ color: 0x2de2e6, emissive: 0x13e0ff, emissiveIntensity: 1.1, roughness: 0.3 });
  const matNeon2  = new THREE.MeshStandardMaterial({ color: 0xff2e88, emissive: 0xff2e88, emissiveIntensity: 0.9, roughness: 0.3 });

  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  box(0.18, 0.16, 0.5, matBody, 0, 0, 0);       // receiver
  box(0.07, 0.07, 0.55, matDark, 0, 0.02, -0.42); // barrel
  box(0.09, 0.09, 0.06, matNeon2, 0, 0.02, -0.72); // muzzle
  box(0.05, 0.05, 0.30, matDark, 0, 0.11, -0.05);  // top rail
  box(0.03, 0.06, 0.03, matDark, 0, 0.16, 0.08);   // rear sight
  const grip = box(0.10, 0.26, 0.12, matBody, 0, -0.18, 0.16);
  grip.rotation.x = 0.35;
  box(0.08, 0.22, 0.10, matDark, 0, -0.20, -0.02); // magazine
  box(0.19, 0.025, 0.32, matNeon, 0, 0.075, -0.02); // neon accent strip

  group.rotation.y = -0.06;
  return group;
}
