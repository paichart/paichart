# Installing pAIchart — from a bare Ubuntu machine to Claude talking to your own pAIchart

Every command, in order, as you would type it. `RUNNING.md` explains *why*; this guide is the *what*, verified on a
fresh Ubuntu 24.04 laptop on a home LAN (2026-09-07). Replace `HOST` with the address other machines will use to
reach this one (`192.168.1.50`, a hostname, or `localhost` if only this machine will use it) — it becomes
`APP_BASE_URL`, and **`APP_BASE_URL` is your install's identity** (see RUNNING.md).

Assumes: Ubuntu 24.04 (or similar), a user with `sudo`, outbound internet, and **an Anthropic API key** (the agents run on it;
you paste it in step 8). Time: ~40 min, most of it `npm ci`.
Order is deliberate: **clone, install Claude Code, then let Claude follow the rest** — steps 3–9 are written to be pasted.

## 1. Clone
```bash
sudo apt-get update && sudo apt-get install -y git curl
git clone https://github.com/paichart/paichart.git ~/paichart && cd ~/paichart
```

## 2. Install Claude Code — then let it drive the rest of this guide
```bash
curl -fsSL https://claude.ai/install.sh | bash        # native installer, no Node needed; adds ~/.local/bin (open a new shell or `export PATH="$HOME/.local/bin:$PATH"`)
claude --version && claude                            # first run: sign in (browser)
```
From here you can paste to Claude: *"Follow ~/paichart/docs/INSTALL.md from step 3, exactly as written,
with HOST=…; stop after step 5 and tell me the printed password."* (Steps 6–8 are yours, in a browser.) Or keep typing.

## 3. Prerequisites the docs assume (Node 24, PostgreSQL 16, an empty database)

> **Node 24 (the current LTS).** Node 20 reached end of life in April 2026; pAIchart is built and tested on Node 24. The minimum the code
> accepts is 20.19 (`engines` in `package.json`): a dependency (`sanitize-html`) loads an ES-module-only package through
> `require()`, which Node supports from 20.19 (22.12 on the 22 line). On an older Node the server still starts and answers health
> checks, but its background services fail to initialise (`require() of ES Module … not supported`) and agent runs cannot stream.
```bash
sudo apt-get install -y postgresql-16 postgresql-client-16 openssl
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/ns.sh && sudo -E bash /tmp/ns.sh && sudo apt-get install -y nodejs
node -v && npm -v && psql --version && sudo systemctl is-active postgresql   # expect v24.x / 11.x / 16.x / active

PW=$(openssl rand -hex 16); echo "$PW" > ~/.paichart-dbpw; chmod 600 ~/.paichart-dbpw
sudo -u postgres psql -qc "CREATE USER paichart WITH PASSWORD '$PW';"
sudo -u postgres createdb -O paichart paichart
```

**Docker — needed for steps 9b and 9c, and so for every program** (skip it only if you will not run programs). After `usermod`
below you must log out and back in before `docker` works without `sudo`: Ubuntu's own package is enough:
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
chmod 600 .env                           # DO NOT SKIP. .env holds DATABASE_URL (with the password)
                                         # and JWT signing material. Ubuntu's default umask
                                         # (0002) makes this copy 0664 — group- AND world-readable. The only
                                         # thing containing it is your home directory being 0700, which is a
                                         # default you may not have.
HOST=192.168.1.50                        # ← yours
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://paichart:$(cat ~/.paichart-dbpw)@localhost:5432/paichart\"#" .env
sed -i "s#^APP_BASE_URL=.*#APP_BASE_URL=http://$HOST:3000#" .env
sed -i "s#^OAUTH_STATE_SECRET=.*#OAUTH_STATE_SECRET=\"$(openssl rand -hex 32)\"#" .env
                                         # ADMIN_EMAIL stays as shipped: admin@paichart.local, the built-in administrator (a login
                                         # name, not a mailbox). Your own account comes in step 7 — do not put your email here.
