import { api } from '../api.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODULE_LABELS = { health: 'Health', tasks: 'Tasks & Habits', journal: 'Journal & Mood', money: 'Money & Bills', family: 'Family & Milestones' };
const WEEK = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('m_' + Math.random().toString(36).slice(2, 7));

let ctxRef, root, cfg;

export async function renderSetup(view, ctx) {
  ctxRef = ctx; root = view;
  cfg = JSON.parse(JSON.stringify(ctx.settings || {}));
  cfg.modules ||= []; cfg.health ||= {}; cfg.money ||= {};
  build();
}

function toggleRow(id, on, label, sub) {
  return `<div class="setrow"><span class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</span>
    <button class="toggle" id="${id}" type="button" aria-pressed="${on ? 'true' : 'false'}" aria-label="${label}"></button></div>`;
}

function mealRow(m) {
  return `<div class="addrow" data-mealrow data-id="${esc(m.id)}" style="margin-bottom:8px">
    <input class="field-in" type="time" value="${esc(m.time || '')}" data-mt style="max-width:118px">
    <input class="field-in" type="text" maxlength="60" placeholder="Meal name" value="${esc(m.name || '')}" data-mn style="flex:1;min-width:130px">
    <button class="del" type="button" data-mealdel aria-label="Remove">&times;</button>
  </div>`;
}
function metricRow(m) {
  const dir = (v) => m.dir === v ? ' selected' : '';
  return `<div class="addrow" data-metricrow data-key="${esc(m.key || '')}" style="margin-bottom:8px">
    <input class="field-in" type="text" maxlength="40" placeholder="Metric" value="${esc(m.label || '')}" data-mlabel style="flex:1;min-width:110px">
    <input class="field-in" type="text" maxlength="12" placeholder="unit" value="${esc(m.unit || '')}" data-munit style="max-width:74px">
    <select class="field-in" data-mdir style="max-width:150px">
      <option value="flat"${dir('flat')}>Just tracking</option>
      <option value="down"${dir('down')}>Lower is better</option>
      <option value="up"${dir('up')}>Higher is better</option>
    </select>
    <button class="del" type="button" data-metricdel aria-label="Remove">&times;</button>
  </div>`;
}

