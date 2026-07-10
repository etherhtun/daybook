import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mintId, nowISO, ymd } from '../../lib/ids.js';

// GET    /api/v1/habits?days=60   → { ok, habits:[...], logs:{habitId:{date:value}} }
// POST   /api/v1/habits {name,kind?,target?,cadence?}     → create
// POST   /api/v1/habits {action:'log', habit_id, value, date?}  → upsert/clear a day
// PATCH  /api/v1/habits {id, ...fields}
// DELETE /api/v1/habits {id}
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '60', 10) || 60, 180);
    const since = ymd(new Date(Date.now() - (days - 1) * 86400000));
    const hr = await db.prepare('SELECT id,name,kind,target,cadence,sort,active FROM habits WHERE user_id = ? AND active = 1 ORDER BY sort, name').bind(u.uid).all();
    const lr = await db.prepare('SELECT habit_id,date,value FROM habit_logs WHERE user_id = ? AND date >= ?').bind(u.uid, since).all();
    const logs = {};
    for (const r of (lr.results || [])) { (logs[r.habit_id] ||= {})[r.date] = r.value; }
    return ok({ habits: hr.results || [], logs });
  }

  if (request.method === 'POST') {
    const b = await readJson(request);
    if (!b) return err('bad body');

    if (b.action === 'log') {
      if (!b.habit_id) return err('habit_id required');
      const date = (typeof b.date === 'string' ? b.date : ymd()).slice(0, 10);
      const value = Number(b.value);
      if (!Number.isFinite(value) || value <= 0) {
        await db.prepare('DELETE FROM habit_logs WHERE user_id = ? AND habit_id = ? AND date = ?').bind(u.uid, b.habit_id, date).run();
        return ok({ habit_id: b.habit_id, date, value: 0 });
      }
      await db.prepare(
        `INSERT INTO habit_logs (id,user_id,habit_id,date,value) VALUES (?,?,?,?,?)
         ON CONFLICT(user_id,habit_id,date) DO UPDATE SET value = excluded.value`
      ).bind(mintId('hl'), u.uid, b.habit_id, date, value).run();
      return ok({ habit_id: b.habit_id, date, value });
    }

    if (!b.name || !String(b.name).trim()) return err('name required');
    const id = mintId('hab');
    await db.prepare(
      `INSERT INTO habits (id,user_id,name,kind,target,cadence,sort,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(id, u.uid, String(b.name).trim().slice(0, 120), b.kind === 'count' ? 'count' : 'bool',
           Number(b.target) > 0 ? Number(b.target) : 1, typeof b.cadence === 'string' ? b.cadence : 'daily',
           Number.isInteger(b.sort) ? b.sort : 0, 1, nowISO()).run();
    const habit = await db.prepare('SELECT id,name,kind,target,cadence,sort,active FROM habits WHERE id = ? AND user_id = ?').bind(id, u.uid).first();
    return ok({ habit });
  }

  if (request.method === 'PATCH') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    const sets = [], vals = [];
    if (typeof b.name === 'string') { sets.push('name = ?'); vals.push(b.name.trim().slice(0, 120)); }
    if ('active' in b) { sets.push('active = ?'); vals.push(b.active ? 1 : 0); }
    if (typeof b.cadence === 'string') { sets.push('cadence = ?'); vals.push(b.cadence); }
    if (Number(b.target) > 0) { sets.push('target = ?'); vals.push(Number(b.target)); }
    if (Number.isInteger(b.sort)) { sets.push('sort = ?'); vals.push(b.sort); }
    if (!sets.length) return err('nothing to update');
    vals.push(u.uid, b.id);
    await db.prepare(`UPDATE habits SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`).bind(...vals).run();
    return ok({ id: b.id });
  }

  if (request.method === 'DELETE') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    await db.prepare('DELETE FROM habit_logs WHERE user_id = ? AND habit_id = ?').bind(u.uid, b.id).run();
    await db.prepare('DELETE FROM habits WHERE user_id = ? AND id = ?').bind(u.uid, b.id).run();
    return ok({ deleted: b.id });
  }

  return err('method not allowed', 405);
}
