import { api } from '../api.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let ctxRef, root, txns = [], bills = [], summary = {}, cur = 'SGD', cats = [];

export async function renderMoney(view, ctx) {
  ctxRef = ctx; root = view;
  cur = ctx.settings?.money?.currency || 'SGD';
  cats = ctx.settings?.money?.categories || ['Food', 'Transport', 'Home', 'Other'];
  view.innerHTML = `<h1 class="view-title">Money</h1><div class="accent-rule"></div><div class="loading">Loading&hellip;</div>`;
  try { const r = await api.getMoney(); txns = r.txns; bills = r.bills; summary = r.summary; }
  catch (e) { view.querySelector('.loading').outerHTML = `<div class="placeholder"><h3>Couldn't load</h3><p>${esc(e.message)}</p></div>`; return; }
  build();
}

const money = (n) => `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const monthName = () => new Date().toLocaleDateString(undefined, { month: 'long' });

function build() {
  root.innerHTML = `
    <h1 class="view-title">Money</h1><div class="accent-rule"></div>

    <div class="sec-eyebrow"><span class="num">01</span><h2>${esc(monthName())}</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="stat-row">
        <div class="stat hot"><div class="v" style="font-size:19px">${esc(money(summary.spent))}</div><div class="k">Spent</div></div>
        <div class="stat"><div class="v" style="font-size:19px">${esc(money(summary.income))}</div><div class="k">Income</div></div>
        <div class="stat"><div class="v" style="font-size:19px">${esc(money(summary.billsTotal))}</div><div class="k">Bills / mo</div></div>
        <div class="stat"><div class="v" style="font-size:19px">${esc(money((summary.income || 0) - (summary.spent || 0)))}</div><div class="k">Net</div></div>
      </div>
      <div id="catbars" style="margin-top:14px"></div>
    </div>

    <div class="sec-eyebrow"><span class="num">02</span><h2>Add</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="addrow" style="margin-bottom:8px">
        <select class="field-in" id="t-type" style="max-width:110px"><option value="expense">Expense</option><option value="income">Income</option></select>
        <input class="field-in" id="t-amt" type="number" step="0.01" min="0" placeholder="Amount" style="max-width:120px">
        <select class="field-in" id="t-cat">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      </div>
      <div class="addrow">
        <input class="field-in" id="t-note" type="text" maxlength="200" placeholder="Note (optional)" style="flex:1;min-width:160px">
        <button class="btn primary" id="t-add" type="button">Add</button>
      </div>
    </div>

    <div class="sec-eyebrow"><span class="num">03</span><h2>This Month</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span><div id="txn-list"></div></div>

    <div class="sec-eyebrow"><span class="num">04</span><h2>Bills</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div id="bill-list"></div>
      <div class="addrow" style="margin-top:12px">
        <input class="field-in" id="b-name" type="text" maxlength="80" placeholder="Bill name" style="flex:1;min-width:130px">
        <input class="field-in" id="b-amt" type="number" step="0.01" min="0" placeholder="Amount" style="max-width:110px">
        <input class="field-in" id="b-due" type="number" min="1" max="31" placeholder="Day" style="max-width:74px">
        <button class="btn primary" id="b-add" type="button">Add</button>
      </div>
    </div>`;

  renderCatBars(); renderTxns(); renderBills();
  root.querySelector('#t-add').addEventListener('click', addTxn);
  root.querySelector('#t-note').addEventListener('keydown', e => { if (e.key === 'Enter') addTxn(); });
  root.querySelector('#b-add').addEventListener('click', addBill);
}

function renderCatBars() {
  const wrap = root.querySelector('#catbars');
  const entries = Object.entries(summary.byCategory || {});
  if (!entries.length) { wrap.innerHTML = `<div class="muted">No spending logged yet this month.</div>`; return; }
  const max = Math.max(...entries.map(e => e[1]));
  wrap.innerHTML = entries.map(([c, v]) =>
    `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11.5px;color:var(--ink-soft);margin-bottom:3px"><span>${esc(c)}</span><span>${esc(money(v))}</span></div>
     <div style="height:7px;background:var(--panel-2);border:1px solid var(--edge);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:${Math.round(v / max * 100)}%;background:var(--orange)"></i></div></div>`
  ).join('');
}

function renderTxns() {
  const wrap = root.querySelector('#txn-list');
  if (!txns.length) { wrap.innerHTML = `<div class="empty">No transactions this month.</div>`; return; }
  wrap.innerHTML = txns.map(t => {
    const spend = t.amount < 0;
    return `<div class="rowflex" style="align-items:center">
      <div class="ci" style="flex:1;cursor:default">
        <span class="main"><span class="toprow" style="display:flex;justify-content:space-between;gap:8px">
          <span class="fn plain">${esc(t.category || 'Uncategorised')}</span>
          <span class="mono" style="font-weight:700;color:${spend ? 'var(--ink)' : 'var(--good)'}">${spend ? '' : '+'}${esc(money(Math.abs(t.amount)))}</span></span>
          <span class="load">${esc(t.date)}${t.note ? ' · ' + esc(t.note) : ''}</span></span></div>
      <button class="del" data-tdel="${t.id}" type="button" aria-label="Delete">&times;</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-tdel]').forEach(b => b.addEventListener('click', () => delTxn(b.dataset.tdel)));
}

