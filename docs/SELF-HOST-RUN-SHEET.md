# Self-host run sheet — from a bare Ubuntu machine to Claude talking to your own pAIchart

Every command, in order, as you would type it. `RUNNING.md` explains *why*; this sheet is the *what*, verified on a
fresh Ubuntu 24.04 laptop on a home LAN (2026-09-07). Replace `HOST` with the address other machines will use to
reach this one (`192.168.1.50`, a hostname, or `localhost` if only this machine will use it) — it becomes
`APP_BASE_URL`, and **`APP_BASE_URL` is your install's identity** (see RUNNING.md).

Assumes: Ubuntu 24.04 (or similar), a user with `sudo`, outbound internet. Time: ~40 min, most of it `npm ci`.
Order is deliberate: **clone, install Claude Code, then let Claude follow the rest** — steps 3–9 are written to be pasted.

## 1. Clone
```bash
sudo apt-get update && sudo apt-get install -y git curl
git clone https://github.com/paichart/paichart.git ~/paichart && cd ~/paichart
```

## 2. Install Claude Code — then let it drive the rest of this sheet
```bash
curl -fsSL https://claude.ai/install.sh | bash        # native installer, no Node needed; adds ~/.local/bin (open a new shell or `export PATH="$HOME/.local/bin:$PATH"`)
claude --version && claude                            # first run: sign in (browser)
```
From here you can paste to Claude: *"Follow ~/paichart/docs/SELF-HOST-RUN-SHEET.md from step 3, exactly as written,
with HOST=… and ADMIN_EMAIL=…; stop at step 7 and tell me the printed password."* Or keep typing.

## 3. Prerequisites the docs assume (Node 20, PostgreSQL 16, an empty database)
```bash
sudo apt-get install -y postgresql-16 postgresql-client-16 openssl
curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/ns.sh && sudo -E bash /tmp/ns.sh && sudo apt-get install -y nodejs
node -v && npm -v && psql --version && sudo systemctl is-active postgresql   # expect v20.x / 10.x / 16.x / active

PW=$(openssl rand -hex 16); echo "$PW" > ~/.paichart-dbpw; chmod 600 ~/.paichart-dbpw
sudo -u postgres psql -qc "CREATE USER paichart WITH PASSWORD '$PW';"
sudo -u postgres createdb -O paichart paichart
```

## 4. Configure
```bash
cd ~/paichart
npm ci                                   # 1–20 min depending on the box; npm reports ~1050 packages. It also prints deprecation warnings and a
                                         # vulnerability count — that is not a failure; rc=0 is
cp .env.example .env
HOST=192.168.1.50                        # ← yours
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://paichart:$(cat ~/.paichart-dbpw)@localhost:5432/paichart\"#" .env
sed -i "s#^APP_BASE_URL=.*#APP_BASE_URL=http://$HOST:3000#" .env
sed -i "s#^OAUTH_STATE_SECRET=.*#OAUTH_STATE_SECRET=\"$(openssl rand -hex 32)\"#" .env
sed -i "s#^ADMIN_EMAIL=.*#ADMIN_EMAIL=you@example.com#" .env                  # ← your first login
npm run --silent jwt:keys >> .env        # --silent matters: without it npm's banner lands in .env and `source .env` executes it
grep -c "^JWT_" .env                     # expect 3
```

## 5. Seed and start
```bash
npm run db:seed                          # 18 steps, ~1–2 min, ends "✅ db:seed complete"; the SUPER_ADMIN password is printed ONCE — copy it now.
                                         # Expect pino JSON lines and a "[DEV] SLOW QUERY" or two in the middle — noise, not errors. Safe to re-run
                                         # after a git pull: every step is add-only (a re-run never deletes; --force-recreate on db:templates does)
                                         # (schema, grants, admin, protocols, hub prompts, agent/harness/program/domain/phase templates)
                                         # lost it? npm run db:admin -- --reset-password
```
Two processes. Two terminals (or `nohup … &` as below — not supervised; restart by hand after a reboot):
```bash
nohup npm run dev          > ~/web.log 2>&1 &
nohup npm run mcp:http:dev > ~/mcp.log 2>&1 &
# Ports bind LATE: both processes log "ready" before they listen, and for 10–60 s a curl returns 000 (connection
# refused — --max-time does not help) and `ss -ltnp` shows nothing. Poll, don't probe once:
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 5 localhost:3000/api/health && break; sleep 3; done
for i in $(seq 1 30); do curl -s -o /dev/null --max-time 5 localhost:8080/health && break; sleep 2; done
curl -s -o /dev/null -w '%{http_code}\n' --max-time 180 localhost:3000/api/health            # expect 200 (first hit compiles ~60–90 s)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/health                                # expect 200
curl -s localhost:3000/.well-known/oauth-authorization-server | grep -o '"issuer":"[^"]*"'    # expect "http://HOST:3000" — your origin, nobody else's
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/mcp                                  # expect 401 (no token — correct)
```

