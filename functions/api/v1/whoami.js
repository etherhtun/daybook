import { ok, err, currentUser } from '../../lib/db.js';

// GET /api/v1/whoami — who is signed in (drives the app shell).
export function onRequestGet({ data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  return ok({ email: u.email, uid: u.uid, displayName: u.displayName, role: u.role });
}
