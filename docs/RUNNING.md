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
npm run --silent jwt:keys >> .env # RS256 signing key pair — appends the three JWT_* lines (nothing to replace).
                                  # --silent matters: without it npm's "> jwt:keys" banner lands in .env too (harmless to the
                                  # servers, but `source .env` then runs it as a command and creates a stray file)
#  → OAUTH_STATE_SECRET: any strong random string (openssl rand -hex 32)
#  → ANTHROPIC_API_KEY (or set a provider key per-user in Settings after login)

#  → ADMIN_EMAIL=you@example.com (your first login; ADMIN_PASSWORD optional — generated + printed once if unset)

npm run db:seed                   # one shot, idempotent, safe to re-run: db push → generate → raw-SQL indexes →
                                  # role grants → first SUPER_ADMIN → "system" sentinel → theatres/countries → protocols → hub prompts →
                                  # agent / harness / program / domain / phase templates

npm run dev                       # terminal 1 → http://localhost:3000
npm run mcp:http:dev              # terminal 2 → http://localhost:8080/health
```

Log in at http://localhost:3000/login with `ADMIN_EMAIL` and the password you set or were shown. Password login
works without any OAuth provider configured; OAuth providers are optional and covered in [OAUTH-SETUP.md](OAUTH-SETUP.md).

The individual steps `db:seed` runs (`db:indexes`, `db:permissions`, `db:admin`, `db:system-user`,
`seed:protocols`, `node scripts/seed-geographical-data.js`, the hub-prompts seed, `db:agents` and the other template seeds) can each be run alone; all are idempotent. **Run alone, they are env-blind** — `set -a; . ./.env; set +a` first, or they fail on `DATABASE_URL` (`db:seed` loads `.env` for all of them).
`db:permissions` never overwrites grants you changed in `/admin/permissions` (`-- --reset` restores the shipped
defaults); `db:admin` never rotates an existing account's password (`-- --reset-password` does).

## Roles — which one to give whom
pAIchart has four fixed roles. **`SUPER_ADMIN`** — the install owner: bypasses the permission table, is the only
role that can change what ADMINs may do, and is deliberately excluded from POV teams; `db:admin` creates exactly
one — use it for administration only. **`ADMIN`** (shown as *System Admin* in the GUI; the *Admin Dashboard* menu item itself is visible only to the Super Admin) — day-to-day administrator: sees and edits every POV, task and hub
service, manages users, settings, templates and workflows, but cannot create a SUPER_ADMIN; give it to the people
who run the platform (including yourself, via `/admin/users`). **`USER`** — standard member: creates POVs, works on
POVs they own or are a team member of, can register hub services. **`DEMO_USER`** — public read-only viewer for
POVs flagged as demo content; cannot create POVs, join teams or list users.

New sign-ups get `DEFAULT_USER_ROLE` (`.env.example` sets `USER` for a private install; unset = `DEMO_USER`, the
public-SaaS default). `ALLOW_REGISTRATION=false` closes sign-up entirely — `/register` returns 403 and OAuth first
logins are refused — so only `/admin/users` creates accounts.

First-request compiles in dev take 15–20 s per route; that is Next.js, not a hang.

## Two ports, one origin — which URL is which
The web app and `/api/*` are on **:3000**; everything MCP/OAuth runs in the second process on **:8080**, which
binds **loopback only** (`MCP_HTTP_BIND_ALL=true` exposes it — only behind a reverse proxy or on a trusted
network). `APP_BASE_URL` is the origin the MCP server *advertises*: every OAuth discovery URL and the 401 that
starts a client's login point at `${APP_BASE_URL}/oauth/…`. So the MCP paths must be reachable **on the
`APP_BASE_URL` origin**, and they are:

- **in development** (`npm run dev`) the web server itself proxies `/mcp`, `/oauth/*` and `/.well-known/oauth-*`
  to :8080 — the same rule nginx applies in production, drift-tested (`npm run test:dev-mcp-proxy`). Point
  Claude Desktop / ChatGPT at `${APP_BASE_URL}/mcp` and it works with no nginx. If the MCP process is not
  running you get a **502** naming the command to start it.
- **in production** (`npm run start`) there is no built-in proxy — the reverse proxy in the last section owns
  that routing, and `APP_BASE_URL` is its public origin.

`localhost:8080` still answers directly in either shape (the Verify block uses it to prove the MCP process
itself is up).

Then prove the install owns its identity: [VERIFYING-SELF-HOST.md](VERIFYING-SELF-HOST.md) (5 minutes, all read-only except one API key).

## Optional next steps
| Want | Do |
|---|---|
| Agent / phase templates | already seeded by `db:seed`; re-run `npm run db:agents`, `npm run db:templates` or a domain `scripts/seed-*-templates.ts` after editing the library (idempotent) |
| Your own sales theatres / countries / regions | a default set is seeded (4 theatres, 17 countries). Add countries/regions by editing `scripts/seed-geographical-data.js` and re-running it (adds missing rows; never renames or deletes). A new theatre is a schema change (`SalesTheatre` enum → `npx prisma db push`) — `.claude/knowledge/guides/GEOGRAPHICAL_DATA_MANAGEMENT.md` |
| Services in the hub registry | **empty by design** — prod's services are private infrastructure; register your own (below), starting with the reference `services/weather-service` (`WEATHER_SERVICE_PORT=3102`, then allowlist `127.0.0.1:3102` and `registry(action: 'register', …)`) |
| An API key for Claude Code / Claude Desktop / ChatGPT | log in → pAIchart logo (top-right) → **Profile Settings** → **MCP API Key** → **Generate New API Key** (an RS256 first-party token, shown once); paste as `X-API-Key` |
| Client configuration (Claude Desktop / ChatGPT / Gemini) | log in, then open **`${APP_BASE_URL}/auth/oauth/success`** — the per-client setup sheet, pre-filled with this install's MCP URL; every login lands there |
| Self-registration by email | **requires** `BREVO_API_KEY` (+ `BREVO_FROM_EMAIL`): the verification email is how a new user sets their password. Without a mail key, `/register` answers **503 with a clear message and inserts nothing** — create users in `/admin/users` instead — the create dialog's **optional password** makes the account sign-in-ready at once (an admin-set password counts as verification); leave it blank for accounts that will sign in with OAuth. OAuth sign-up needs no mail. Password *reset* is disabled by policy. |

## Verify
```bash
curl -s localhost:3000/api/health                              # {"status":"ok",…}
curl -s localhost:8080/health                                  # {"status":"ok","transport":"clean-http",…}
curl -s localhost:8080/.well-known/oauth-authorization-server  # issuer must equal your APP_BASE_URL
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/mcp    # 401 — correct without a token
```

## Registering a service on your own network
The hub refuses to connect to private addresses (loopback, RFC 1918, link-local, `.local`) — an SSRF guard that is
right for a public SaaS and wrong for a self-host whose services live next to it. **You, the operator, declare
where the hub may connect**, by network address, in `.env`:

```bash
HUB_PRIVATE_ENDPOINT_ALLOWLIST="127.0.0.1:3107,192.168.1.0/24"
```

- Entries are **IPv4 literals with a port** (`a.b.c.d:port` — that host, that port only) or **IPv4 CIDRs**
  (`a.b.c.d/n`, n ≥ 8, network address with host bits zero — every port on that network). Nothing else: hostnames
  (the hub does not resolve names, so a name would be a promise about a resolver it never consults), IPv6,
  schemes/paths, port-less hosts. A malformed entry is ignored and named in the server log at boot; the rest
  still apply; if nothing parses, the guard behaves exactly as if the variable were unset. Never allow-all.
- Never allowlistable, even if listed: `169.254.0.0/16` (cloud metadata), `0.0.0.0/8`, and **the hub's own
  listeners** (`APP_BASE_URL` / `APP_INTERNAL_BASE_URL` host:port and the MCP port) — a service pointing back at
  the hub would loop. Loopback is allowed only as an exact `127.x.x.x:port`, never as a CIDR.
- Restart both processes after changing it (read once at boot). Each admitted registration is logged at WARN.
- **Reachability is not trust.** The hub will forward *your own* scoped RS256 token to an allowlisted address,
  over plain `http://` — put a real MCP server there, on a network you control.

Then register as usual: `registry(action: 'register', name: '…', endpoint: 'http://127.0.0.1:3107/mcp', …)`.

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
