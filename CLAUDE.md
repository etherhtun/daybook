# CLAUDE.md — Daybook

Developer reference for AI-assisted work on this repo. Read before making changes.

---

## What This Is

**Daybook** is a personal daily portal — the one page you open every day. It tracks life
across pluggable modules (Health, Tasks & Habits, Journal & Mood, Money & Bills, Family &
Milestones) and **syncs across every device** because all data lives server-side.

- **Multi-user, fully isolated.** Each person signs in through Cloudflare Access; their
  data is keyed to a stable `uid` and never visible to anyone else.
- **Self-configurable.** Each user turns modules on/off and edits each module's settings
  (meal times, workout split, budget categories, habits…) from an in-app Setup screen.
- **Phone-first PWA.** Installable to the home screen, works offline, app-like nav.

It runs in **its own Cloudflare account and GitHub repo** — independent of any other
project. Conventions were borrowed from `kairos-optix` but the infra is separate.

---

## Stack (Actual)

| Layer | Technology |
|---|---|
| Hosting | Cloudflare Pages (static files + Pages Functions) |
| Functions runtime | Cloudflare Workers (V8 isolates — no Node.js APIs) |
| Database | Cloudflare **D1** (SQLite), binding `DB`, database `daybook` — source of truth |
| Key-value | Cloudflare **KV**, binding `DAYBOOK_KV` — JWKS + identity cache only |
| Auth (login) | **Cloudflare Access** (verified email) in front of everything |
| Auth (API) | `X-API-Token` header, validated in `_middleware.js` |
| Frontend | Vanilla JS single-page app, no framework, **no build step** |
| Local dev | `wrangler pages dev . --port 8790` |
| Deploy | Git auto-deploy (Cloudflare ↔ GitHub) or `npm run deploy` |

**Explicitly NOT used:** Node.js runtime APIs, any framework/bundler, TypeScript build,
Postgres/Redis, WebSockets. Keep it dependency-light and buildless.

---

## Project Layout

```
wrangler.toml.template   ← committed; {{DB_ID}}/{{KV_ID}} placeholders (SETUP.md fills them)
wrangler.toml            ← gitignored (real/local IDs)
.dev.vars.example        ← committed; .dev.vars is gitignored (secrets)
SETUP.md                 ← one-time Cloudflare provisioning (D1/KV/Pages/Access)
_headers                 ← CSP/HSTS; no-cache on sw.js + manifest
manifest.webmanifest  sw.js  index.html
migrations/              ← 0001_core.sql, 0002_modules.sql (apply via wrangler d1 execute)
assets/
  css/app.css            ← blueprint design tokens (navy/steel + orange/cyan, light+dark)
  js/ app.js  api.js  modules/{home,health,tasks,habits,journal,money,family,setup}.js
functions/
  api/v1/  _middleware.js  client-config.js  health-check.js  whoami.js  settings.js
           health.js  tasks.js  habits.js  journal.js  money.js  family.js  dashboard.js
  lib/     auth.js  db.js  config.js  ids.js
```

---

## Non-Negotiable Rules

### 1. Every query is scoped to the current user
All user data tables carry a `user_id` column = `users.uid`. **Every** SELECT/UPDATE/
DELETE MUST include `WHERE user_id = ?` bound to `data.identity.uid`. Never trust a
user id from the request body or query string — it comes only from the resolved
identity. Use `currentUser(data)` (`lib/db.js`); if it returns null, respond `401`.

### 2. Response envelope
Every JSON endpoint returns `{ ok: true, ...data }` or `{ ok: false, error: "human message" }`.
Use `ok()` / `err(msg, status)` from `lib/db.js`. Errors carry an actionable message.

### 3. D1 = prepared statements only
Always `db.prepare(sql).bind(...).first()/.all()/.run()`. **Never** string-interpolate
values into SQL. Upserts use `INSERT ... ON CONFLICT(...) DO UPDATE SET col = excluded.col`.
Schema: `CREATE TABLE IF NOT EXISTS`, TEXT primary keys (`mintId()` from `lib/ids.js`),
ISO-8601 date/datetime strings, explicit `CREATE INDEX ... (user_id, date)`.

### 4. Frontend calls the API only through `apiFetch()`
Never bare `fetch()` for `/api/v1/*`. `assets/js/api.js` attaches the `X-API-Token`
header (pulled once from `/api/v1/client-config`). It returns parsed JSON and throws on
`ok:false` so callers can `try/catch`.

