import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mintId, nowISO } from '../../lib/ids.js';

// GET    /api/v1/family → { ok, items:[...] } (all, newest-dated first; client computes "upcoming")
// POST   /api/v1/family { kind, title, person?, date?, notes? }
// PATCH  /api/v1/family { id, ...fields }
// DELETE /api/v1/family { id }
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const r = await db.prepare(
      `SELECT id,kind,person,title,date,notes,created_at FROM family WHERE user_id = ? ORDER BY (date IS NULL), date`
    ).bind(u.uid).all();
    return ok({ items: r.results || [] });
  }

  if (request.method === 'POST') {
    const b = await readJson(request);
    if (!b || !b.title || !String(b.title).trim()) return err('title required');
    const id = mintId('fam');
    const kind = ['milestone', 'event', 'birthday'].includes(b.kind) ? b.kind : 'event';
    await db.prepare(`INSERT INTO family (id,user_id,kind,person,title,date,notes,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id, u.uid, kind, b.person ? String(b.person).slice(0, 60) : null, String(b.title).trim().slice(0, 120),
            b.date || null, b.notes ? String(b.notes).slice(0, 500) : null, nowISO()).run();
    const item = await db.prepare(`SELECT id,kind,person,title,date,notes FROM family WHERE id=? AND user_id=?`).bind(id, u.uid).first();
    return ok({ item });
  }

  if (request.method === 'PATCH') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    const sets = [], vals = [];
    if (typeof b.title === 'string') { sets.push('title=?'); vals.push(b.title.trim().slice(0, 120)); }
    if ('person' in b) { sets.push('person=?'); vals.push(b.person ? String(b.person).slice(0, 60) : null); }
    if ('date' in b) { sets.push('date=?'); vals.push(b.date || null); }
    if ('notes' in b) { sets.push('notes=?'); vals.push(b.notes ? String(b.notes).slice(0, 500) : null); }
    if (['milestone', 'event', 'birthday'].includes(b.kind)) { sets.push('kind=?'); vals.push(b.kind); }
    if (!sets.length) return err('nothing to update');
    vals.push(u.uid, b.id);
    await db.prepare(`UPDATE family SET ${sets.join(', ')} WHERE user_id=? AND id=?`).bind(...vals).run();
    return ok({ id: b.id });
  }

  if (request.method === 'DELETE') {
    const b = await readJson(request);
    if (!b || !b.id) return err('id required');
    await db.prepare(`DELETE FROM family WHERE user_id=? AND id=?`).bind(u.uid, b.id).run();
    return ok({ deleted: b.id });
  }

  return err('method not allowed', 405);
}
