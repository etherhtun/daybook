import { api } from '../api.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODULE_LABELS = { health: 'Health', tasks: 'Tasks & Habits', journal: 'Journal & Mood', money: 'Money & Bills', family: 'Family & Milestones' };
const WEEK = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];
const METRIC_OPTS = [['weight', 'Weight'], ['ldl', 'LDL'], ['sleep', 'Sleep']];

let ctxRef, root, cfg;

export async function renderSetup(view, ctx) {
  ctxRef = ctx; root = view;
  cfg = JSON.parse(JSON.stringify(ctx.settings || {}));
  cfg.modules ||= []; cfg.health ||= {}; cfg.money ||= {};
  build();
}

function toggle(id, on, label, sub) {
  return `<div class="setrow"><span class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</span>
    <button class="toggle" id="${id}" type="button" aria-pressed="${on ? 'true' : 'false'}" aria-label="${label}"></button></div>`;
}

function build() {
  const h = cfg.health, m = cfg.money;
  const mealKeys = Object.keys(h.mealTimes || { m1: '', m2: '', m3: '', m4: '' });
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
      ${Object.keys(MODULE_LABELS).map(k => toggle('mod-' + k, enabled(k), MODULE_LABELS[k])).join('')}
    </div>

    <div class="sec-eyebrow"><span class="num">03</span><h2>Health</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <label class="jlabel">Meals</label>
      <div id="meal-rows">${mealKeys.map(k => `
        <div class="addrow" style="margin-bottom:8px" data-meal="${k}">
          <input class="field-in" type="time" value="${esc((h.mealTimes || {})[k] || '')}" data-mt="${k}" style="max-width:120px">
          <input class="field-in" type="text" maxlength="60" placeholder="Meal name" value="${esc((h.mealNames || {})[k] || '')}" data-mn="${k}" style="flex:1;min-width:140px">
        </div>`).join('')}</div>

      <label class="jlabel" style="margin-top:12px">Workout split</label>
      <div class="wk-row">${WEEK.map(([dow, nm]) => {
        const v = (h.workout || {})[dow] || '';
        return `<div><label>${nm}</label><select class="field-in" data-wk="${dow}">
          <option value=""${v === '' ? ' selected' : ''}>Rest</option>
          <option value="A"${v === 'A' ? ' selected' : ''}>A</option>
          <option value="B"${v === 'B' ? ' selected' : ''}>B</option></select></div>`;
      }).join('')}</div>

      <div class="grid2" style="margin-top:12px">
        <div><label class="jlabel">Hydration tumblers (2L each)</label>
          <input class="field-in" id="s-tumb" type="number" min="1" max="4" value="${Number(h.hydrationTumblers) || 2}" style="width:100%"></div>
        <div><label class="jlabel">Track metrics</label>
          <div class="seg" id="s-metrics">${METRIC_OPTS.map(([k, l]) => {
            const on = (h.metrics || ['weight', 'ldl']).includes(k);
            return `<button type="button" data-metric="${k}" aria-pressed="${on ? 'true' : 'false'}">${l}</button>`;
          }).join('')}</div></div>
      </div>
    </div>

    <div class="sec-eyebrow"><span class="num">04</span><h2>Money</h2><span class="line"></span></div>
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
  root.querySelector('#s-metrics').querySelectorAll('button').forEach(b => b.addEventListener('click', () =>
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')));
  root.querySelector('#s-save').addEventListener('click', save);
}

async function save() {
  const next = JSON.parse(JSON.stringify(cfg));
  next.displayName = root.querySelector('#s-name').value.trim() || null;

  next.modules = Object.keys(MODULE_LABELS).map(k => ({ key: k, enabled: root.querySelector('#mod-' + k).getAttribute('aria-pressed') === 'true' }));

  const mt = {}, mn = {};
  root.querySelectorAll('[data-mt]').forEach(i => { mt[i.dataset.mt] = i.value; });
  root.querySelectorAll('[data-mn]').forEach(i => { mn[i.dataset.mn] = i.value.trim(); });
  const workout = {};
  root.querySelectorAll('[data-wk]').forEach(s => { if (s.value) workout[s.dataset.wk] = s.value; });
  const metrics = [...root.querySelectorAll('#s-metrics button[aria-pressed="true"]')].map(b => b.dataset.metric);
  next.health = { ...cfg.health, mealTimes: mt, mealNames: mn, workout,
    hydrationTumblers: Math.max(1, Math.min(4, Number(root.querySelector('#s-tumb').value) || 2)),
    metrics: metrics.length ? metrics : ['weight'] };

  next.money = { ...cfg.money, currency: root.querySelector('#s-cur').value.trim() || 'SGD',
    categories: root.querySelector('#s-cats').value.split(',').map(s => s.trim()).filter(Boolean) };

  try {
    const r = await api.saveSettings(next);
    cfg = r.settings; ctxRef.settings = r.settings;
    await ctxRef.refresh();
    ctxRef.toast('Settings saved');
  } catch (e) { ctxRef.toast(e.message, true); }
}
