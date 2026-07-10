// Default per-user config. The settings endpoint returns this merged over whatever
// the user has saved, so new config keys get sensible defaults automatically.

export const DEFAULT_CONFIG = {
  displayName: null,
  // Home-screen module order + on/off. `key` matches a front-end module.
  modules: [
    { key: 'health',  enabled: true },
    { key: 'tasks',   enabled: true },
    { key: 'habits',  enabled: true },
    { key: 'journal', enabled: true },
    { key: 'money',   enabled: true },
    { key: 'family',  enabled: true },
  ],
  health: {
    // dow (0=Sun..6=Sat) → workout label; absent = rest day
    workout: { '1': 'A', '3': 'B', '5': 'A', '6': 'B' },
    mealTimes: { m1: '10:30', m2: '13:30', m3: '18:30', m4: '23:30' },
    mealNames: { m1: 'Brain / Muscle Prep', m2: 'LDL Scrubber', m3: 'Protein Synthesis', m4: 'Shift Fuel' },
    hydrationTumblers: 2,          // 2 tumblers × 4 cups (0.5L) = 4L
    metrics: ['weight', 'ldl'],    // numeric trends to track
  },
  money: {
    currency: 'SGD',
    categories: ['Food', 'Transport', 'Home', 'Kids', 'Health', 'Fun', 'Other'],
  },
};

// Shallow-ish merge: saved values win, defaults fill gaps (one level into objects).
export function mergeConfig(saved) {
  const base = structuredCloneSafe(DEFAULT_CONFIG);
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base, ...saved };
  for (const k of ['health', 'money']) {
    out[k] = { ...base[k], ...(saved[k] || {}) };
  }
  if (!Array.isArray(out.modules) || !out.modules.length) out.modules = base.modules;
  return out;
}

function structuredCloneSafe(o) {
  try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); }
}
