import { api } from '../api.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function renderHome(view, ctx) {
  view.innerHTML = `<h1 class="view-title">Today</h1><div class="accent-rule"></div><div class="loading">Loading&hellip;</div>`;
  let d;
  try { d = (await api.dashboard()).dashboard; }
  catch (e) {
    view.querySelector('.loading').outerHTML = `<div class="placeholder"><h3>Couldn't load</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  const cur = ctx.settings?.money?.currency || 'SGD';
  const name = ctx.settings?.displayName || (ctx.me?.email || 'there').split('@')[0];
  const h = new Date().getHours();
  const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

  const money = (n) => `${cur} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const card = (go, nm, big, sub) =>
    `<button class="card" data-go="${go}"><div class="ct"><span class="nm">${nm}</span></div>
     <div class="big">${big}</div><div class="sub">${sub}</div></button>`;

  const tasksN = d.tasks.dueToday + d.tasks.overdue;
  const cards = [
    card('health', 'Health', `${d.health.doneToday}`, d.health.weight != null ? `logged · ${d.health.weight} kg` : 'items logged today'),
    card('tasks', 'Tasks', `${tasksN}`, d.tasks.overdue ? `${d.tasks.overdue} overdue` : 'due today'),
    card('tasks', 'Habits', `${d.habits.doneToday}/${d.habits.active}`, 'done today'),
    card('journal', 'Journal', d.journal.doneToday ? 'Done' : '—', d.journal.doneToday ? 'entry saved' : 'write today'),
    card('money', 'Money', money(d.money.spentThisMonth), d.money.nextBill ? `next: ${esc(d.money.nextBill.name)}` : 'spent this month'),
    card('family', 'Family', d.family.upcoming ? esc(d.family.upcoming.title) : '—', d.family.upcoming ? esc(d.family.upcoming.date) : 'nothing upcoming'),
  ];

  view.innerHTML =
    `<h1 class="view-title">Today</h1><div class="accent-rule"></div>
     <div class="greeting">${greet}, <b>${esc(name)}</b> &middot; ${dateStr}</div>
     <div class="home-grid">${cards.join('')}</div>`;
  view.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.go)));
}