function build() {
  const h = cfg.health, m = cfg.money;
  const sec = { meals: true, hydration: true, workout: true, ...(h.sections || {}) };
  const meals = Array.isArray(h.meals) && h.meals.length ? h.meals
    : (h.mealTimes ? Object.keys(h.mealTimes).map(k => ({ id: k, time: h.mealTimes[k], name: (h.mealNames || {})[k] || k }))
      : [{ id: 'm1', time: '08:00', name: 'Breakfast' }, { id: 'm2', time: '12:30', name: 'Lunch' }, { id: 'm3', time: '19:00', name: 'Dinner' }]);
  let metrics = Array.isArray(h.metrics) ? h.metrics.map(x => typeof x === 'string' ? { key: x, label: x, unit: '', dir: 'flat' } : x) : [];
  if (!metrics.length) metrics = [{ key: 'weight', label: 'Bodyweight', unit: 'kg', dir: 'flat' }];
  const enabled = (k) => { const e = cfg.modules.find(x => x.key === k); return !e || e.enabled; };

  root.innerHTML = `
    <h1 class="view-title">Setup</h1><div class="accent-rule"></div>

    <div class="sec-eyebrow"><span class="num">01</span><h2>Profile</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <label class="jlabel">Display name</label>
      <input class="field-in" id="s-name" type="text" maxlength="80" placeholder="What should we call you?" value="${esc(cfg.displayName || '')}" style="width:100%">
    </div>

    <div class="sec-eyebrow"><span class="num">02</span><h2>Modules</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      ${Object.keys(MODULE_LABELS).map(k => toggleRow('mod-' + k, enabled(k), MODULE_LABELS[k])).join('')}
    </div>

    <div class="sec-eyebrow"><span class="num">03</span><h2>Health — Your Goal</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <label class="jlabel">Goal (shown at the top of Health)</label>
      <input class="field-in" id="s-goal" type="text" maxlength="120" placeholder="e.g. Run a 10k · Lower blood pressure · Build muscle" value="${esc(h.goal || '')}" style="width:100%;margin-bottom:6px">

      <div style="margin-top:6px">
        ${toggleRow('sec-meals', sec.meals, 'Track meals', 'daily meal check-ins')}
        ${toggleRow('sec-hydration', sec.hydration, 'Track hydration', 'water tumblers')}
        ${toggleRow('sec-workout', sec.workout, 'Track workouts', 'weekly A/B split + session')}
      </div>

      <label class="jlabel" style="margin-top:16px">Meals</label>
      <div id="meal-rows">${meals.map(mealRow).join('')}</div>
      <button class="btn" id="meal-add" type="button" style="margin-top:2px">+ Add meal</button>

      <label class="jlabel" style="margin-top:16px">Workout split</label>
      <div class="wk-row">${WEEK.map(([dow, nm]) => {
        const v = (h.workout || {})[dow] || '';
        return `<div><label>${nm}</label><select class="field-in" data-wk="${dow}">
          <option value=""${v === '' ? ' selected' : ''}>Rest</option>
          <option value="A"${v === 'A' ? ' selected' : ''}>A</option>
          <option value="B"${v === 'B' ? ' selected' : ''}>B</option></select></div>`;
      }).join('')}</div>

      <label class="jlabel" style="margin-top:16px">Hydration tumblers (2L each)</label>
      <input class="field-in" id="s-tumb" type="number" min="1" max="4" value="${Number(h.hydrationTumblers) || 2}" style="width:110px">
    </div>

    <div class="sec-eyebrow"><span class="num">04</span><h2>Metrics You Track</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <p class="muted" style="margin:0 0 12px">Any number you want to trend — weight, steps, resting HR, blood pressure, meditation minutes. Each gets a sparkline in Health.</p>
      <div id="metric-rows">${metrics.map(metricRow).join('')}</div>
      <button class="btn" id="metric-add" type="button" style="margin-top:2px">+ Add metric</button>
    </div>

    <div class="sec-eyebrow"><span class="num">05</span><h2>Money</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="grid2">
        <div><label class="jlabel">Currency</label>
          <input class="field-in" id="s-cur" type="text" maxlength="6" value="${esc(m.currency || 'SGD')}" style="width:100%"></div>
        <div><label class="jlabel">Categories (comma-separated)</label>
          <input class="field-in" id="s-cats" type="text" value="${esc((m.categories || []).join(', '))}" style="width:100%"></div>
      </div>
    </div>

    <div class="savebar"><button class="btn primary" id="s-save" type="button">Save Settings</button></div>`;

  root.querySelectorAll('.toggle').forEach(t => t.addEventListener('click', () =>
    t.setAttribute('aria-pressed', t.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')));
  root.querySelector('#meal-add').addEventListener('click', () => {
    root.querySelector('#meal-rows').insertAdjacentHTML('beforeend', mealRow({ id: 'm' + Date.now().toString(36), time: '', name: '' }));
  });
  root.querySelector('#metric-add').addEventListener('click', () => {
    root.querySelector('#metric-rows').insertAdjacentHTML('beforeend', metricRow({ key: '', label: '', unit: '', dir: 'flat' }));
  });
  root.addEventListener('click', (e) => {
    const md = e.target.closest('[data-mealdel]'); if (md) md.closest('[data-mealrow]').remove();
    const xd = e.target.closest('[data-metricdel]'); if (xd) xd.closest('[data-metricrow]').remove();
  });
  root.querySelector('#s-save').addEventListener('click', save);
}

async function save() {
  const next = JSON.parse(JSON.stringify(cfg));
  next.displayName = root.querySelector('#s-name').value.trim() || null;
  next.modules = Object.keys(MODULE_LABELS).map(k => ({ key: k, enabled: root.querySelector('#mod-' + k).getAttribute('aria-pressed') === 'true' }));

  // meals
  const meals = [...root.querySelectorAll('[data-mealrow]')].map(r => ({
    id: r.dataset.id || ('m' + Math.random().toString(36).slice(2, 7)),
    time: r.querySelector('[data-mt]').value,
    name: r.querySelector('[data-mn]').value.trim(),
  })).filter(m => m.name || m.time);

  // workout
  const workout = {};
  root.querySelectorAll('[data-wk]').forEach(s => { if (s.value) workout[s.dataset.wk] = s.value; });

  // metrics — keep stable key when present, else slug from label
  const usedKeys = new Set();
  const metrics = [...root.querySelectorAll('[data-metricrow]')].map(r => {
    const label = r.querySelector('[data-mlabel]').value.trim();
    if (!label) return null;
    let key = r.dataset.key || slug(label);
    while (usedKeys.has(key)) key += '_2';
    usedKeys.add(key);
    return { key, label: label.slice(0, 40), unit: r.querySelector('[data-munit]').value.trim().slice(0, 12), dir: r.querySelector('[data-mdir]').value };
  }).filter(Boolean);

  next.health = {
    goal: root.querySelector('#s-goal').value.trim(),
    sections: {
      meals: root.querySelector('#sec-meals').getAttribute('aria-pressed') === 'true',
      hydration: root.querySelector('#sec-hydration').getAttribute('aria-pressed') === 'true',
      workout: root.querySelector('#sec-workout').getAttribute('aria-pressed') === 'true',
    },
    meals: meals.length ? meals : [{ id: 'm1', time: '08:00', name: 'Breakfast' }],
    workout,
    hydrationTumblers: Math.max(1, Math.min(4, Number(root.querySelector('#s-tumb').value) || 2)),
    metrics: metrics.length ? metrics : [{ key: 'weight', label: 'Bodyweight', unit: 'kg', dir: 'flat' }],
  };

  next.money = { ...cfg.money, currency: root.querySelector('#s-cur').value.trim() || 'SGD',
    categories: root.querySelector('#s-cats').value.split(',').map(s => s.trim()).filter(Boolean) };

  try {
    const r = await api.saveSettings(next);
    cfg = r.settings; ctxRef.settings = r.settings;
    await ctxRef.refresh();
    ctxRef.toast('Settings saved');
  } catch (e) { ctxRef.toast(e.message, true); }
}