## 6. Log in (a real browser — some failures only a browser can show)
Open `http://HOST:3000/login` → click the **lock** icon → `ADMIN_EMAIL` + the printed password. You land on the
**setup sheet** (`/auth/oauth/success`); it must show **`http://HOST:3000/mcp`** as the MCP URL.
If the page is unstyled with dead icons: press `Ctrl+Shift+R` once; if it persists, open DevTools → Console and
look for `ERR_SSL_PROTOCOL_ERROR` — report it, that class is supposed to be fixed.

What you should see: **Templates** populated (generic roles + the pipeline/program/domain ones), **Prompts** populated
(HOWTO-get-started …), and the **Services** registry **empty — by design**: the hosted service's registry is private
infrastructure; a self-host registers its own (step 9; `services/weather-service` in this repo is the reference).
**Sales theatres / countries / regions** come from a default set (4 theatres — `NORTH_AMERICA`, `LAC`, `EMEA`, `APJ` —
and 15 countries). `Settings → Geographical` is where each *user* picks their defaults for new POVs from that list — it does
not edit the list (there is no GUI for that yet). The set is data, not code: `data/geographical-default.json`. To add countries or regions, edit that file (or
write your own with the same shape and pass `--file my-geo.json`) and re-run
`set -a; . ./.env; set +a; node scripts/seed-geographical-data.js`: it adds what is missing and leaves existing rows
alone — it does not rename or delete; an invalid file is refused with the reasons listed. A **new theatre is a schema change** (`SalesTheatre` enum in
`prisma/schema.prisma`, then `npx prisma db push`); the full procedure is `.claude/knowledge/guides/GEOGRAPHICAL_DATA_MANAGEMENT.md`.

Then prove the install owns its identity: `docs/VERIFYING-SELF-HOST.md` with `BASE=http://HOST:3000; MCP=$BASE`.

## 7. An account for daily work (in the GUI)
The account you logged in with is the **Super Admin** — administration only. Create the one you will work as:
**Settings** → the **pAIchart logo** (top-right corner) → **Admin Dashboard** (only the **Super Admin** sees this option —
which is why this step is done now, before you switch accounts) → **User Management** → **Create User**
→ fill in email and name, set **System Role** to **System Admin** (the dialog defaults to *User* — check it before you
save; a User cannot administer the hub), and **set a password** in the dialog (blank means
"will sign in with OAuth", and an account without one cannot log in) → Create.

## 8. An API key, then connect Claude Code to your hub — required before your first POV
Log out and log in as the new System Admin. Then: the **pAIchart logo** (top-right) → **Profile Settings** → scroll to
**MCP API Key** → **Generate New API Key** → copy it now (it is shown once; the default expiry is **one year** — pick
something shorter for a lab). The key's `role` claim is a mint-time snapshot: the hub authorises from the live database,
so changing a user's role takes effect on existing keys immediately, and the claim can read stale.

Back in Claude Code (running inside `~/paichart`), just ask:
*"Create an MCP connection to http://HOST:3000/mcp using this API key: &lt;paste the key&gt;"* — Claude runs
`claude mcp add --transport http paichart http://HOST:3000/mcp --header "X-API-Key: …"` for you. The connection
only appears after a restart, so type `exit`, then at the shell:
```bash
claude -c                                             # -c continues the same conversation with the new connection loaded
claude mcp list                                       # (from another shell) expect: paichart … ✔ Connected
```
The hub's tools now appear as `mcp__paichart__*`. First thing to try: `prompt_command("/prompt HOWTO-get-started")`,
then your first POV (step 10). The key is stored in plaintext in `~/.claude.json`; it expires on the date you chose.

Claude Desktop cannot send a header: use OAuth (`docs/OAUTH-SETUP.md` §B.1, callback `http://HOST:3000/oauth/callback`)
or the `mcp-remote --header` stanza the setup sheet shows.

## 9. Your first external service — a remote MCP server, through the hub
The hub's point is other MCP services: register them once, then every AI client reaches them through `${APP_BASE_URL}/mcp`
with one identity. This repository ships a descriptor for a public, keyless one — Context7 (library documentation) —
so you can see the whole path without running anything else. Because the endpoint is public HTTPS, no allowlist is
involved. In Claude Code (inside `~/paichart`), ask, in this order:

1. *"I'm new to this. Register the MCP service described in `descriptors/context7-descriptor.json` with the hub, using
   its full tool schemas, and show me the registry's response verbatim."*
   → `registry(action: 'register', …)` → `status: ACTIVE`, owner = you.
2. *"Show me its tools and their parameters as the hub reports them."*
   → `registry(action: 'tools', service_name: 'context7-docs')` → 2 tools, full schemas (grade A).
3. *"Through the hub, ask context7 to resolve the library id for next.js (query: app router data fetching), then query
   its docs for how server components fetch data. Show each tool call and its result — don't summarise."*
   → `services(action: 'call', targetService: 'context7-docs', tool: 'resolve-library-id', …)` returns `/vercel/next.js`,
   then `services(action: 'call', …, tool: 'query-docs', arguments: { libraryId: '/vercel/next.js', query: … })` returns
   real documentation — proof that a remote server is being called *through your hub*, not by Claude directly.

