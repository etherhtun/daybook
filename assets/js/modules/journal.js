import { api } from '../api.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MOODS = ['\u{1F614}', '\u{1F610}', '\u{1F642}', '\u{1F600}', '\u{1F929}']; // 1..5

let ctxRef, root, entry = {}, recent = [];

export async function renderJournal(view, ctx) {
  ctxRef = ctx; root = view;
  view.innerHTML = `<h1 class="view-title">Journal</h1><div class="accent-rule"></div><div class="loading">Loading&hellip;</div>`;
  try { const r = await api.getJournal(); entry = r.entry || {}; recent = r.recent || []; }
  catch (e) { view.querySelector('.loading').outerHTML = `<div class="placeholder"><h3>Couldn't load</h3><p>${esc(e.message)}</p></div>`; return; }
  build();
}

function seg(name, current, emoji) {
  const btns = [1, 2, 3, 4, 5].map(i =>
    `<button type="button" data-seg="${name}" data-val="${i}" aria-pressed="${current === i ? 'true' : 'false'}">${emoji ? MOODS[i - 1] : i}</button>`
  ).join('');
  return `<div class="seg" id="seg-${name}">${btns}</div>`;
}

function build() {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  root.innerHTML = `
    <h1 class="view-title">Journal</h1><div class="accent-rule"></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2>Today</h2><span class="fig">${esc(today)}</span></div>
      <div class="jfield"><label class="jlabel">Mood</label>${seg('mood', entry.mood || 0, true)}</div>
      <div class="jfield"><label class="jlabel">Energy</label>${seg('energy', entry.energy || 0, false)}</div>
      <div class="jfield"><label class="jlabel">Win of the day</label>
        <input class="field-in" id="j-win" type="text" maxlength="500" placeholder="One good thing&hellip;" value="${esc(entry.win || '')}"></div>
      <div class="jfield"><label class="jlabel">Grateful for</label>
        <input class="field-in" id="j-grat" type="text" maxlength="1000" placeholder="Anything&hellip;" value="${esc(entry.gratitude || '')}"></div>
      <div class="jfield"><label class="jlabel">Notes</label>
        <textarea class="field-in" id="j-text" maxlength="5000" placeholder="How did the day go?">${esc(entry.text || '')}</textarea></div>
      <div class="savebar"><button class="btn primary" id="j-save" type="button">Save Entry</button></div>
    </div>
    ${recent.length ? `<div class="sec-eyebrow"><span class="num">02</span><h2>Recent</h2><span class="line"></span></div>
      <div class="panel"><span class="bk"></span>${recent.map(r =>
        `<div class="recent-item"><span>${r.mood ? MOODS[r.mood - 1] + ' ' : ''}<b>${esc(r.date)}</b></span><span>${esc(r.win || '')}</span></div>`).join('')}</div>` : ''}`;

  root.querySelectorAll('.seg').forEach(s => s.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const name = b.dataset.seg, val = Number(b.dataset.val);
    entry[name] = entry[name] === val ? 0 : val;   // tap again to clear
    s.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', Number(x.dataset.val) === entry[name] ? 'true' : 'false'));
  })));
  root.querySelector('#j-save').addEventListener('click', save);
}

async function save() {
  const payload = {
    mood: entry.mood || null,
    energy: entry.energy || null,
    win: root.querySelector('#j-win').value.trim() || null,
    gratitude: root.querySelector('#j-grat').value.trim() || null,
    text: root.querySelector('#j-text').value.trim() || null,
  };
  try { await api.saveJournal(payload); ctxRef.toast('Journal saved'); }
  catch (e) { ctxRef.toast(e.message, true); }
}