### 5. The service worker never caches `/api/`
`sw.js`: `/api/*` always hits the network (live data + auth). Static assets =
stale-while-revalidate; HTML navigations = network-first with cached-shell fallback.
Bump the cache name on any shell change so clients pick it up.

### 6. Config-driven, never hardcoded
Module behavior (meal times, workout split, categories, habit list) reads from the
user's config, not constants. Defaults live once in `lib/config.js` (`DEFAULT_CONFIG` +
`mergeConfig`); the Setup screen edits the saved config. Adding a config key = add it to
`DEFAULT_CONFIG` so existing users inherit the default via `mergeConfig`.

---

## Auth / Identity Flow

1. Cloudflare Access authenticates the visitor and injects
   `Cf-Access-Authenticated-User-Email` (or only `Cf-Access-Jwt-Assertion` on custom
   domains — verified via JWKS in `lib/auth.js:verifyAccessJwt`).
2. `_middleware.js` checks `X-API-Token`, resolves identity, attaches `data.identity`
   (`{ kind, email, uid, displayName, role, status }`), and injects CORS.
3. `resolveIdentity` lazily provisions a `users` row on first sign-in
   (`getOrCreateUser`, KV-cached 1h). `ADMIN_EMAIL` is break-glass admin.
4. **Local dev:** no Access in front, so `_middleware.js` falls back to `env.DEV_EMAIL`
   (set only in `.dev.vars`) as the identity. Change `DEV_EMAIL` to test isolation.
   `DEV_EMAIL` must never be set in production.

`whoami.js` exposes the identity to the shell. `bustUserCache(env, email)` clears the KV
cache after changing display name/role.

---

## Adding a Module (the pattern)

1. **Data:** add a table in a new `migrations/000N_*.sql` (with `user_id` + indexes).
2. **API:** add `functions/api/v1/<module>.js` — one file, method-branch or
   `onRequestGet/Post/...`, scoped to `currentUser(data).uid`, `{ok,error}` envelope.
3. **Config:** add defaults under the module's key in `DEFAULT_CONFIG`.
4. **Frontend:** add `assets/js/modules/<module>.js` (render + `apiFetch`), register it in
   `app.js`, and expose its settings in `modules/setup.js`.
5. **Dashboard:** surface a glance in `dashboard.js` + the Home module.

---

## Local Development

```bash
cp .dev.vars.example .dev.vars     # set API_TOKEN, DEV_EMAIL
npm install
npm run db:init:local              # apply migrations to local SQLite
npm run dev                        # http://localhost:8790
```

Inspect local data:
```bash
wrangler d1 execute daybook --local --command "SELECT * FROM tasks"
```

Full Cloudflare provisioning (D1/KV/Pages/Access) is in **SETUP.md**.

---

## Cloudflare Workers Constraints (Never Violate)

- **~10ms–50ms CPU per request** — keep handlers lean; no heavy loops.
- **Stateless** — no in-memory persistence between requests; use D1/KV.
- **KV is eventually consistent** — don't rely on immediate read-after-write; D1 is the
  source of truth, KV is cache only.
- **D1 is SQLite** — no stored procedures; watch `RETURNING` support on old compat dates.
- **No Node APIs** — use Web Crypto (`crypto.subtle`), `fetch`, Web streams.

---

## What "Done" Looks Like

1. Every new query is `user_id`-scoped to `data.identity.uid`.
2. `{ok,error}` envelope; `apiFetch()` on the client (no bare fetch).
3. New config keys added to `DEFAULT_CONFIG`.
4. Verified locally: create/toggle/log → reload → **persists** in D1; switching
   `DEV_EMAIL` proves isolation.
5. PWA still installs and `/api/` is never served from cache.
6. Clear commit message (`feat:`, `fix:`, `refactor:`).

---

## Milestones

- **A** — Foundation + Health (auth, D1, PWA shell, Home glance, Health synced). ✅ done
- **B** — Tasks & Habits + Journal + Setup UI. ✅ done
- **C** — Money & Bills + Family & Milestones. ← current
- **D** — Home aggregation polish, Weekly Review, production deploy.
  (Optional later: read-only trading P&L glance from Kairos Optix via its Data API key.)
