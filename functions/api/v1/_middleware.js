/**
 * functions/api/v1/_middleware.js
 * Token gate + CORS + Cloudflare Access identity for all /api/v1/* endpoints.
 *
 *  · X-API-Token header must match env.API_TOKEN (fail-closed → 503 if unset).
 *  · Identity comes from Cloudflare Access (email header, or JWT-assertion fallback),
 *    resolved to a stable uid and attached to data.identity. Every endpoint scopes
 *    its queries to data.identity.uid.
 *  · LOCAL DEV: `wrangler pages dev` has no Access in front, so no identity header
 *    arrives. When env.DEV_EMAIL is set (only in .dev.vars, never in production) it
 *    stands in as the identity — enabling real per-user flows offline.
 *
 * Open (no token): /api/v1/client-config, /api/v1/health-check.
 */

import { resolveIdentity } from '../../lib/auth.js';

const ALLOWED_ORIGINS = [
  'http://localhost:8790',
  'http://127.0.0.1:8790',
  'https://daybook.pages.dev',   // ← replace/add your production domain
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Token',
    'Vary': 'Origin',
  };
}

export async function onRequest({ request, env, next, data }) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // Open endpoints
  if (url.pathname === '/api/v1/client-config') return next();
  if (url.pathname === '/api/v1/health-check')  return next();

  // Fail closed — API_TOKEN must be configured
  const secret = (env.API_TOKEN || '').trim();
  if (!secret) return new Response(
    JSON.stringify({ ok: false, error: 'API_TOKEN not configured — see SETUP.md' }),
    { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) } }
  );

  const token = (request.headers.get('X-API-Token') || '').trim();
  if (token !== secret) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) } }
    );
  }

  // Identity — Access email header, JWT-assertion fallback, or DEV_EMAIL locally.
  try {
    let accessEmail = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').toLowerCase().trim();
    const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion') || null;
    if (!accessEmail && !accessJwt) {
      const dev = (env.DEV_EMAIL || '').toLowerCase().trim();   // local-only stand-in
      if (dev) accessEmail = dev;
    }
    const identity = await resolveIdentity({ email: accessEmail, jwt: accessJwt, tokenValid: true, env });
    if (data) data.identity = identity;
  } catch { /* best-effort — never blocks the request */ }

  const response = await next();
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders(request)).forEach(([k, v]) => newHeaders.set(k, v));
  return new Response(response.body, { status: response.status, headers: newHeaders });
}
