/* ============================================================================
 * sfx.js — synthesized sound effects (Web Audio, no audio files)
 * Each effect is a few short oscillator/noise envelopes. The AudioContext is
 * created lazily on the first effect after a user gesture (browsers block
 * audio before one), and the mute state persists via Storage.
 * ========================================================================== */

import { Storage } from './storage.js';

let ctx = null;
let master = null;
let muted = !!Storage.getSettings().muted;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** One enveloped oscillator note. `at` is seconds from now. */
function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.3, slideTo = null } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short filtered noise burst (shot / click texture). */
function noise({ at = 0, dur = 0.06, vol = 0.25, freq = 2500 } = {}) {
  const t0 = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

/**
 * Gunshot: a loud noise crack whose low-pass filter closes fast (the "bang"
 * fading into a duller tail), layered with a short pitched-down body thump.
 */
function gunshot() {
  const t0 = ctx.currentTime;
  const dur = 0.45;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(9000, t0);
  lp.frequency.exponentialRampToValueAtTime(400, t0 + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp).connect(g).connect(master);
  src.start(t0);
  tone(150, { dur: 0.18, type: 'sine', vol: 0.7, slideTo: 45 });
}

/** Warning alarm: three sharp alternating high/low beeps. */
function alarm() {
  [0, 1, 2].forEach(i => {
    tone(i % 2 ? 660 : 990, { at: i * 0.13, dur: 0.11, type: 'square', vol: 0.18 });
  });
}

const play = (fn) => () => { if (!muted && audio()) fn(); };

export const Sfx = {
  shot:    play(gunshot),
  hit:     play(() => { tone(880, { at: 0.05, dur: 0.09, type: 'triangle', vol: 0.3 }); tone(1320, { at: 0.12, dur: 0.18, type: 'triangle', vol: 0.3 }); }),
  wrong:   play(() => { alarm(); }),
  timeout: play(() => { tone(520, { dur: 0.14, type: 'square', vol: 0.08 }); tone(390, { at: 0.14, dur: 0.22, type: 'square', vol: 0.08 }); }),
  stage:   play(() => { tone(330, { dur: 0.35, type: 'sawtooth', vol: 0.08, slideTo: 990 }); }),
  clear:   play(() => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.22, type: 'triangle', vol: 0.25 })); }),
  fail:    play(() => { [392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.24, type: 'square', vol: 0.08 })); }),
  win:     play(() => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.11, dur: i === 5 ? 0.6 : 0.18, type: 'triangle', vol: 0.28 })); }),

  get muted() { return muted; },
  toggle() {
    muted = !muted;
    Storage.saveSettings({ muted });
    return muted;
  },
  /** Call from a click/keypress so later effects are allowed to play. */
  unlock() { if (!muted) audio(); },
};
