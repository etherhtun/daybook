import { api } from '../api.js';

const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHECK = '<span class="box"><svg viewBox="0 0 20 20"><path d="M4 10.5 L8.5 15 L16 5.5"/></svg></span>';

let ctxRef, root, tasks = [], habits = [], hlogs = {};

export async function renderTasks(view, ctx) {
  ctxRef = ctx; root = view;
  view.innerHTML = `<h1 class="view-title">Tasks</h1><div class="accent-rule"></div><div class="loading">Loading&hellip;</div>`;
  try {
    const [t, h] = await Promise.all([api.getTasks(), api.getHabits()]);
    tasks = t.tasks; habits = h.habits; hlogs = h.logs || {};
  } catch (e) {
    view.querySelector('.loading').outerHTML = `<div class="placeholder"><h3>Couldn't load</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  build();
}

function build() {
  root.innerHTML = `
    <h1 class="view-title">Tasks</h1><div class="accent-rule"></div>
    <div class="sec-eyebrow"><span class="num">01</span><h2>Habits</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div id="habits-wrap"></div>
      <div class="addrow" style="margin-top:12px">
        <input class="field-in" id="habit-new" type="text" placeholder="New habit&hellip;" maxlength="120">
        <button class="btn primary" id="habit-add" type="button">Add</button>
      </div>
    </div>
    <div class="sec-eyebrow"><span class="num">02</span><h2>To-Do</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="addrow" style="margin-bottom:12px">
        <input class="field-in" id="task-new" type="text" placeholder="Add a task&hellip;" maxlength="300">
        <input class="field-in" id="task-due" type="date" aria-label="Due date">
        <button class="btn primary" id="task-add" type="button">Add</button>
      </div>
      <div id="tasks-wrap"></div>
    </div>`;
  renderHabits(); renderTasksList();
  const ha = root.querySelector('#habit-new'), hb = root.querySelector('#habit-add');
  hb.addEventListener('click', addHabit);
  ha.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHabit(); });
  const ta = root.querySelector('#task-new'), tb = root.querySelector('#task-add');
  tb.addEventListener('click', addTask);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
}

// ── habits ────────────────────────────────────────────────────────────────────
function streakOf(id) {
  const logs = hlogs[id] || {}; let d = new Date();
  if (!(logs[ymd(d)] > 0)) d.setDate(d.getDate() - 1);
  let s = 0; while (logs[ymd(d)] > 0) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function renderHabits() {
  const wrap = root.querySelector('#habits-wrap');
  if (!habits.length) { wrap.innerHTML = `<div class="empty">No habits yet — add one below to start a streak.</div>`; return; }
  const today = ymd();
  wrap.innerHTML = habits.map(h => {
    const on = (hlogs[h.id] || {})[today] > 0;
    const s = streakOf(h.id);
    return `<div class="rowflex">
      <button class="ci" data-h="${h.id}" aria-pressed="${on ? 'true' : 'false'}" type="button">${CHECK}
        <span class="main"><span class="fn plain">${esc(h.name)}</span>
        <span class="load"><span class="streak-chip">${s > 0 ? '&#128293; ' + s + ' day' + (s > 1 ? 's' : '') : 'no streak yet'}</span></span></span></button>
      <button class="del" data-hdel="${h.id}" type="button" aria-label="Delete habit">&times;</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => toggleHabit(b.dataset.h, b)));
  wrap.querySelectorAll('[data-hdel]').forEach(b => b.addEventListener('click', () => delHabit(b.dataset.hdel)));
}
async function toggleHabit(id, btn) {
  const today = ymd(), cur = (hlogs[id] || {})[today] || 0, next = cur > 0 ? 0 : 1;
  (hlogs[id] ||= {}); if (next > 0) hlogs[id][today] = next; else delete hlogs[id][today];
  renderHabits();
  try { await api.logHabit(id, next, today); }
  catch (e) { if (cur > 0) (hlogs[id] ||= {})[today] = cur; else delete (hlogs[id] || {})[today]; renderHabits(); ctxRef.toast(e.message, true); }
}
async function addHabit() {
  const inp = root.querySelector('#habit-new'), name = inp.value.trim(); if (!name) return;
  inp.value = '';
  try { const r = await api.addHabit({ name }); habits.push(r.habit); renderHabits(); }
  catch (e) { ctxRef.toast(e.message, true); }
}
async function delHabit(id) {
  const prev = habits; habits = habits.filter(h => h.id !== id); renderHabits();
  try { await api.deleteHabit(id); }
  catch (e) { habits = prev; renderHabits(); ctxRef.toast(e.message, true); }
}

// ── tasks ─────────────────────────────────────────────────────────────────────
function renderTasksList() {
  const wrap = root.querySelector('#tasks-wrap');
  if (!tasks.length) { wrap.innerHTML = `<div class="empty">Nothing on the list. Add a task above.</div>`; return; }
  const today = ymd();
  wrap.innerHTML = tasks.map(t => {
    const overdue = !t.done && t.due_date && t.due_date < today;
    const due = t.due_date ? (t.due_date === today ? 'today' : t.due_date) : '';
    return `<div class="rowflex">
      <button class="ci" data-t="${t.id}" aria-pressed="${t.done ? 'true' : 'false'}" type="button">${CHECK}
        <span class="main"><span class="fn plain" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</span>
        ${due ? `<span class="load" style="${overdue ? 'color:var(--danger)' : ''}">${overdue ? '&#9888; ' : ''}${esc(due)}</span>` : ''}</span></button>
      <button class="del" data-tdel="${t.id}" type="button" aria-label="Delete task">&times;</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => toggleTask(b.dataset.t)));
  wrap.querySelectorAll('[data-tdel]').forEach(b => b.addEventListener('click', () => delTask(b.dataset.tdel)));
}
async function toggleTask(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  const was = t.done; t.done = was ? 0 : 1;
  // move done items down
  tasks.sort((a, b) => (a.done - b.done) || ((a.due_date == null) - (b.due_date == null)));
  renderTasksList();
  try { await api.updateTask(id, { done: !was }); }
  catch (e) { t.done = was; renderTasksList(); ctxRef.toast(e.message, true); }
}
async function addTask() {
  const inp = root.querySelector('#task-new'), due = root.querySelector('#task-due');
  const title = inp.value.trim(); if (!title) return;
  const payload = { title }; if (due.value) payload.due_date = due.value;
  inp.value = ''; due.value = '';
  try { const r = await api.addTask(payload); tasks.unshift(r.task); tasks.sort((a, b) => a.done - b.done); renderTasksList(); }
  catch (e) { ctxRef.toast(e.message, true); }
}
async function delTask(id) {
  const prev = tasks; tasks = tasks.filter(t => t.id !== id); renderTasksList();
  try { await api.deleteTask(id); }
  catch (e) { tasks = prev; renderTasksList(); ctxRef.toast(e.message, true); }
}
