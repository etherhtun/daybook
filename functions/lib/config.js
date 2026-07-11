// Default per-user config. The settings endpoint returns this merged over whatever
// the user has saved, so new config keys get sensible defaults automatically.
// Health is goal-agnostic: sections toggle on/off, meals are a list, and metrics
// are fully user-defined ({ key, label, unit, dir }).

export const DEFAULT_CONFIG = {
  displayName: null,
  modules: [
    { key: 'health', enabled: true },
    { key: 'tasks', enabled: true },
    { key: 'habits', enabled: true },
    { key: 'journal', enabled: true },
    { key: 'money', enabled: true },
    { key: 'family', enabled: true },
  ],
  health: {
    goal: '',
    sections: { meals: true, hydration: true, workout: true },
    meals: [
      { id: 'm1', time: '08:00', name: 'Breakfast' },
      { id: 'm2', time: '12:30', name: 'Lunch' },
      { id: 'm3', time: '19:00', name: 'Dinner' },
    ],
    // dow (0=Sun..6=Sat) → workout label; absent = rest day
    workout: { '1': 'A', '3': 'B', '5': 'A', '6': 'B' },
    hydrationTumblers: 2,           // 2 tumblers × 4 cups (0.5L) = 4L
    // metrics: dir = 'down' (lower better) | 'up' (higher better) | 'flat' (just tracking)
    metrics: [
      { key: 'weight', label: 'Bodyweight', unit: 'kg', dir: 'flat' },
    ],
  },
  money: {
    currency: 'SGD',
    categories: ['Food', 'Transport', 'Home', 'Kids', 'Health', 'Fun', 'Other'],
  },
};

// Known legacy metric keys → sensible label/unit/dir (for migrating old string configs).
const LEGACY_METRIC = {
  weight: { label: 'Bodyweight', unit: 'kg', dir: 'flat' },
  ldl:    { label: 'LDL', unit: 'mg/dL', dir: 'down' },
  sleep:  { label: 'Sleep', unit: 'h', dir: 'up' },
};

export function slugKey(label, fallback = 'metric') {
  const s = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || `${fallback}_${Math.random().toString(36).slice(2, 7)}`;
}

// Coerce any (old or new) health config into the new shape.
function normalizeHealth(h) {
  const d = DEFAULT_CONFIG.health;
  h = h || {};
  const out = {
    goal: typeof h.goal === 'string' ? h.goal : '',
    sections: { ...d.sections, ...(h.sections || {}) },
    workout: h.workout && typeof h.workout === 'object' ? h.workout : { ...d.workout },
    hydrationTumblers: Number(h.hydrationTumblers) > 0 ? Math.min(4, Number(h.hydrationTumblers)) : 2,
    meals: [],
    metrics: [],
  };

  // Meals: new array form, or migrate legacy {mealTimes,mealNames}
  if (Array.isArray(h.meals)) {
    out.meals = h.meals.filter(m => m && m.id).map(m => ({ id: String(m.id), time: m.time || '', name: (m.name || '').slice(0, 60) }));
  } else if (h.mealTimes && typeof h.mealTimes === 'object') {
    out.meals = Object.keys(h.mealTimes).map(k => ({ id: k, time: h.mealTimes[k] || '', name: (h.mealNames?.[k] || k).slice(0, 60) }));
  }
  if (!out.meals.length) out.meals = d.meals.map(m => ({ ...m }));

  // Metrics: new object array, or migrate legacy string array
  if (Array.isArray(h.metrics)) {
    out.metrics = h.metrics.map(m => {
      if (typeof m === 'string') {
        const leg = LEGACY_METRIC[m] || { label: m, unit: '', dir: 'flat' };
        return { key: m, label: leg.label, unit: leg.unit, dir: leg.dir };
      }
      if (m && m.key) return { key: String(m.key), label: (m.label || m.key).slice(0, 40), unit: (m.unit || '').slice(0, 12), dir: ['down', 'up', 'flat'].includes(m.dir) ? m.dir : 'flat' };
      return null;
    }).filter(Boolean);
  }
  if (!out.metrics.length) out.metrics = d.metrics.map(m => ({ ...m }));

  return out;
}

// Saved values win, defaults fill gaps (one level into objects).
export function mergeConfig(saved) {
  const base = clone(DEFAULT_CONFIG);
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base, ...saved };
  out.money = { ...base.money, ...(saved.money || {}) };
  out.health = normalizeHealth(saved.health);
  if (!Array.isArray(out.modules) || !out.modules.length) out.modules = base.modules;
  return out;
}

function clone(o) { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); } }
