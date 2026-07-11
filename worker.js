// Daybook Worker entry — serves the API (/api/v1/*) and hands everything else to
// the static-assets binding. Reuses the same handler modules as before; this file
// just replaces the Pages Functions router with an explicit one.
//
// Assets config (wrangler.toml): run_worker_first = ["/api/*"] routes API calls
// here; all other paths are served from static assets with SPA fallback.

import { resolveIdentity } from './functions/lib/auth.js';
import * as clientConfig from './functions/api/v1/client-config.js';
import * as healthCheck from './functions/api/v1/health-check.js';
import * as whoami from './functions/api/v1/whoami.js';
import * as settings from './functions/api/v1/settings.js';
import * as health from './functions/api/v1/health.js';
import * as dashboard from './functions/api/v1/dashboard.js';
import * as tasks from './functions/api/v1/tasks.js';
import * as habits from './functions/api/v1/habits.js';
import * as journal from './functions/api/v1/journal.js';

const ROUTES = {
  '/api/v1/client-config': clientConfig,
  '/api/v1/health-check': healthCheck,
  '/api/v1/whoami': whoami,
  '/api/v1/settings': settings,
  '/api/v1/health': health,
  '/api/v1/dashboard': dashboard,
  '/api/v1/tasks': tasks,
  '/api/v1/habits': habits,
  '/api/v1/journal': journal,
};
const OPEN = new Set(['/api/v1/client-config', '/api/v1/health-check']);

const ALLOWED_ORIGINS = [
  'http://localhost:8790',
  'http://127.0.0.1:8790',
  // production origin(s) auto-allowed below via same-origin check
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  let allow = ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) allow = origin;
  else {
    // same-origin (the deployed site calling its own API) is always allowed
    try { if (origin && new URL(origin).host === new URL(request.url).host) allow = origin; } catch { /* ignore */ }
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Token',
    'Vary': 'Origin',
  };
}

function jsonError(msg, status, extra = {}) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function pickHandler(mod, method) {
  if (typeof mod.onRequest === 'function') return mod.onRequest;
  const name = 'onRequest' + method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  return typeof mod[name] === 'function' ? mod[name] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Non-API: static assets (SPA). Normally unreachable due to run_worker_first,
    // but kept as a safety net.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const mod = ROUTES[url.pathname];
    if (!mod) return jsonError('not found', 404, cors);

    const data = {};
    if (!OPEN.has(url.pathname)) {
      const secret = (env.API_TOKEN || '').trim();
      if (!secret) return jsonError('API_TOKEN not configured — see SETUP.md', 503, cors);
      const token = (request.headers.get('X-API-Token') || '').trim();
      if (token !== secret) return jsonError('Unauthorized', 401, cors);

      try {
        let email = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').toLowerCase().trim();
        const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || null;
        if (!email && !jwt) { const dev = (env.DEV_EMAIL || '').toLowerCase().trim(); if (dev) email = dev; }
        data.identity = await resolveIdentity({ email, jwt, tokenValid: true, env });
      } catch { /* best-effort */ }
    }

    const fn = pickHandler(mod, request.method);
    if (!fn) return jsonError('method not allowed', 405, cors);

    let res;
    try { res = await fn({ request, env, data }); }
    catch (e) { return jsonError('server error', 500, cors); }

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