function renderBills() {
  const wrap = root.querySelector('#bill-list');
  if (!bills.length) { wrap.innerHTML = `<div class="empty">No recurring bills yet.</div>`; return; }
  wrap.innerHTML = bills.map(b => `<div class="rowflex" style="align-items:center">
      <div class="ci" style="flex:1;cursor:default;${b.active ? '' : 'opacity:.5'}">
        <span class="main"><span class="toprow" style="display:flex;justify-content:space-between;gap:8px">
          <span class="fn plain">${esc(b.name)}</span><span class="mono" style="font-weight:700">${esc(money(b.amount))}</span></span>
          <span class="load">${b.due_day ? 'due day ' + b.due_day : ''} · ${esc(b.recurrence)}</span></span></div>
      <button class="del" data-bdel="${b.id}" type="button" aria-label="Delete">&times;</button>
    </div>`).join('');
  wrap.querySelectorAll('[data-bdel]').forEach(x => x.addEventListener('click', () => delBill(x.dataset.bdel)));
}

async function addTxn() {
  const amt = parseFloat(root.querySelector('#t-amt').value); if (!Number.isFinite(amt) || amt <= 0) return;
  const type = root.querySelector('#t-type').value;
  const payload = { amount: type === 'income' ? amt : -amt, category: root.querySelector('#t-cat').value, note: root.querySelector('#t-note').value.trim() || null, date: ymd() };
  try {
    const r = await api.addTxn(payload);
    txns.unshift(r.txn);
    if (type === 'income') summary.income = (summary.income || 0) + amt; else { summary.spent = (summary.spent || 0) + amt; summary.byCategory[payload.category] = (summary.byCategory[payload.category] || 0) + amt; }
    root.querySelector('#t-amt').value = ''; root.querySelector('#t-note').value = '';
    build();
  } catch (e) { ctxRef.toast(e.message, true); }
}
async function delTxn(id) {
  const t = txns.find(x => x.id === id); txns = txns.filter(x => x.id !== id);
  if (t) { if (t.amount < 0) { summary.spent -= Math.abs(t.amount); const c = t.category || 'Other'; if (summary.byCategory[c]) summary.byCategory[c] -= Math.abs(t.amount); } else summary.income -= t.amount; }
  build();
  try { await api.delMoney('txn', id); } catch (e) { ctxRef.toast(e.message, true); }
}
async function addBill() {
  const name = root.querySelector('#b-name').value.trim(); const amt = parseFloat(root.querySelector('#b-amt').value);
  if (!name || !Number.isFinite(amt)) return;
  const due = parseInt(root.querySelector('#b-due').value, 10);
  try {
    const r = await api.addBill({ name, amount: amt, due_day: Number.isFinite(due) ? due : null });
    bills.push(r.bill); summary.billsTotal = (summary.billsTotal || 0) + amt;
    root.querySelector('#b-name').value = ''; root.querySelector('#b-amt').value = ''; root.querySelector('#b-due').value = '';
    build();
  } catch (e) { ctxRef.toast(e.message, true); }
}
async function delBill(id) {
  const b = bills.find(x => x.id === id); bills = bills.filter(x => x.id !== id);
  if (b && b.active) summary.billsTotal -= b.amount;
  build();
  try { await api.delMoney('bill', id); } catch (e) { ctxRef.toast(e.message, true); }
}
