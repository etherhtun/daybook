import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mintId, nowISO } from '../../lib/ids.js';

// GET    /api/v1/tasks            → { ok, tasks:[...] }
// POST   /api/v1/tasks {title,notes?,due_date?,priority?}
// PATCH  /api/v1/tasks {id, ...fields}   (done toggle sets done_at)
// DELETE /api/v1/tasks {id}
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const r = await db.prepare(
      `SELECT id,title,notes,due_date,priority,done,done_at,sort,created_at FROM tasks
       WHERE user_id = ? ORDER BY done, (due_date IS NULL), due_date, priority DESC, sort, created_at`
    ).bind(u.uid).all();
    return ok({ tasks: r.results || [] });
  }

  if (request.method === 'POST') {
    const b = await readJson(request);
    if (!b || !b.title || !String(b.title).trim()) return err('title required');
    const id = mintId('tsk'), now = nowISO();
    await db.prepare(
      `INSERT INTO tasks (id,user_id,title,notes,due_date,priority,done,done_at,sort,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, u.uid, String(b.title).trim().slice(0, 300), b.notes ? String(b.notes).slice(0, 2000) : null,
           b.due_date || null, Number.isInteger(b.priority) ? b.priority : 1, 0, null, 0, now).run();
    const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(id, u.uid).first();
    return ok({ task });
  }

  if (request.method === 'PATCH') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    const sets = [], vals = [];
    if (typeof b.title === 'string') { sets.push('title = ?'); vals.push(b.title.trim().slice(0, 300)); }
    if ('notes' in b) { sets.push('notes = ?'); vals.push(b.notes ? String(b.notes).slice(0, 2000) : null); }
    if ('due_date' in b) { sets.push('due_date = ?'); vals.push(b.due_date || null); }
    if (Number.isInteger(b.priority)) { sets.push('priority = ?'); vals.push(b.priority); }
    if ('done' in b) { sets.push('done = ?'); vals.push(b.done ? 1 : 0); sets.push('done_at = ?'); vals.push(b.done ? nowISO() : null); }
    if (Number.isInteger(b.sort)) { sets.push('sort = ?'); vals.push(b.sort); }
    if (!sets.length) return err('nothing to update');
    vals.push(u.uid, b.id);
    await db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`).bind(...vals).run();
    const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(b.id, u.uid).first();
    return ok({ task });
  }

  if (request.method === 'DELETE') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    await db.prepare('DELETE FROM tasks WHERE user_id = ? AND id = ?').bind(u.uid, b.id).run();
    return ok({ deleted: b.id });
  }

  return err('method not allowed', 405);
}
