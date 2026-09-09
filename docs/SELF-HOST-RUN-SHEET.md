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

**Optional, needed for step 9b and for programs (step 10):** Docker. Ubuntu's own package is enough:
```bash
sudo apt-get install -y docker.io docker-compose-v2 && sudo usermod -aG docker "$USER"   # log out/in for the group
docker compose version   # expect v2.x
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
sed -i "s#^\# ARTIFACT_SIGNING_KEY=.*#ARTIFACT_SIGNING_KEY=\"$(openssl rand -hex 32)\"#" .env   # production signs artifact download links with it
echo 'SINGLE_ORIGIN_PROXY=true' >> .env      # no reverse proxy in this demo: the web server proxies /mcp + /oauth/* to the MCP process
grep -c "^JWT_" .env                     # expect 3
```

## 5. Seed and start
```bash
set -a; . ./.env; set +a; npm run llm:init   # copies ANTHROPIC_API_KEY from .env into the hub's system LLM settings (the app never reads the env var itself)
npm run db:seed                          # 18 steps, ~1–2 min, ends "✅ db:seed complete"; the SUPER_ADMIN password is printed ONCE — copy it now.
                                         # Expect pino JSON lines and a "[DEV] SLOW QUERY" or two in the middle — noise, not errors. Safe to re-run
                                         # after a git pull: every step is add-only (a re-run never deletes; --force-recreate on db:templates does)
                                         # (schema, grants, admin, protocols, hub prompts, agent/harness/program/domain/phase templates)
                                         # lost it? npm run db:admin -- --reset-password
```
Build once, then run the **production** build — the demo should feel like the hosted service (fast, no dev tooling):
```bash
npm run build                                                   # 3–10 min; "✓ Compiled successfully" then the route table
NODE_ENV=production nohup npm run start                > ~/web.log 2>&1 &     # web app on :3000 (serves the built bundle)
NODE_ENV=production nohup node mcp-server-http-clean.js > ~/mcp.log 2>&1 &     # MCP server on :8080 (loopback)
```
Two processes, not supervised — restart them by hand after a reboot (keeping them up with PM2 or systemd is a "Later").
After a `git pull`, run `npm run build` again and restart both: a production build never reloads. (Developers use
`npm run dev` + `npm run mcp:http:dev` instead — slower, with hot reload and the TanStack devtools button; the proxy
is on automatically there.)
```bash
# Ports bind LATE: both processes log "ready" before they listen, and for 10–60 s a curl returns 000 (connection
# refused — --max-time does not help) and `ss -ltnp` shows nothing. Poll, don't probe once:
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 5 localhost:3000/api/health && break; sleep 3; done
for i in $(seq 1 30); do curl -s -o /dev/null --max-time 5 localhost:8080/health && break; sleep 2; done
curl -s -o /dev/null -w '%{http_code}\n' --max-time 180 localhost:3000/api/health            # expect 200 (production answers at once; in dev the first hit compiles ~60–90 s)
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
infrastructure; a self-host registers its own — step 9 registers a public one, step 9b runs the shipped browser-automation service (programs need it).
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

### 9b. A service on your own network — the shipped Browser Automation Service (programs need it)
Programs (step 10) fetch their design artifacts — `requirements.md`, `topology.json` — through a browser-automation
service the hub calls; the hub has no URL-fetch tool of its own, by design: the fetch runs in a container, not in the hub
process. This repo ships that service (`services/browser-automation-service` — Playwright, no keys) and a compose file that
runs only it. Needs Docker (step 3's optional block); the image is a 1.5 GB download (~3 GB on disk) and the container is
capped at 1.5 GB RAM.

```bash
cd ~/paichart
docker compose -f docker-compose.self-host.yml up -d --build   # first run: several minutes (image pull + build)
curl -s localhost:3100/health                                  # expect "status":"healthy"
npm run seed:browser-service                                   # registers it in the hub as a first-party service — ends "Status: ACTIVE"
```

Why a seed and not `registry(action: 'register')`: this service's name is **reserved** — the hub keeps the names of its
first-party services exclusive, so a user-registered service can never capture one — and first-party services on the hub's
own host are exempt from the private-address guard. So there is no allowlist step here. A service you write yourself is the
other case: its private address needs `HUB_PRIVATE_ENDPOINT_ALLOWLIST` — RUNNING.md → "Registering a service on your own
network" (`services/weather-service` is the pattern; it needs a weather API key of your own).

Then in Claude Code (`claude -c`), the same shape as step 9:

1. *"Show me the tools of the Browser Automation Service as the hub reports them."*
   → `registry(action: 'tools', service_name: 'Browser Automation Service')` → 7 tools with full schemas
   (`scrape_page`, `fill_form`, `click_element`, `take_screenshot`, `generate_pdf`, `run_script`, `trace_session`).
2. *"Through the hub, ask the browser-automation-service to `scrape_page`
   `https://raw.githubusercontent.com/paichart/paichart/main/program-artifacts/firewall-a3-partner-path-r2/requirements.md`
   with selectors `{doc: 'pre'}`, and show me the call and the result."*
   → `services(action: 'call', targetService: 'browser-automation-service', tool: 'scrape_page', …)` → `success: true`
   and the document's text, *through your hub* — exactly the call a program's Program Architect makes in step 10.

The registry id is `browser-automation-service`, the display name `Browser Automation Service`: `services(action: 'call')`
accepts either; `registry(action: 'tools')` wants the display name.

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
  document and a topology — you don't drive the steps yourself; the harness does (plan, the plan-approval gate, the
  legs, synthesis, the verdict). 10b below is the shipped use case, launched call by call. The in-hub guides are
  `prompt_command("/prompt HOWTO-use-pipeline-harness")` and `/prompt HOWTO-use-program-harness`; `verification/`
  holds real program runs with their evidence (VT-01 … VT-15) — read one before your first run so you know what a
  releasable result looks like. To add a domain of your own: `.claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md`
  and `ADD-A-PROGRAM-PROTOCOL.md`.