npm run --silent jwt:keys >> .env        # --silent matters: without it npm's banner lands in .env and `source .env` executes it
sed -i "s#^\# ARTIFACT_SIGNING_KEY=.*#ARTIFACT_SIGNING_KEY=\"$(openssl rand -hex 32)\"#" .env   # production signs artifact download links with it
echo 'SINGLE_ORIGIN_PROXY=true' >> .env      # no reverse proxy in this demo: the web server proxies /mcp + /oauth/* to the MCP process
grep -c "^JWT_" .env                     # expect 3
```

## 5. Seed and start
```bash
set -a; . ./.env; set +a                 # load .env into this shell for the commands below
npm run db:seed                          # ~1–2 min; prints its own step count as it runs, ends "✅ db:seed complete"; the SUPER_ADMIN password is printed ONCE — copy it now.
                                         # Expect pino JSON lines and a "[DEV] SLOW QUERY" or two in the middle — noise, not errors. Safe to re-run
                                         # after a git pull: every step is add-only (a re-run never deletes; --force-recreate on db:templates does)
                                         # (schema, grants, admin, protocols, hub prompts, named workflows, agent/harness/program/domain/phase templates)
                                         # lost it? npm run db:admin -- --reset-password
```
Build once, then run the **production** build — the demo should feel like the hosted service (fast, no dev tooling):
```bash
unset NODE_ENV                                                  # the step above loaded .env into this shell; a build that inherits
                                                                # NODE_ENV=development fails prerendering ("<Html> should not be imported",
                                                                # "reading 'useContext'") and the web server then cannot start
npm run build                                                   # 3–10 min; "✓ Compiled successfully" then the route table
test -f .next/BUILD_ID && echo BUILD-OK   # expect BUILD-OK — Next writes BUILD_ID only when the build completes (export-detail.json is deleted after a successful build, so it cannot be the check)
```
Then install the two **systemd units** that keep them running. They ship with the placeholder `YOUR_USER` in `User`,
`Group` and `WorkingDirectory`; the `sed` below sets it to the account you are logged in as (the clone must be at
`~/paichart`, as in step 1 — otherwise edit `WorkingDirectory` by hand):
```bash
sudo cp docs/systemd/paichart-web.service docs/systemd/paichart-mcp.service /etc/systemd/system/
sudo sed -i "s/YOUR_USER/$USER/g" /etc/systemd/system/paichart-web.service /etc/systemd/system/paichart-mcp.service
grep -h '^User=\|^WorkingDirectory=' /etc/systemd/system/paichart-web.service   # expect your user and /home/<you>/paichart
sudo systemctl daemon-reload
sudo systemctl enable --now paichart-mcp paichart-web   # `enable --now`, NOT `start`
```
**`enable --now`, not `start`.** `start` alone runs them today and does not survive a reboot — the single
most common mistake with units, and it produces a box that looks configured and isn't.

Logs go to the journal, so they survive restarts and rotate themselves:
```bash
journalctl -u paichart-mcp -e -f          # follow
journalctl -u paichart-web --since -1h    # last hour, after something went wrong
```
One-time, so the journal cannot grow without bound:
```bash
sudo mkdir -p /etc/systemd/journald.conf.d   # not there on a fresh Ubuntu 24.04
echo -e '[Journal]\nSystemMaxUse=500M' | sudo tee /etc/systemd/journald.conf.d/paichart.conf
sudo systemctl restart systemd-journald
```

> **Why supervised, and why this is not a "Later".** Until 2026-09-13 this guide started both processes as
> bare `nohup`s. On 2026-09-12 a routine PostgreSQL restart killed the MCP server on our own test box and
> **nothing brought it back for 68 minutes**, while the web GUI kept returning 200 and the error message
> pointed at the wrong cause. We never hit it in production because production runs a supervisor — the
> perimeter that hid the defect was ours, not the self-hoster's. Details, including the rejected
> alternatives and why each would recreate the fault, are in the unit files themselves.
After a `git pull`, run `npm run db:seed` first if the pull touched `prisma/schema.prisma` or `scripts/create-*index*.sh`
(it applies the schema and the raw-SQL indexes in the order they need, and is add-only), then `npm run build` again and
`sudo systemctl restart paichart-mcp paichart-web`: a production build never reloads. Do not run a bare `npx prisma db push`
on an existing install: since 2026-10-14 a unique service-name index must exist before the push, or the push refuses the change
(it is listed as a possible data loss) — `db:seed` creates it first. (Developers use
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
Open `http://HOST:3000/login` → click the **lock** icon → `admin@paichart.local` + the password step 5 printed. You land on the
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
`prisma/schema.prisma`, then `npm run db:seed`, which pushes the schema after the indexes it depends on); the full procedure is `.claude/knowledge/guides/GEOGRAPHICAL_DATA_MANAGEMENT.md`.

