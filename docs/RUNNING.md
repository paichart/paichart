# Running pAIchart locally (or self-hosting)

pAIchart is **two processes** behind one origin:

| Process | Command | Port | Serves |
|---|---|---|---|
| Web app (Next.js + custom server) | `npm run dev` (prod: `npm run start`) | 3000 | UI, `/api/*`, `/api/auth/jwks`, `/.well-known/mcp.json` |
| MCP HTTP server | `npm run mcp:http:dev` (prod: PM2 → `mcp-server-http-clean.js`) | 8080 | `/mcp`, `/oauth/authorize`, `/oauth/token`, `/oauth/callback`, `/.well-known/oauth-*`, `/health` |

In production a reverse proxy presents both as one host (`APP_BASE_URL`) — see the last section.

## Prerequisites
- Node **20** (tested on 20.18), npm 10
- PostgreSQL **16** with an empty database you can connect to
- `openssl` (for key generation)

## First run — seven commands

```bash
git clone <repo> paichart && cd paichart
npm ci

cp .env.example .env
#  → edit .env: set DATABASE_URL; leave everything else for now
npm run jwt:keys >> .env          # RS256 signing key pair — appends the three JWT_* lines (nothing to replace)
#  → OAUTH_STATE_SECRET: any strong random string (openssl rand -hex 32)
#  → ANTHROPIC_API_KEY (or set a provider key per-user in Settings after login)

#  → ADMIN_EMAIL=you@example.com (your first login; ADMIN_PASSWORD optional — generated + printed once if unset)

npm run db:seed                   # one shot, idempotent, safe to re-run: db push → generate → raw-SQL indexes →
                                  # role grants → first SUPER_ADMIN → "system" sentinel → theatres/countries → protocols

npm run dev                       # terminal 1 → http://localhost:3000
npm run mcp:http:dev              # terminal 2 → http://localhost:8080/health
```

Log in at http://localhost:3000/login with `ADMIN_EMAIL` and the password you set or were shown. Password login
works without any OAuth provider configured; OAuth providers are optional and covered in [OAUTH-SETUP.md](OAUTH-SETUP.md).

The individual steps `db:seed` runs (`db:indexes`, `db:permissions`, `db:admin`, `db:system-user`,
`seed:protocols`, `node scripts/seed-geographical-data.js`) can each be run alone; all are idempotent.
`db:permissions` never overwrites grants you changed in `/admin/permissions` (`-- --reset` restores the shipped
defaults); `db:admin` never rotates an existing account's password (`-- --reset-password` does).

## Roles — which one to give whom
pAIchart has four fixed roles. **`SUPER_ADMIN`** — the install owner: bypasses the permission table, is the only
role that can change what ADMINs may do, and is deliberately excluded from POV teams; `db:admin` creates exactly
one — use it for administration only. **`ADMIN`** — day-to-day administrator: sees and edits every POV, task and hub
service, manages users, settings, templates and workflows, but cannot create a SUPER_ADMIN; give it to the people
who run the platform (including yourself, via `/admin/users`). **`USER`** — standard member: creates POVs, works on
POVs they own or are a team member of, can register hub services. **`DEMO_USER`** — public read-only viewer for
POVs flagged as demo content; cannot create POVs, join teams or list users.

New sign-ups get `DEFAULT_USER_ROLE` (`.env.example` sets `USER` for a private install; unset = `DEMO_USER`, the
public-SaaS default). `ALLOW_REGISTRATION=false` closes sign-up entirely — `/register` returns 403 and OAuth first
logins are refused — so only `/admin/users` creates accounts.

First-request compiles in dev take 15–20 s per route; that is Next.js, not a hang.

Then prove the install owns its identity: [VERIFYING-SELF-HOST.md](VERIFYING-SELF-HOST.md) (5 minutes, all read-only except one API key).

## Optional next steps
| Want | Do |
|---|---|
| Agent templates for POV work | `npm run db:agents` (generic roles) — domain pipelines have their own `scripts/seed-*-templates.ts` |
| Phase templates | `npm run db:templates` |
| An API key for Claude Desktop / ChatGPT | log in → Settings → API Keys (mints an RS256 first-party token); paste as `X-API-Key` |
| Self-registration by email | **requires** `BREVO_API_KEY` (+ `BREVO_FROM_EMAIL`): the verification email is how a new user sets their password. Without a mail key, `/register` answers **503 with a clear message and inserts nothing** — create users in `/admin/users` instead (set a password there). OAuth sign-up needs no mail. Password *reset* is disabled by policy. |

## Verify
```bash
curl -s localhost:3000/api/health                              # {"status":"ok",…}
curl -s localhost:8080/health                                  # {"status":"ok","transport":"clean-http",…}
curl -s localhost:8080/.well-known/oauth-authorization-server  # issuer must equal your APP_BASE_URL
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/mcp    # 401 — correct without a token
```

## Production shape (reference)
`APP_BASE_URL` is the single public origin. A reverse proxy splits it:

```nginx
# everything MCP/OAuth → the MCP server
location ~ ^/(mcp|oauth/|\.well-known/oauth-) { proxy_pass http://127.0.0.1:8080; }
# everything else → the web app
location /                                    { proxy_pass http://127.0.0.1:3000; }
```
**`APP_BASE_URL` is your identity.** It becomes the JWT issuer, every token audience, and every URL the OAuth
discovery documents advertise. Rules: the exact public origin (`https://your-domain` — lower-case host, no path,
no trailing slash); **required in production** (both servers refuse to boot without it); **changing it later
invalidates every session and MCP connection** (users re-authenticate — refresh tokens carry the old audience);
scripts run env-blind, so `export APP_BASE_URL=…` in the shell before `ts-node` scripts that mint tokens; any
Docker service you run must set `PAICHART_ISSUER` to the same exact string; generate a fresh key pair per install.

Set `ARTIFACT_SIGNING_KEY` (required in production — signs public artifact download links), run both
processes under a supervisor (the repo's `ecosystem.config.js` is a PM2 example), and keep `.env` out of git.
`APP_INTERNAL_BASE_URL` lets the MCP server reach the web app without going back out through the proxy.