**Tell Claude you are new.** By default Claude Code runs tools and reports conclusions; for learning the hub you want
the calls and their raw results. A one-line instruction at the start of the session does it: *"I'm learning the hub —
for every pAIchart tool call, show me the call and the result before you interpret it."*

Also worth trying: `services(action: 'discover')` (finds it by capability), `services(action: 'health', …)` — a
`statusCode: 405` beside `available: true` is normal: the probe GETs a POST-only MCP endpoint, and the 405 proves something
is listening — and
`registry(action: 'update' | 'delete', …)` — the same descriptor shape works for any MCP server you write
(`descriptors/descriptor.schema.json` and `descriptors/SPEC.md`).

### Later: a service on your own network
When you host an MCP service yourself — the reference is `services/weather-service` in this repo (needs a weather API key
of your own) — the hub will refuse its private address until you, the operator, list it: `HUB_PRIVATE_ENDPOINT_ALLOWLIST`
(IPv4 `host:port` or CIDR; hostnames, link-local, `0.0.0.0/8` and the hub's own listeners are never allowlistable; the MCP
process reads it at boot). Full procedure and the reasoning: RUNNING.md → "Registering a service on your own network".
Not part of the first-run path — come back to it when you have a service to host.

## 10. Operate it from Claude — the GUI is not how pAIchart is run
Two things come with the clone that make step 8 more than a connector:

- **Purpose-built sub-agents.** `.claude/agents/` holds 45 specialists and `CLAUDE.md` tells Claude Code how to use
  them. They load automatically when you start Claude Code **inside the clone** — so run `claude` from `~/paichart`,
  not from your home directory. `discovery-scout` maps a subsystem before you change it; `mcp-hub-specialist`,
  `template-system-specialist`, `dev-ops-specialist` and the rest each own a domain; `pipeline-harness-specialist`
  drives autonomous pipelines and programs.
- **The MCP tools are the operating surface.** Day-to-day administration and operation happen by asking Claude,
  which calls the hub's tools (`project`, `perform`, `registry`, `services`, `template`, `analytics`, …); the web
  GUI is for reading, approvals and the occasional setting. Examples, typed to Claude as written:
  - *"Please create a POV with a name that reflects our purpose and country is Australia"* → `perform(action: 'pov.create', …)`
    (it will ask for anything the schema needs — a description, phases — and report the POV id).
  - *"List the POVs in progress and their open tasks"* → `project(action: 'pov.list' / 'task.list')`.
  - *"Register my weather service at http://127.0.0.1:3105/mcp with its full tool schemas"* → `registry(action: 'register', …)`
    (step 9 applies for private addresses).
  - *"Run the health check on ceos-lab-readonly and call list_devices"* → `services(action: 'health' / 'call', …)`.
- **Programs and pipelines.** For a multi-specialist delivery — a reviewed change package from a requirements
  document and a topology — you don't drive the steps yourself: *"Use the pipeline-harness-specialist sub-agent to
  run a program for &lt;objective&gt;; requirements are at &lt;url&gt;, topology at &lt;url&gt;, POV &lt;name&gt;"* and the
  agent runs the whole workflow (plan, the plan-approval gate, the parallel legs, synthesis, the verdict). The
  in-hub guides are `prompt_command("/prompt HOWTO-use-pipeline-harness")` and `/prompt HOWTO-use-program-harness`;
  the worked design that the harness was built against is `.claude/knowledge/pipelines/firewall-policy-use-case.md`,
  and `verification/` holds real program runs with their evidence (VT-01 … VT-15) — read one before your first run
  so you know what a releasable result looks like. To add a domain of your own: `.claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md`
  and `ADD-A-PROGRAM-PROTOCOL.md`.

## Things that will bite (each cost real time)
- **Late bind** (the most repeatable false failure in this sheet): both servers log "ready" 10–60 s before they listen.
  A single `curl` returns `000` and `ss -ltnp` shows nothing; the process is fine. Poll as in step 5.
- `pkill -f "some-pattern"` typed inside an `ssh host '…'` command matches the ssh shell itself — use `patter[n]`.
- Stopping the `npm` wrapper leaves the node child on the port; find it with `ss -ltnp | grep :3000` and kill that.
- **The MCP process does not hot-reload.** After a `git pull` that touches `lib/`, `scripts/` or `mcp-server-http-clean.js`,
  restart it (`pkill -f "mcp-server-http-clea[n]"; sleep 2;` then `nohup npm run mcp:http:dev …` — the `sleep` matters: without it
  the dying process still holds the log while the shell truncates it, and the new process's first boot lines vanish); the web dev server reloads itself,
  the MCP server keeps running the old code until you do. Same for re-seeded prompts — it reads the prompt list at boot.
- The MCP process binds loopback only; nothing else needs to reach :8080 — the web server on :3000 proxies `/mcp` and `/oauth/*` to it.
- `curl` cannot see CSP; only a browser can. Step 3 is not optional.
