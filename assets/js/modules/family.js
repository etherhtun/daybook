import { api } from '../api.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND_ICON = { milestone: '⭐', event: '\u{1F4C5}', birthday: '\u{1F382}' };

let ctxRef, root, items = [];

export async function renderFamily(view, ctx) {
  ctxRef = ctx; root = view;
  view.innerHTML = `<h1 class="view-title">Family</h1><div class="accent-rule"></div><div class="loading">Loading&hellip;</div>`;
  try { items = (await api.getFamily()).items; }
  catch (e) { view.querySelector('.loading').outerHTML = `<div class="placeholder"><h3>Couldn't load</h3><p>${esc(e.message)}</p></div>`; return; }
  build();
}

// Days from today until an item's next occurrence (birthdays recur yearly). null if no date.
function daysAway(it) {
  if (!it.date) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const parts = it.date.split('-').map(Number);
  let target;
  if (it.kind === 'birthday') {
    target = new Date(now.getFullYear(), (parts[1] || 1) - 1, parts[2] || 1);
    if (target < now) target.setFullYear(now.getFullYear() + 1);
  } else {
    target = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }
  return Math.round((target - now) / 86400000);
}
function awayLabel(d) {
  if (d == null) return '';
  if (d < 0) return `${-d}d ago`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d}d`;
}

function build() {
  const withDays = items.map(it => ({ ...it, days: daysAway(it) }));
  const upcoming = withDays.filter(it => it.days != null && it.days >= 0 && it.days <= 120).sort((a, b) => a.days - b.days);

  root.innerHTML = `
    <h1 class="view-title">Family</h1><div class="accent-rule"></div>

    <div class="sec-eyebrow"><span class="num">01</span><h2>Coming Up</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span><div id="upcoming"></div></div>

    <div class="sec-eyebrow"><span class="num">02</span><h2>Add</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="addrow" style="margin-bottom:8px">
        <select class="field-in" id="f-kind" style="max-width:130px"><option value="event">Event</option><option value="milestone">Milestone</option><option value="birthday">Birthday</option></select>
        <input class="field-in" id="f-date" type="date" style="max-width:150px">
      </div>
      <div class="addrow" style="margin-bottom:8px">
        <input class="field-in" id="f-title" type="text" maxlength="120" placeholder="Title (e.g. First steps, School concert)" style="flex:1;min-width:160px">
      </div>
      <div class="addrow">
        <input class="field-in" id="f-person" type="text" maxlength="60" placeholder="Who (optional)" style="flex:1;min-width:120px">
        <button class="btn primary" id="f-add" type="button">Add</button>
      </div>
    </div>

    <div class="sec-eyebrow"><span class="num">03</span><h2>All</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span><div id="all-list"></div></div>`;

  renderUpcoming(upcoming); renderAll(withDays);
  root.querySelector('#f-add').addEventListener('click', addItem);
  root.querySelector('#f-title').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
}

function line(it, showDelete) {
  return `<div class="rowflex" style="align-items:center">
    <div class="ci" style="flex:1;cursor:default">
      <span class="main"><span class="toprow" style="display:flex;justify-content:space-between;gap:8px">
        <span class="fn plain">${KIND_ICON[it.kind] || ''} ${esc(it.title)}</span>
        <span class="mono" style="font-weight:700;color:var(--orange)">${esc(awayLabel(it.days))}</span></span>
        <span class="load">${it.person ? esc(it.person) + ' · ' : ''}${it.date ? esc(it.date) : 'no date'}${it.notes ? ' · ' + esc(it.notes) : ''}</span></span></div>
    ${showDelete ? `<button class="del" data-fdel="${it.id}" type="button" aria-label="Delete">&times;</button>` : ''}
  </div>`;
}
function renderUpcoming(list) {
  const wrap = root.querySelector('#upcoming');
  wrap.innerHTML = list.length ? list.map(it => line(it, false)).join('') : `<div class="empty">Nothing in the next few months. Add a birthday or event below.</div>`;
}
function renderAll(list) {
  const wrap = root.querySelector('#all-list');
  if (!list.length) { wrap.innerHTML = `<div class="empty">No entries yet.</div>`; return; }
  wrap.innerHTML = list.map(it => line(it, true)).join('');
  wrap.querySelectorAll('[data-fdel]').forEach(b => b.addEventListener('click', () => delItem(b.dataset.fdel)));
}

async function addItem() {
  const title = root.querySelector('#f-title').value.trim(); if (!title) return;
  const payload = { kind: root.querySelector('#f-kind').value, title, date: root.querySelector('#f-date').value || null, person: root.querySelector('#f-person').value.trim() || null };
  try {
    const r = await api.addFamily(payload); items.push(r.item);
    root.querySelector('#f-title').value = ''; root.querySelector('#f-date').value = ''; root.querySelector('#f-person').value = '';
    build();
  } catch (e) { ctxRef.toast(e.message, true); }
}
async function delItem(id) {
  const prev = items; items = items.filter(x => x.id !== id); build();
  try { await api.delFamily(id); } catch (e) { items = prev; build(); ctxRef.toast(e.message, true); }
}
