import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mintId, nowISO, ymd } from '../../lib/ids.js';

// GET  /api/v1/journal?date=YYYY-MM-DD → { ok, date, entry|null, recent:[{date,mood,win}] }
// POST /api/v1/journal {date?, mood?, energy?, text?, gratitude?, win?}  → upsert by day
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const date = (url.searchParams.get('date') || ymd()).slice(0, 10);
    const entry = await db.prepare('SELECT date,mood,energy,text,gratitude,win FROM journal WHERE user_id = ? AND date = ?').bind(u.uid, date).first();
    const recent = await db.prepare('SELECT date,mood,win FROM journal WHERE user_id = ? ORDER BY date DESC LIMIT 14').bind(u.uid).all();
    return ok({ date, entry: entry || null, recent: recent.results || [] });
  }

  if (request.method === 'POST') {
    const b = await readJson(request);
    if (!b) return err('bad body');
    const date = (typeof b.date === 'string' ? b.date : ymd()).slice(0, 10);
    const clamp = (n) => Number.isInteger(n) ? Math.max(1, Math.min(5, n)) : null;
    const mood = clamp(b.mood), energy = clamp(b.energy);
    const text = b.text ? String(b.text).slice(0, 5000) : null;
    const grat = b.gratitude ? String(b.gratitude).slice(0, 1000) : null;
    const win = b.win ? String(b.win).slice(0, 500) : null;
    await db.prepare(
      `INSERT INTO journal (id,user_id,date,mood,energy,text,gratitude,win,created_at) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,date) DO UPDATE SET mood=excluded.mood, energy=excluded.energy, text=excluded.text, gratitude=excluded.gratitude, win=excluded.win`
    ).bind(mintId('jr'), u.uid, date, mood, energy, text, grat, win, nowISO()).run();
    return ok({ date });
  }

  return err('method not allowed', 405);
}
