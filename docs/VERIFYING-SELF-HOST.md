# Verifying a self-hosted pAIchart owns its identity

**What this proves**: your install mints tokens for *your* origin, advertises *your* OAuth endpoints, and
rejects tokens issued for anyone else's — and that it refuses to boot in production without that origin set.
Run it after first install, after changing `APP_BASE_URL`, and after upgrading.

Everything derives from one variable, `APP_BASE_URL` (see [RUNNING.md](RUNNING.md) → "`APP_BASE_URL` is your
identity"). Below, `BASE` means the exact value you set — e.g. `https://paichart.example.com`, or
`http://localhost:3000` for a local check. Both servers must be running (web on 3000, MCP on 8080, or your proxy).

## 1. Automated — the CI gate (30 s, no servers needed)

```bash
npm run test:public-base-url
```

Spawns a child process per case and must print `✅ test:public-base-url — all cases pass`. It proves the
derivation itself: canonicalisation (trailing slash, whitespace, upper-case host), a derived base mints and
verifies its own tokens, a token carrying a *different* issuer is rejected, malformed values are refused at
module load, and `NODE_ENV=production` with the variable unset throws. If this is red, stop — nothing below
will be meaningful.

## 2. Discovery documents advertise YOUR origin

```bash
curl -s $BASE/.well-known/oauth-authorization-server | python3 -m json.tool
curl -s $BASE/.well-known/oauth-protected-resource    | python3 -m json.tool
```

Expected — every URL-valued field starts with `BASE`, no exceptions:

| Document | Field | Must equal |
|---|---|---|
| authorization-server | `issuer` | `BASE` (RFC 8414 §3.3: must equal the origin you fetched it from) |
| | `authorization_endpoint`, `token_endpoint`, `registration_endpoint` | `BASE/oauth/authorize`, `BASE/oauth/token`, `BASE/oauth/register` |
| | `jwks_uri` | `BASE/mcp/.well-known/jwks.json` |
| protected-resource | `resource` | `BASE/mcp` |
| | `authorization_servers` | `["BASE"]` |

One-liner that fails loudly if *anything* still points elsewhere (replace the example host with a domain you
do **not** own — the point is that no foreign origin appears):

```bash
for p in oauth-authorization-server oauth-protected-resource; do
  curl -s $BASE/.well-known/$p | grep -oE 'https?://[^"/]+' | sort -u
done
# expect: ONE distinct origin, and it is BASE
```

## 3. The 401 that starts every MCP client's OAuth flow points home

```bash
curl -s -D - -o /tmp/init.json -X POST $BASE/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}' \
  | grep -iE '^HTTP|www-authenticate|^link'
grep -oE '"authorization_server":"[^"]+"' /tmp/init.json
```

Expected: `HTTP 401`; `WWW-Authenticate: Bearer resource_metadata="BASE/.well-known/oauth-protected-resource"`;
`Link: <BASE/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`; body
`authorization_server` = `BASE/.well-known/oauth-authorization-server`. This is the first URL Claude Desktop /
ChatGPT follow — if it names another host, your users are sent to *that* host to log in.

## 4. Tokens carry your issuer, and foreign tokens are rejected

Log in, then **Settings → API Keys → create one**. Decode its payload (no verification needed — you only want
to read the claims):

```bash
KEY='<paste the key>'
echo "$KEY" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool | grep -E '"(iss|aud)"'
```
Expected: `"iss": "BASE"`, `"aud": "BASE/mcp"`.

Prove it verifies — against the **web verifier**, not an MCP list method. `tools/list`, `resources/list`,
`prompts/list`, `ping` and `initialize` are *public* MCP methods (they answer 200 to anyone; `initialize` 401s
only when the header is entirely absent, as the OAuth discovery trigger), so a 200 there proves nothing about
your key. `/api/auth/me` runs the same `verifyAccessToken` the MCP server uses for protected calls:
```bash
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/auth/me -H "Authorization: Bearer $KEY"
# expect 200
```

Prove a token minted for a *different* issuer is refused — sign one with your own key but the wrong claims
(this is exactly what a token from another install, or from the public SaaS, looks like to you):
```bash
npx ts-node -r tsconfig-paths/register -e "
const { SignJWT, importPKCS8 } = require('jose');
(async () => {
  const pem = Buffer.from(process.env.JWT_PRIVATE_KEY_BASE64, 'base64').toString();
  const key = await importPKCS8(pem, 'RS256');
  console.log(await new SignJWT({ sub: 'x', userId: 'x', email: 'x@example.com', role: 'ADMIN' })
    .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KEY_ID })
    .setIssuer('https://not-your-host.example').setAudience('https://not-your-host.example/mcp')
    .setExpirationTime('5m').setIssuedAt().sign(key));
})();" > /tmp/foreign.jwt
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/auth/me -H "Authorization: Bearer $(cat /tmp/foreign.jwt)"
# expect 401 — same key, wrong issuer/audience, rejected
```
(**`set -a; . ./.env; set +a` first** — the one-liner reads `JWT_PRIVATE_KEY_BASE64` from your shell; without it the token is empty and a 401 proves nothing. Check the printed token is non-empty.)

## 5. Production refuses to run without an identity

Both servers fail loud in `NODE_ENV=production` when `APP_BASE_URL` is unset. Prove it once — from the repo
root (ts-node needs the project files), and with the variable set **empty** rather than unset: each server
re-reads `.env` at startup, and dotenv never overrides a variable already present in the environment, so an
empty value is the one way to hide your `.env` entry without editing the file. The module treats empty as absent.

```bash
APP_BASE_URL= NODE_ENV=production node mcp-server-http-clean.js 2>&1 | grep -m1 APP_BASE_URL; echo "exit=${PIPESTATUS[0]}"
APP_BASE_URL= NODE_ENV=production node server.js               2>&1 | grep -m1 APP_BASE_URL; echo "exit=${PIPESTATUS[0]}"
# expect on each: "APP_BASE_URL is required in production: …" and exit=1
```
(`env -u APP_BASE_URL …` does NOT work for this — dotenv puts the `.env` value straight back.)

A malformed value is refused in *every* environment (`https://host/path`, `https://user:pw@host`, a bare host
with no scheme): `APP_BASE_URL=paichart.example node mcp-server-http-clean.js` must exit with
`APP_BASE_URL is not an absolute URL`.

## 6. If you also run pAIchart's Docker services

Each service verifies tokens independently. Set on every service: `PAICHART_ISSUER=BASE` (exact string —
lower-case host, no trailing slash) and its JWKS URL to `BASE/api/auth/jwks`. A service whose verifier still
names another issuer will reject every forwarded token with an audience/issuer mismatch; the pAIchart side of
the flow (steps 2–5) will look healthy, so check the service's own logs.

## When something fails

| Symptom | Cause |
|---|---|
| Step 2 shows a foreign origin | `APP_BASE_URL` not set (dev) or stale process — restart both servers; env is read once at boot |
| Step 2 `issuer` right, endpoints wrong | you are on a build older than 2026-09-04 (`lib/auth/public-base-url.ts` missing) — upgrade |
| Step 4 API key has the right claims but tools/list is 401 | web and MCP servers read *different* `.env` files (issuer ≠ accept-list) — both must see the same `APP_BASE_URL` |
| Users re-prompted to log in after you changed `APP_BASE_URL` | expected — the old audience is no longer accepted; refresh tokens carry it |
| Step 5 boots anyway | `NODE_ENV` is not `production` for that process; the fallback is by design outside production |
