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
npm ci                                   # 10–20 min on a laptop; ~780 packages
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
npm run db:seed                          # 9 steps, ~30 s, ends "✅ db:seed complete"; the SUPER_ADMIN password is printed ONCE — copy it now
                                         # lost it? npm run db:admin -- --reset-password
```
Two processes. Two terminals (or `nohup … &` as below — not supervised; restart by hand after a reboot):
```bash
nohup npm run dev          > ~/web.log 2>&1 &
nohup npm run mcp:http:dev > ~/mcp.log 2>&1 &
curl -s -o /dev/null -w '%{http_code}\n' --max-time 180 localhost:3000/api/health            # expect 200 (first hit compiles ~60–90 s)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/health                                # expect 200
curl -s localhost:3000/.well-known/oauth-authorization-server | grep -o '"issuer":"[^"]*"'    # expect "http://HOST:3000" — your origin, nobody else's
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/mcp                                  # expect 401 (no token — correct)
```

## 6. Log in (a real browser — some failures only a browser can show)
Open `http://HOST:3000/login` → click the **lock** icon → `ADMIN_EMAIL` + the printed password. You land on the
setup sheet (`/auth/oauth/success`) and it must show **`http://HOST:3000/mcp`** as the MCP URL.
If the page is unstyled with dead icons: press `Ctrl+Shift+R` once; if it persists, open DevTools → Console and
look for `ERR_SSL_PROTOCOL_ERROR` — report it, that class is supposed to be fixed.

Then prove the install owns its identity: `docs/VERIFYING-SELF-HOST.md` with `BASE=http://HOST:3000; MCP=$BASE`.

## 7. An account for daily work
`/admin/users` → create a user, role **ADMIN**, and **set a password** in the dialog (blank means "will sign in
with OAuth", and an account without one cannot log in). SUPER_ADMIN is for administration only.

## 8. Connect Claude Code to your hub
In pAIchart: log in as the ADMIN user → **Settings → API Keys** → create one (short expiry for a lab). Then, on the
machine you use Claude from (this one, or your workstation — install it there the same way as step 2):
```bash
claude mcp add --transport http paichart http://HOST:3000/mcp --header "X-API-Key: <the key>"
claude mcp list                                       # expect paichart … ✔ Connected
```
Restart Claude Code; the hub's tools appear as `mcp__paichart__*`. First thing to try:
`prompt_command("/prompt HOWTO-get-started")`, then `perform(action: "pov.create", …)`.
The key is stored in plaintext in `~/.claude.json`; it expires on the date you chose.

Claude Desktop cannot send a header: use OAuth (`docs/OAUTH-SETUP.md` §B.1, callback `http://HOST:3000/oauth/callback`)
or the `mcp-remote --header` stanza the setup sheet shows.

## 9. Register a service that runs on your own network (optional)
The hub refuses private addresses unless you, the operator, list them (RUNNING.md → "Registering a service on
your own network"):
```bash
echo 'HUB_PRIVATE_ENDPOINT_ALLOWLIST="127.0.0.1:3107"' >> ~/paichart/.env     # IPv4 host:port or CIDR; read at boot
pkill -f "mcp-server-http-clea[n]"; cd ~/paichart && nohup npm run mcp:http:dev > ~/mcp.log 2>&1 &
sleep 8; grep endpoint-allowlist ~/mcp.log                                        # expect "private endpoints admitted: …"; rejected entries are named here
```
Then from Claude: `registry(action: 'register', name: 'my-service', endpoint: 'http://127.0.0.1:3107/mcp', category: …,
capabilities: { tools: [{ name, description, inputSchema }, …] })` — full tool schemas, not just names, so callers
never have to guess parameters — then `registry(action: 'tools', service_name: 'my-service')` should grade A.

## Things that will bite (each cost real time)
- `pkill -f "some-pattern"` typed inside an `ssh host '…'` command matches the ssh shell itself — use `patter[n]`.
- Stopping the `npm` wrapper leaves the node child on the port; find it with `ss -ltnp | grep :3000` and kill that.
- Re-seeding prompts (`scripts/seed-operational-prompts.ts`) needs the MCP process restarted — it reads the prompt list at boot.
- The MCP process binds loopback only; nothing else needs to reach :8080 — the web server on :3000 proxies `/mcp` and `/oauth/*` to it.
- `curl` cannot see CSP; only a browser can. Step 3 is not optional.
