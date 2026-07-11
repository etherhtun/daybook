import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mintId, nowISO, ymd } from '../../lib/ids.js';

// GET    /api/v1/money  → { ok, txns:[thisMonth], bills:[], summary:{spent,income,byCategory,billsTotal} }
// POST   /api/v1/money  { amount, category?, note?, date? }        → add transaction (amount<0 = spend)
// POST   /api/v1/money  { kind:'bill', name, amount, due_day?, recurrence? }
// PATCH  /api/v1/money  { kind:'bill', id, active? }
// DELETE /api/v1/money  { kind:'txn'|'bill', id }
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const monthStart = ymd().slice(0, 8) + '01';
    const txns = await db.prepare(
      `SELECT id,date,amount,category,note FROM money_txns WHERE user_id = ? AND date >= ? ORDER BY date DESC, rowid DESC`
    ).bind(u.uid, monthStart).all();
    const bills = await db.prepare(
      `SELECT id,name,amount,due_day,recurrence,active FROM bills WHERE user_id = ? ORDER BY active DESC, due_day`
    ).bind(u.uid).all();
    const sp = await db.prepare(`SELECT COALESCE(SUM(-amount),0) AS s FROM money_txns WHERE user_id=? AND amount<0 AND date>=?`).bind(u.uid, monthStart).first();
    const inc = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM money_txns WHERE user_id=? AND amount>0 AND date>=?`).bind(u.uid, monthStart).first();
    const cat = await db.prepare(`SELECT COALESCE(category,'Other') AS category, SUM(-amount) AS total FROM money_txns WHERE user_id=? AND amount<0 AND date>=? GROUP BY category ORDER BY total DESC`).bind(u.uid, monthStart).all();
    const bt = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM bills WHERE user_id=? AND active=1`).bind(u.uid).first();
    const byCategory = {};
    for (const r of (cat.results || [])) byCategory[r.category] = Math.round(r.total * 100) / 100;
    return ok({
      txns: txns.results || [], bills: bills.results || [],
      summary: {
        spent: Math.round((sp?.s || 0) * 100) / 100,
        income: Math.round((inc?.s || 0) * 100) / 100,
        billsTotal: Math.round((bt?.s || 0) * 100) / 100,
        byCategory,
      },
    });
  }

  if (request.method === 'POST') {
    const b = await readJson(request);
    if (!b) return err('bad body');
    if (b.kind === 'bill') {
      if (!b.name || !String(b.name).trim()) return err('bill name required');
      const amt = Number(b.amount); if (!Number.isFinite(amt)) return err('bill amount required');
      const id = mintId('bill');
      const due = Number.isInteger(b.due_day) ? Math.max(1, Math.min(31, b.due_day)) : null;
      await db.prepare(`INSERT INTO bills (id,user_id,name,amount,due_day,recurrence,active,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(id, u.uid, String(b.name).trim().slice(0, 80), amt, due, ['monthly', 'yearly', 'weekly'].includes(b.recurrence) ? b.recurrence : 'monthly', 1, nowISO()).run();
      const bill = await db.prepare(`SELECT id,name,amount,due_day,recurrence,active FROM bills WHERE id=? AND user_id=?`).bind(id, u.uid).first();
      return ok({ bill });
    }
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount === 0) return err('amount required');
    const id = mintId('txn'), date = (typeof b.date === 'string' ? b.date : ymd()).slice(0, 10);
    await db.prepare(`INSERT INTO money_txns (id,user_id,date,amount,category,note,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(id, u.uid, date, Math.round(amount * 100) / 100, b.category ? String(b.category).slice(0, 40) : null, b.note ? String(b.note).slice(0, 200) : null, nowISO()).run();
    const txn = await db.prepare(`SELECT id,date,amount,category,note FROM money_txns WHERE id=? AND user_id=?`).bind(id, u.uid).first();
    return ok({ txn });
  }

  if (request.method === 'PATCH') {
    const b = await readJson(request);
    if (!b || b.kind !== 'bill' || !b.id) return err('bill id required');
    if (!('active' in b)) return err('nothing to update');
    await db.prepare(`UPDATE bills SET active=? WHERE user_id=? AND id=?`).bind(b.active ? 1 : 0, u.uid, b.id).run();
    return ok({ id: b.id });
  }

  if (request.method === 'DELETE') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    const table = b.kind === 'bill' ? 'bills' : 'money_txns';
    await db.prepare(`DELETE FROM ${table} WHERE user_id=? AND id=?`).bind(u.uid, b.id).run();
    return ok({ deleted: b.id });
  }

  return err('method not allowed', 405);
}