Then prove the install owns its identity: `docs/VERIFYING-SELF-HOST.md` with `BASE=http://HOST:3000; MCP=$BASE`.

## 7. Your own account (in the GUI) — required
The account you logged in with, `admin@paichart.local`, is the built-in **Super Admin** — administration only, and not a
mailbox. Now create **your own account, with your real email**: it is the one you work as, the one that holds your Anthropic
key and your MCP API key (step 8), and the one that owns your projects.
**Settings** → the **pAIchart logo** (top-right corner) → **Admin Dashboard** (only the **Super Admin** sees this option —
which is why this step is done now, before you switch accounts) → **User Management** → **Create User**
→ fill in email and name, set **System Role** to **System Admin** (the dialog defaults to *User* — check it before you
save; a User cannot administer the hub), and **set a password** in the dialog (blank means
"will sign in with OAuth", and an account without one cannot log in) → Create.

## 8. Your Anthropic key, an MCP API key, then connect Claude Code to your hub — required before your first POV
Log out and log in as the new System Admin. Then: the **pAIchart logo** (top-right) → **Profile Settings**.

**First, your Anthropic API key** — without it every agent run fails at its first step. In the **LLM** section switch
**Use System Provider** off, paste the key into **Anthropic API Key**, and press **Save Changes**. The key is stored for
your account and is never shown again; the field then reads "A key is saved". (One shared key for every user instead: put
it in `.env` as `ANTHROPIC_API_KEY`, then run `set -a; . ./.env; set +a; npm run llm:init` — after `db:seed`, never before —
and leave **Use System Provider** on. The app never reads the variable itself.)

