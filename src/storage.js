/* ============================================================================
 * storage.js — local persistence (no backend required)
 * Persists user settings and per-(scenario × difficulty) personal bests and a
 * short run history in localStorage. All access goes through here so the shape
 * is versioned in exactly one place.
 * ========================================================================== */

const KEY = 'fps-aim-trainer/v1';

const DEFAULTS = {
  settings: {
    sensitivity: 1.0,
    scenario: 'grid',
    difficulty: 'medium',
    players: '1',
    muted: false,
  },
  // best[`${scenario}:${difficulty}`] = { score, accuracy, avgReact, plays }
  best: {},
  // history = [{ scenario, difficulty, score, accuracy, avgReact, ts }]
  history: [],
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    // Shallow-merge so newly-added fields get their defaults.
    return {
      settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
      best: data.best || {},
      history: data.history || [],
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked (private mode) — fail silently, game still works */
  }
}

const slot = (scenario, difficulty) => `${scenario}:${difficulty}`;

export const Storage = {
  getSettings() {
    return read().settings;
  },

  saveSettings(patch) {
    const data = read();
    data.settings = { ...data.settings, ...patch };
    write(data);
    return data.settings;
  },

  getBest(scenario, difficulty) {
    return read().best[slot(scenario, difficulty)] || null;
  },

  /**
   * Record a finished run. Returns { best, records } where `records` flags
   * which fields are new personal bests so the UI can celebrate them.
   */
  recordRun(run) {
    const data = read();
    const k = slot(run.scenario, run.difficulty);
    const prev = data.best[k] || { score: 0, accuracy: 0, avgReact: Infinity, plays: 0 };

    const records = {
      score: run.score > prev.score,
      accuracy: run.accuracy > prev.accuracy,
      // lower reaction time is better; ignore zero (no hits)
      avgReact: run.avgReact > 0 && run.avgReact < prev.avgReact,
    };

    data.best[k] = {
      score: Math.max(prev.score, run.score),
      accuracy: Math.max(prev.accuracy, run.accuracy),
      avgReact: records.avgReact ? run.avgReact
        : (prev.avgReact === Infinity ? (run.avgReact || 0) : prev.avgReact),
      plays: prev.plays + 1,
    };

    data.history.unshift({ ...run, ts: run.ts });
    data.history = data.history.slice(0, 50); // keep last 50

    write(data);
    return { best: data.best[k], records };
  },

  getHistory(limit = 10) {
    return read().history.slice(0, limit);
  },

  reset() {
    write(structuredClone(DEFAULTS));
  },
};
