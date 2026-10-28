/* ============================================================================
 * config.js — central tuning + shared constants
 * Single source of truth for scenarios, difficulty, palette, and the play
 * volume. Keeping these in one place is what lets every other module stay
 * dumb and declarative.
 * ========================================================================== */

export const ROUND_SECONDS = 30;

// Scenario identifiers and human-facing labels.
export const SCENARIOS = [
  { id: 'flick',    label: 'Flick',    blurb: 'One target at a time — snap to it.' },
  { id: 'grid',     label: 'Gridshot', blurb: 'A field of targets. Clear them fast.' },
  { id: 'tracking', label: 'Tracking', blurb: 'Targets drift. Keep your aim glued on.' },
  { id: 'scapula',  label: 'Scapula',  blurb: 'A landmark is named — pick the real target among the decoys.', seconds: 60 },
  { id: 'bones3d', label: '3D Bones', blurb: 'Stages: scapula → humerus → hand → pelvis → sacrum. Hit the named landmark among decoys; clear 60% to advance. 1P or 2P.' },
];

// Scenarios that use the bone board (anatomy.js) instead of floating targets.
export const ANATOMY_SCENARIOS = new Set(['scapula']);

// Scenarios run by the 3D bone race (bone3d.js), which supports 2 players.
export const BONE3D_SCENARIOS = new Set(['bones3d']);

export const PLAYERS = [
  { id: '1', label: '1P' },
  { id: '2', label: '2P · split screen' },
];

export const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard',   label: 'Hard' },
];

// Per-difficulty tuning. `radius` is world-units, `life` is ms a target lives
// before expiring, `count` is how many live at once, `trackSpeed` drives the
// tracking scenario, `mult` is the score multiplier.
export const DIFF = {
  easy:   { radius: 0.62, life: 2600, count: 3, trackSpeed: 2.2, mult: 1.0 },
  medium: { radius: 0.46, life: 1900, count: 4, trackSpeed: 3.4, mult: 1.5 },
  hard:   { radius: 0.32, life: 1300, count: 6, trackSpeed: 4.8, mult: 2.0 },
};

// The 3D box (world units) where targets are allowed to spawn. The camera sits
// near +Z and looks down −Z, so this region floats in front of the player,
// above the neon grid horizon.
export const SPAWN = {
  xMin: -9, xMax: 9,
  yMin: 0.2, yMax: 7.5,
  zMin: -23, zMax: -16,
};

// Synthwave palette — used by both the 3D scene and (mirrored in CSS) the UI.
export const COLORS = {
  bgTop:    '#0b0118',
  bgMid:    '#2a0a45',
  horizon:  '#ff2e88',
  grid:     '#ff2e88',
  gridFar:  '#2de2e6',
  sunTop:   '#fde74c',
  sunMid:   '#ff8a3d',
  sunBot:   '#ff2e88',
  target:   '#2de2e6',
  targetEmissive: '#13e0ff',
  targetExpiring: '#ff3d6e',
};

// Mouse-look base sensitivity (radians per pixel) before the user multiplier.
export const BASE_SENS = 0.0022;