### 10b. Your first program — the shipped use case, exactly as it ran

`usecases/firewall-a3-partner-path/` is a complete program (three sequenced pipelines) with its rigs. With
step 9b done and the rigs up (that directory's README), this is the whole launch — five hub calls, typed to Claude
in `~/paichart` or issued directly. Each line's response is what a working install returns.

1. **A POV to hold your use cases, with the phases named up front** (phases are created WITH the POV — there is no
   `phase.create`; a POV created without `phases` gets the default Planning/Execution/Review three):
   ```
   perform(action: 'pov.create', parameters: { title: 'pAIchart Use Cases', countryName: 'Australia',
     description: 'Runnable use cases for a self-hosted pAIchart …',
     phases: [ { name: 'Firewall Rules Change', type: 'EXECUTION' },
               { name: 'Network and Terraform', type: 'EXECUTION' },
               { name: 'OSPF ISIS Migration',   type: 'EXECUTION' } ] })
   ```
   → `✅ POV Created` with the POV id, `Sales Theatre: APJ` (from the country), `Phases Created: 3` in that order,
   dates spread across the POV's 90 days. Keep the POV id.
2. **A stage for the run**, in the first phase:
   ```
   perform(action: 'stage.create', parameters: { povId: '<pov id>', phaseName: 'Firewall Rules Change', name: 'FW-A3 Program Run' })
   ```
   → `Stage ID: <stage id>`. Keep it.
3. **The program task** — `type: 'PIPELINE'`, the protocol token in the title, the two artifact URLs in the description
   and nothing else there (the Architect fetches ONLY what the description names):
   ```
   perform(action: 'task.create', parameters: { povId: '<pov id>', stageId: '<stage id>', type: 'PIPELINE', priority: 'MEDIUM',
     title: 'Partner-HTTPS security policy path with edge SNAT (protocol: pov-program)',
     description: 'Program intent: end-to-end partner-HTTPS policy across ceos1 (edge, SNAT) -> LocalStack dmz-sg -> ceos2 (core), three sequenced pipelines with transitive chaining.\n\nDesign artifacts for the Program Architect (fetch ONLY these two URLs):\n- topology-as-code: https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/topology.json\n- requirements: https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/requirements.md' })
   ```
   → `Task ID: <task id>`, `Status: OPEN`.
4. **Give it the harness.** The Pipeline Harness template was seeded by `db:seed`; `template(action: 'list')` shows its id.
   ```
   perform(action: 'agent.assign',  parameters: { taskId: '<task id>', agentTemplateId: '<Pipeline Harness template id>' })
   perform(action: 'agent.execute', parameters: { taskId: '<task id>', waitForCompletion: false })
   ```
   → `Execution Status: RUNNING` with an execution id. The harness's first pass takes ~30 s: it creates a child stage
   `Program: … (Run <timestamp>)` and spawns the **Program Architect** as the sole child of step PLAN — that is a
   `task.comment` on your task, and the harness execution ends `SUCCESS` (it exits on purpose; the reactor re-triggers
   it when the Architect finishes).
5. **Read the plan, release the gate.** The Architect fetches the two URLs through your browser-automation service
   (paging the 14 KB requirements with `read_more`), self-provisions nothing yet, and writes the program plan —
   `## Interface Contract` first (real subnets, VLAN/ASN, tags — as ONE JSON block), the pipeline DAG, and
   **Assumptions & open questions**. When it lands, the harness comments `⏸ PROGRAM PLAN AWAITING APPROVAL` with the
   roster and the gate id. Read the assumptions — that list is your disambiguation checklist — then:
   ```
   perform(action: 'task.complete', parameters: { taskId: '<G0 gate id from the comment>' })
   ```
   Nothing runs before that. After it: the three legs in sequence (each self-provisions its rig service from the
   descriptor, harvests read-only, designs, is reviewed, tears the registration down), one human gate per domain, the
   producer's deliverable and Node C's verdict, and a final comment with the gate table and `programReleasable`.
   `project(action: 'task.context', taskId: '<task id>')` at any time shows where it is.

**What a finished run looks like** (the first self-host run of this use case, 2026-09-09, one laptop hosting hub + both rigs):
Architect ~2 min → three legs of ~8–12 min each (harvest → design → author → review; each self-provisions its rig service
at `127.0.0.1` and the reviewer approves or escalates) → Producer + Node C ~4 min → program synthesis. The stamp on the
program task is the machine fact — `programReleasable`, `qualityGate.outcome`, and each leg's `containmentDisposition` —
and the release is still your decision: a run can show every leg approved and Node C approved, and still stamp
`programReleasable: false` on a mechanical containment conjunct. Read the facts, not the adjectives.

**Re-running a program** (an escalated leg, a corrected artifact): a finished program cannot be re-run in place.
Create a fresh PIPELINE task in the same stage and stamp the prior program stage on it — the harness's pre-flight
halts on a duplicate `Program: …` stage and accepts only a machine-checkable clearance, never prose in the description:
```
perform(action: 'task.update', parameters: { taskId: '<new task id>', metadata: { duplicateAcknowledged: '<prior Program: … stage id>' } })
```
then `agent.assign` + `agent.execute` as in step 4. (The stage id is in the harness's first comment on the prior run.)

A failure at step 4 with `llm_initialized` means the running user has no resolvable LLM key (step 5's `llm:init`,
or Profile Settings → LLM). A leg that escalates on its harvest usually means a rig service answered `initialize`
but could not READ — check the rig README's readiness probes, not the container list.

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
