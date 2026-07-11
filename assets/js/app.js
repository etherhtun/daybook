// Daybook app shell — boots identity + settings, renders modules, hash router,
// phone-first bottom nav, theme, toast.
import { api } from './api.js';
import { renderHome } from './modules/home.js';
import { renderHealth } from './modules/health.js';
import { renderTasks } from './modules/tasks.js';
import { renderJournal } from './modules/journal.js';
import { renderSetup } from './modules/setup.js';
import { renderMoney } from './modules/money.js';
import { renderFamily } from './modules/family.js';

// ---- inline nav icons ----
const IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  health: '<path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/>',
  tasks: '<path d="M4 6h16M4 12h16M4 18h10"/><path d="M9 6l-2 2-1-1" transform="translate(11 0)"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  journal: '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M9 4v16"/>',
  family: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.2"/><path d="M15 20a5 5 0 0 1 6-3"/>',
  setup: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2"/>',
};

const PLACEHOLDER = {};

const ctx = { me: null, settings: null, go, toast, refresh };

// ---- theme ----
function initTheme() {
  const saved = localStorage.getItem('daybook-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const isDark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('daybook-theme', next);
    window.dispatchEvent(new CustomEvent('daybook:theme'));
  });
}

// ---- clock ----
function startClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n;
    el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  tick(); setInterval(tick, 15000);
}

// ---- toast ----
let toastTimer = null;
function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast' + (isErr ? ' err' : ''); }, 2600);
}

// ---- nav ----
const NAV = [
  { key: 'home', label: 'Home' },
  { key: 'health', label: 'Health' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'money', label: 'Money' },
  { key: 'more', label: 'More' },
];
function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.map(n =>
    `<button data-key="${n.key}" type="button"><svg class="ic" viewBox="0 0 24 24">${IC[n.key]}</svg>${n.label}</button>`
  ).join('');
  nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.key)));
}
function setActiveNav(key) {
  const primary = new Set(['home', 'health', 'tasks', 'money']);
  const active = primary.has(key) ? key : 'more';
  document.querySelectorAll('#nav button').forEach(b =>
    b.setAttribute('aria-current', b.dataset.key === active ? 'true' : 'false'));
}

// ---- router ----
function go(key) { location.hash = '#/' + key; }
function currentKey() { return (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0]; }

async function route() {
  const key = currentKey();
  setActiveNav(key);
  const view = document.getElementById('view');
  window.scrollTo(0, 0);

  if (key === 'home') return renderHome(view, ctx);
  if (key === 'health') return renderHealth(view, ctx);
  if (key === 'tasks') return renderTasks(view, ctx);
  if (key === 'journal') return renderJournal(view, ctx);
  if (key === 'money') return renderMoney(view, ctx);
  if (key === 'family') return renderFamily(view, ctx);
  if (key === 'setup') return renderSetup(view, ctx);
  if (key === 'more') return renderMore(view);
  if (PLACEHOLDER[key]) return renderPlaceholder(view, key);
  return renderHome(view, ctx);
}

function renderMore(view) {
  const items = [['health', 'Health'], ['tasks', 'Tasks & Habits'], ['journal', 'Journal & Mood'],
                 ['money', 'Money & Bills'], ['family', 'Family & Milestones'], ['setup', 'Setup']];
  view.innerHTML = `<h1 class="view-title">More</h1><div class="accent-rule"></div>
    <div class="home-grid">` + items.map(([k, l]) =>
      `<button class="card" data-go="${k}"><div class="ct"><span class="nm">${l}</span>
       <svg class="ic" viewBox="0 0 24 24" width="20" height="20" style="fill:none;stroke:var(--ink-faint);stroke-width:2">${IC[k] || IC.more}</svg></div>
       <div class="sub">Open</div></button>`).join('') + `</div>`;
  view.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
}

function renderPlaceholder(view, key) {
  const [title, desc] = PLACEHOLDER[key];
  view.innerHTML = `<h1 class="view-title">${title}</h1><div class="accent-rule"></div>
    <div class="placeholder"><h3>Arriving soon</h3><p>${desc}</p>
    <p style="margin-top:14px"><span class="chip cyan">Next update</span></p></div>`;
}

// ---- settings refresh (after Setup saves) ----
async function refresh() {
  try { const s = await api.getSettings(); ctx.settings = s.settings; } catch { /* keep old */ }
}

// ---- service worker ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

// ---- boot ----
async function boot() {
  initTheme(); startClock(); registerSW();
  try {
    const [me, s] = await Promise.all([api.whoami(), api.getSettings()]);
    ctx.me = me; ctx.settings = s.settings;
  } catch (e) {
    document.getElementById('view').innerHTML =
      `<div class="placeholder"><h3>Can't sign in</h3><p>${e.message}</p>
       <p style="margin-top:12px" class="muted">If this persists, check that Cloudflare Access is configured (see SETUP.md).</p></div>`;
    return;
  }
  buildNav();
  window.addEventListener('hashchange', route);
  route();
}

boot();
