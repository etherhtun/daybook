// JSON response helpers + identity guard. Convention: { ok:true, ... } / { ok:false, error }.

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
export function ok(data = {}) { return json({ ok: true, ...data }); }
export function err(message, status = 400) { return json({ ok: false, error: message }, status); }

// Returns the resolved user identity (kind:'user' with a uid) or null.
export function currentUser(data) {
  const id = data?.identity;
  if (id && id.kind === 'user' && id.uid) return id;
  return null;
}

// Parse a JSON body; returns null on malformed input (caller responds 400).
export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
