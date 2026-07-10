import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mintId, ymd } from '../../lib/ids.js';

// GET  /api/v1/health?date=YYYY-MM-DD&days=30
//   → { ok, date, checkins:{key:1}, metrics:{weight:78.2}, history:[{date,done}], series:{weight:[[date,val]],...} }
// POST /api/v1/health
//   { type:'checkin', key, done }            → toggle a boolean daily item
//   { type:'metric', metric, value, date? }  → log/replace a numeric metric
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const date = (url.searchParams.get('date') || ymd()).slice(0, 10);
    const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 120);
    const since = ymd(new Date(Date.now() - (days - 1) * 86400000));

    const checkins = {};
    const metrics = {};
    const history = [];
    const series = {};
    try {
      const cRows = await db.prepare('SELECT key, done FROM checkins WHERE user_id = ? AND date = ?')
        .bind(u.uid, date).all();
      for (const r of (cRows.results || [])) checkins[r.key] = r.done ? 1 : 0;

      const mRows = await db.prepare('SELECT metric, value FROM metrics WHERE user_id = ? AND date = ?')
        .bind(u.uid, date).all();
      for (const r of (mRows.results || [])) metrics[r.metric] = r.value;

      const hRows = await db.prepare(
        'SELECT date, COUNT(*) AS done FROM checkins WHERE user_id = ? AND done = 1 AND date >= ? GROUP BY date ORDER BY date'
      ).bind(u.uid, since).all();
      for (const r of (hRows.results || [])) history.push({ date: r.date, done: r.done });

      const sRows = await db.prepare(
        'SELECT date, metric, value FROM metrics WHERE user_id = ? AND date >= ? ORDER BY date'
      ).bind(u.uid, since).all();
      for (const r of (sRows.results || [])) {
        (series[r.metric] ||= []).push([r.date, r.value]);
      }
    } catch (e) {
      return err('could not load health data', 500);
    }
    return ok({ date, checkins, metrics, history, series });
  }

  if (request.method === 'POST') {
    const body = await readJson(request);
    if (!body || typeof body.type !== 'string') return err('expected { type, ... }');
    const date = (typeof body.date === 'string' ? body.date : ymd()).slice(0, 10);

    try {
      if (body.type === 'checkin') {
        if (typeof body.key !== 'string' || !body.key) return err('checkin requires a key');
        const done = body.done ? 1 : 0;
        await db.prepare(
          `INSERT INTO checkins (id, user_id, date, key, done) VALUES (?,?,?,?,?)
           ON CONFLICT(user_id, date, key) DO UPDATE SET done = excluded.done`
        ).bind(mintId('ci'), u.uid, date, body.key, done).run();
        return ok({ date, key: body.key, done });
      }
      if (body.type === 'metric') {
        if (typeof body.metric !== 'string' || !body.metric) return err('metric requires a name');
        const value = Number(body.value);
        if (!Number.isFinite(value)) return err('metric requires a numeric value');
        await db.prepare(
          `INSERT INTO metrics (id, user_id, date, metric, value) VALUES (?,?,?,?,?)
           ON CONFLICT(user_id, date, metric) DO UPDATE SET value = excluded.value`
        ).bind(mintId('mt'), u.uid, date, body.metric, value).run();
        return ok({ date, metric: body.metric, value });
      }
    } catch (e) {
      return err('could not save health data', 500);
    }
    return err('unknown type');
  }

  return err('method not allowed', 405);
}