**Then the MCP API key:** scroll to
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
then your first run ([FIRST-RUN.md](FIRST-RUN.md)). The key is stored in plaintext in `~/.claude.json`; it expires on the date you chose.

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
Programs ([FIRST-RUN.md](FIRST-RUN.md)) fetch their design artifacts — `requirements.md`, `topology.json` — through a browser-automation
service the hub calls; the hub has no URL-fetch tool of its own, by design: the fetch runs in a container, not in the hub
process. This repo ships that service (`services/browser-automation-service` — Playwright, no keys) and a compose file that
runs only it. Needs Docker (step 3's optional block); the image is a 1.5 GB download (~3 GB on disk) and the container is
capped at 1.5 GB RAM.

```bash
cd ~/paichart
docker compose -f docker-compose.self-host.yml up -d --build   # first run: several minutes (image pull + build)
curl -s localhost:3100/health                                  # expect "status":"healthy"
npm run seed:browser-service                                   # registers it in the hub as a first-party service — ends "Status: ACTIVE"
psql "$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" -At -c "select id, status from mcp_tools where id = 'browser-automation-service'"
                                                               # expect: browser-automation-service|ACTIVE
```

**Run the seed and the check from the clone you are testing** (`cd` into it first): the seed writes to whatever database that
directory's `.env` names. On a machine with a second install, a seed run from the other clone registers the service *there*,
the hub calls below can still succeed through the other install, and the program's Architect then finds no service and stops
(found on a fresh install 2026-11-01). If you have two installs, also check which hub key your Claude Code session uses.

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
   `https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/requirements.md`
   with selectors `{doc: 'pre'}`, and show me the call and the result."*
   → `services(action: 'call', targetService: 'browser-automation-service', tool: 'scrape_page', …)` → `success: true`
   and the document's text, *through your hub* — exactly the call a program's Program Architect makes.
   **Check the text contains the spec's `## Device sources` lines** (`ceos1: device-read — service …`, `ceos2: …`). They prove you
   are reading the current spec, the one [FIRST-RUN.md](FIRST-RUN.md) § 4 launches; without them the network legs would stop.

The registry id is `browser-automation-service`, the display name `Browser Automation Service`: `services(action: 'call')`
accepts either; `registry(action: 'tools')` wants the display name.

### 9c. Optional — the GitHub file source (kept files from your config repo)
Pipelines that change Kubernetes, Terraform or network config can read the **file of record** from a Git repo, keep its exact
bytes, and have the Author change it only by edits to that kept file (`docs/SELF-HOST-KEPT-FILES.md`). The hub reads Git through
the shipped `services/github-service`: GitHub's official read-only MCP server plus a small proxy that adds your token. Skip this
step if you have no config repo yet; nothing else depends on it. **To try it first without a repo of your own,** pin the public
`paichart/paichart-configs` — configuration files of record plus released use cases (`usecases/README.md` there says how to run one).

**1. A token (one minute).** GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
- a **public** config repo: Repository access = *Public repositories (read-only)*, no permissions;
- a **private** one: Resource owner = the repo's owner, *Only select repositories* → that repo, Repository permissions →
  *Contents: Read-only*.

The server refuses every request without a token, so this step is not optional for the service.

**2. Tell the hub which repo it may read (the pin).** The hub's `.env` (copied from `.env.example`) already sets
`GIT_FILE_SOURCE_PIN=paichart/paichart-configs`, so you can run its network use cases as is. To read your own repo, change it
to `<owner>/<repo>` and restart the hub. Agents can read **only** that repo through this service; the pin, not the
token, is the boundary. The repo **must have a `main` branch** (a read that names no branch is read as `main`), and protect it:
it is what every run reads. The full rules
and limits are in [SELF-HOST-KEPT-FILES.md → Reading kept files from Git](SELF-HOST-KEPT-FILES.md#reading-kept-files-from-git-optional).

**3. Start it and register it.**
```bash
cd ~/paichart
cp services/github-service/.env.example services/github-service/.env && chmod 600 services/github-service/.env
# edit it: paste the token (the one line)
docker compose -f docker-compose.self-host.yml --profile git up -d --build
curl -s localhost:3110/livez                                   # expect: ok
curl -s -o /dev/null -w '%{http_code}\n' localhost:3110/healthz # expect: 200 (503 = token missing, revoked or expired)
npm run seed:github-service                                    # prints the ONE repo agents may read — your pin; a ⚠️ line means it is unset
psql "$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" -At -c "select id, status from mcp_tools where id = 'github-service'"
                                                               # expect: github-service|ACTIVE
```
Same rule as 9b: run the seed from the clone you are testing.

**4. Prove the read and the pin** in Claude Code (`claude -c`):
1. *"Through the hub, ask github-service to `get_file_contents` owner `<owner>`, repo `<repo>`, path `<a file in it>`, ref
   `main`."* → the file's text and the commit it was read at.
2. The same call with any other repo → refused with `PINNED_ARGUMENT`. That refusal is the pin working.

Rotation: replace the token line in `services/github-service/.env`, then `docker compose -f docker-compose.self-host.yml
--profile git up -d`. Anything on this host that can reach `127.0.0.1:3110` gets the token added to its requests (the same
host-level trust as the rest of the stack) — keep the port local. The background health check reads GitHub once every
5 minutes; with a token that is far inside GitHub's limit.

| Symptom | Cause | Fix |
|---|---|---|
| `/healthz` answers 503 | token missing, revoked or expired (health checks the token only) | new token line in `services/github-service/.env`, then `up -d` |
| a read is refused `PINNED_ARGUMENT` | the call named another repo, a commit, or a ref other than `main` — or the pin is unset (the seed printed ⚠️) | set `GIT_FILE_SOURCE_PIN` in the hub's `.env`, restart the hub |
| reads still refused after you set the pin | the pin is read once, when the hub starts | restart the hub (between runs: a restart stops runs in flight) |
| the hub's MCP server will not start, `GIT_FILE_SOURCE_PIN is malformed` | the value is not exactly `<owner>/<repo>` | fix the value; letters, digits, `.` `_` `-` only, no branch |
| health is 200 but a read fails (404) | the token cannot see that repo (a private repo needs it selected, Contents read-only) | regenerate the token for that repo |
| a read with `ref: main` fails | the repo has no `main` branch | create a protected `main` branch (it need not be the default branch) |

## 10. Operate it from Claude — the GUI is not how pAIchart is run
Two things come with the clone that make step 8 more than a connector:

- **Purpose-built sub-agents.** `.claude/agents/` holds the specialist agents and `CLAUDE.md` tells Claude Code how to use
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
    (a private address needs the allowlist line in step 9b).
  - *"Run the health check on ceos-lab-readonly and call list_devices"* → `services(action: 'health' / 'call', …)`.
- **Programs and pipelines.** For a multi-specialist delivery — a reviewed change package from a requirements
  document and a topology — you don't drive the steps yourself; the harness does (plan, the plan-approval gate, the
  legs, synthesis, the verdict). [FIRST-RUN.md](FIRST-RUN.md) launches one call by call. The in-hub guides are
  `prompt_command("/prompt HOWTO-use-pipeline-harness")` and `/prompt HOWTO-use-program-harness`; `verification/`
  holds real program runs with their evidence (VT-01 onward) — read one before your first run so you know what a
  releasable result looks like. To add a domain of your own: `.claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md`
  and `ADD-A-PROGRAM-PROTOCOL.md`.

### 10b. Your first run

**[FIRST-RUN.md](FIRST-RUN.md)** — look at a finished run on the hosted site, then run the same use case on this install
(it needs only steps 8, 9b and 9c: no lab, no switches), then a bigger example with its own lab.

**You are done installing when:** the four `curl` checks at the end of step 5 print `200`, `200`, your own origin and `401`;
step 6's page shows `http://HOST:3000/mcp`; your Anthropic key is saved (step 8); and `claude mcp list` shows
`paichart … ✔ Connected`.

## Things that will bite (each cost real time)
- **Late bind** (the most repeatable false failure in this guide): both servers log "ready" 10–60 s before they listen.
  A single `curl` returns `000` and `ss -ltnp` shows nothing; the process is fine. Poll as in step 5.
- `pkill -f "some-pattern"` typed inside an `ssh host '…'` command matches the ssh shell itself — use `patter[n]`.
- Stopping the `npm` wrapper leaves the node child on the port; find it with `ss -ltnp | grep :3000` and kill that.
- **The MCP process does not hot-reload.** After a `git pull` that touches `lib/`, `scripts/` or `mcp-server-http-clean.js`,
  restart it (`sudo systemctl restart paichart-mcp`): it keeps running the old code until you do. Same for re-seeded
  prompts — it reads the prompt list at boot.
- The MCP process binds loopback only; nothing else needs to reach :8080 — the web server on :3000 proxies `/mcp` and `/oauth/*` to it.
- `curl` cannot see CSP; only a browser can. Step 6 is not optional.
