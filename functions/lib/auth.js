/**
 * functions/lib/auth.js — Multi-user identity resolution.
 *
 * Adapted from kairos-optix. Cloudflare Access authenticates → verified email;
 * this module maps that to a stable surrogate `uid` used to key ALL user data.
 *
 * Three identity classes: user (Access email) / system (token, no email) / anon.
 * getOrCreateUser never throws — on any KV/D1 error it returns a transient default
 * so identity resolution can never block a request.
 *
 * KV binding: DAYBOOK_KV. D1 binding: DB.
 */

// ── Cloudflare Access JWT verification ───────────────────────────────────────
// On custom domains Access may inject only the signed JWT assertion
// (Cf-Access-Jwt-Assertion) and omit the convenience email header. The JWT is the
// authoritative identity — verify RS256 against the team's JWKS and read `email`.
function _b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function _b64urlJson(s) { return JSON.parse(new TextDecoder().decode(_b64urlBytes(s))); }

async function _accessJwks(env, teamHost) {
  const kv = env?.DAYBOOK_KV, cacheKey = `cf_access_jwks:${teamHost}`;
  if (kv) { try { const c = await kv.get(cacheKey, 'json'); if (c) return c; } catch { /* miss */ } }
  const r = await fetch(`https://${teamHost}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const jwks = await r.json();
  if (kv) { try { await kv.put(cacheKey, JSON.stringify(jwks), { expirationTtl: 3600 }); } catch { /* non-fatal */ } }
  return jwks;
}

// Returns the verified lowercased email, or null. Never throws.
export async function verifyAccessJwt(token, env) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = _b64urlJson(parts[0]); payload = _b64urlJson(parts[1]); } catch { return null; }

  const iss = (payload.iss || '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(iss)) return null;
  const teamHost = iss.slice('https://'.length);

  if (payload.exp && Date.now() / 1000 > payload.exp + 60) return null;   // expired (60s skew)

  const expectedAud = (env?.CF_ACCESS_AUD || '').trim();
  if (expectedAud) {
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(expectedAud)) return null;
  }

  try {
    const jwks = await _accessJwks(env, teamHost);
    const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const okSig = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, _b64urlBytes(parts[2]),
                                             new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!okSig) return null;
  } catch { return null; }

  const email = (payload.email || payload.identity || '').toString().toLowerCase().trim();
  return email || null;
}

function mintUid() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * Resolve (and lazily provision) the user row for a verified email.
 * KV-cached (1h) to stay off the D1 hot path. Idempotent INSERT OR IGNORE on the
 * email unique key. Never throws — returns a transient default on backend error.
 */
export async function getOrCreateUser(env, email) {
  const kv = env?.DAYBOOK_KV, db = env?.DB;
  const cacheKey = `user:${email}`;

  if (kv) { try { const c = await kv.get(cacheKey, 'json'); if (c) return c; } catch { /* cache miss */ } }

  let row = null;
  if (db) {
    try {
      row = await db.prepare('SELECT uid, email, display_name, role, status FROM users WHERE email = ?').bind(email).first();
      if (!row) {
        const now = new Date().toISOString();
        const adminEmail = (env?.ADMIN_EMAIL || '').toLowerCase().trim();
        const role = (adminEmail && email === adminEmail) ? 'admin' : 'member';
        await db.prepare(
          'INSERT OR IGNORE INTO users (uid, email, display_name, role, status, created_at) VALUES (?,?,?,?,?,?)'
        ).bind(mintUid(), email, null, role, 'active', now).run();
        row = await db.prepare('SELECT uid, email, display_name, role, status FROM users WHERE email = ?').bind(email).first();
      }
    } catch { /* D1 unavailable → transient default below */ }
  }

  const user = row || { uid: null, email, display_name: null, role: 'member', status: 'active' };
  if (kv && row) { try { await kv.put(cacheKey, JSON.stringify(user), { expirationTtl: 3600 }); } catch { /* non-fatal */ } }
  return user;
}

/**
 * Resolve identity for a request.
 *   email present        → user (lazily provisioned; admin is break-glass via ADMIN_EMAIL)
 *   no email, tokenValid → system caller
 *   neither              → anon
 */
export async function resolveIdentity({ email, jwt, tokenValid, env }) {
  let resolvedEmail = email;
  if (!resolvedEmail && jwt) {
    try { resolvedEmail = await verifyAccessJwt(jwt, env); } catch { /* stays null */ }
  }
  if (resolvedEmail) {
    const user = await getOrCreateUser(env, resolvedEmail);
    const adminEmail = (env?.ADMIN_EMAIL || '').toLowerCase().trim();
    const isAdmin = (!!adminEmail && resolvedEmail === adminEmail) || user.role === 'admin';
    return {
      kind: 'user',
      email: resolvedEmail,
      uid: user.uid,
      displayName: user.display_name || null,
      role: isAdmin ? 'admin' : (user.role || 'member'),
      status: user.status || 'active',
    };
  }
  if (tokenValid) return { kind: 'system', email: null, uid: null, role: 'system' };
  return { kind: 'anon', email: null, uid: null, role: 'anon' };
}

// Bust the KV identity cache (call after changing a user's display name/role).
export async function bustUserCache(env, email) {
  try { await env?.DAYBOOK_KV?.delete(`user:${email}`); } catch { /* non-fatal */ }
}
