# Daybook — Setup

Daybook is a personal daily portal: **Cloudflare Pages + D1 + KV**, gated by **Cloudflare Access**, installable as a phone PWA. It runs entirely in *your* Cloudflare account — nothing is shared with any other project.

Everything below is a one-time setup. You can develop and test **locally without any of it** (see *Local development*).

---

## Prerequisites

- A Cloudflare account (free plan is fine).
- Node.js 18+ and `npx` available.
- A GitHub account (for auto-deploy).

---

## 1. Local development (no Cloudflare account needed)

```bash
cd ~/Documents/daybook
cp .dev.vars.example .dev.vars     # then edit values (API_TOKEN, DEV_EMAIL)
npm install                         # installs wrangler locally
npm run db:init:local               # creates the local SQLite + tables
npm run dev                         # http://localhost:8790
```

`DEV_EMAIL` in `.dev.vars` stands in for the Cloudflare Access identity that would
normally arrive in production — so you get real per-user behaviour offline. Change it
to a different email to prove data isolation (each email = its own dataset).

---

## 2. Provision your Cloudflare account

```bash
npx wrangler login

# Create the D1 database — copy the printed database_id
npx wrangler d1 create daybook

# Create the KV namespace — copy the printed id
npx wrangler kv namespace create DAYBOOK_KV
```

Then:

```bash
cp wrangler.toml.template wrangler.toml
# edit wrangler.toml: paste the real database_id -> {{DB_ID}}, kv id -> {{KV_ID}}
```

Apply the schema to the **remote** database:

```bash
npm run db:init:remote
```

---

## 3. Create the Pages project + connect GitHub (auto-deploy)

1. Push this folder to a new GitHub repo (`daybook`).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings: **Framework preset = None**, **Build command = (empty)**, **Build output directory = `/`**. (No build step.)
4. In the Pages project → **Settings → Bindings**, add:
   - D1 database binding **`DB`** → the `daybook` database.
   - KV namespace binding **`DAYBOOK_KV`** → the namespace you created.
5. In **Settings → Environment variables / Secrets**, add:
   - `API_TOKEN` — a long random string (the browser fetches it via `/api/v1/client-config`).
   - `ADMIN_EMAIL` — your email.
   - *(optional)* `CF_ACCESS_AUD` — the Access Application Audience tag (step 4).

Every push to the connected branch now auto-deploys.

---

## 4. Put Cloudflare Access in front (this is your login)

1. Cloudflare **Zero Trust → Access → Applications → Add → Self-hosted**.
2. Application domain = your Pages domain (e.g. `daybook.pages.dev` or your custom domain).
3. Add a policy: **Allow**, include the emails you want (yourself, and anyone you invite — each gets their own private Daybook).
4. *(optional but recommended)* copy the Application **Audience (AUD) tag** into the `CF_ACCESS_AUD` env var for stricter JWT verification.

Access now authenticates every visitor and hands Daybook a verified email; Daybook keys all of a user's data to that identity.

---

## Notes

- **Independent users:** every user's data is fully isolated by their Access email. There are no shared spaces.
- **Data location:** all user data lives in your D1 database; KV is only caches/JWKS.
- **Deploy manually if you prefer:** `npm run deploy` (`wrangler pages deploy .`) instead of git auto-deploy.
