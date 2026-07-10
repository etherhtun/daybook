import { ok, err, currentUser, readJson } from '../../lib/db.js';
import { mergeConfig } from '../../lib/config.js';
import { bustUserCache } from '../../lib/auth.js';
import { nowISO } from '../../lib/ids.js';

// GET  /api/v1/settings           → { ok, settings } (defaults merged in)
// POST /api/v1/settings {config}  → save + return merged config
export async function onRequest({ request, env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;

  if (request.method === 'GET') {
    let saved = null;
    try {
      const row = await db.prepare('SELECT config FROM settings WHERE user_id = ?').bind(u.uid).first();
      if (row?.config) saved = JSON.parse(row.config);
    } catch { /* fall through to defaults */ }
    return ok({ settings: mergeConfig(saved) });
  }

  if (request.method === 'POST') {
    const body = await readJson(request);
    if (!body || typeof body.config !== 'object' || body.config === null) {
      return err('expected { config: {...} }');
    }
    const merged = mergeConfig(body.config);
    try {
      await db.prepare(
        `INSERT INTO settings (user_id, config, updated_at) VALUES (?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
      ).bind(u.uid, JSON.stringify(merged), nowISO()).run();

      // Keep display name mirrored on the user row (used by whoami / greeting).
      const dn = typeof merged.displayName === 'string' ? merged.displayName.trim().slice(0, 80) : null;
      await db.prepare('UPDATE users SET display_name = ? WHERE uid = ?').bind(dn || null, u.uid).run();
      await bustUserCache(env, u.email);
    } catch (e) {
      return err('could not save settings', 500);
    }
    return ok({ settings: merged });
  }

  return err('method not allowed', 405);
}
