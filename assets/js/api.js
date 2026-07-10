// Single entry point for all /api/v1/* calls. Never use bare fetch() for the API.
// Attaches the X-API-Token header (from window.__API_TOKEN__, set by
// /api/v1/client-config) and unwraps the { ok, ... } envelope, throwing on ok:false.

async function apiFetch(path, opts = {}) {
  const token = (typeof window !== 'undefined' && window.__API_TOKEN__) || '';
  const headers = Object.assign({ 'X-API-Token': token }, opts.headers || {});
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api/v1' + path, { ...opts, headers });
  } catch (e) {
    throw new Error('network error — check your connection');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || `request failed (HTTP ${res.status})`);
  }
  return data;
}

export const api = {
  whoami:       ()             => apiFetch('/whoami'),
  getSettings:  ()             => apiFetch('/settings'),
  saveSettings: (config)       => apiFetch('/settings', { method: 'POST', body: JSON.stringify({ config }) }),

  getHealth:    (date)         => apiFetch('/health' + (date ? `?date=${encodeURIComponent(date)}` : '')),
  setCheckin:   (key, done, date) => apiFetch('/health', { method: 'POST', body: JSON.stringify({ type: 'checkin', key, done, date }) }),
  setMetric:    (metric, value, date) => apiFetch('/health', { method: 'POST', body: JSON.stringify({ type: 'metric', metric, value, date }) }),

  dashboard:    ()             => apiFetch('/dashboard'),

  getTasks:     ()             => apiFetch('/tasks'),
  addTask:      (t)            => apiFetch('/tasks', { method: 'POST', body: JSON.stringify(t) }),
  updateTask:   (id, fields)   => apiFetch('/tasks', { method: 'PATCH', body: JSON.stringify({ id, ...fields }) }),
  deleteTask:   (id)           => apiFetch('/tasks', { method: 'DELETE', body: JSON.stringify({ id }) }),

  getHabits:    (days)         => apiFetch('/habits' + (days ? `?days=${days}` : '')),
  addHabit:     (h)            => apiFetch('/habits', { method: 'POST', body: JSON.stringify(h) }),
  logHabit:     (habit_id, value, date) => apiFetch('/habits', { method: 'POST', body: JSON.stringify({ action: 'log', habit_id, value, date }) }),
  updateHabit:  (id, fields)   => apiFetch('/habits', { method: 'PATCH', body: JSON.stringify({ id, ...fields }) }),
  deleteHabit:  (id)           => apiFetch('/habits', { method: 'DELETE', body: JSON.stringify({ id }) }),

  getJournal:   (date)         => apiFetch('/journal' + (date ? `?date=${encodeURIComponent(date)}` : '')),
  saveJournal:  (entry)        => apiFetch('/journal', { method: 'POST', body: JSON.stringify(entry) }),
};

export { apiFetch };
