# OAuth setup for a self-hosted pAIchart

pAIchart runs **two separate OAuth systems**. They share no configuration; you can set up one, both, or
neither (password login works without any of this).

| System | Purpose | Who registers the app | Env vars |
|---|---|---|---|
| **A. Web-app login** | "Sign in with GitHub / Google / Microsoft" on `/login` | you, one app per provider | `GITHUB_*`, `GOOGLE_*`, `MICROSOFT_*` |
| **B. MCP OAuth** | Lets AI clients (Claude Desktop, ChatGPT, Gemini, Smithery…) connect to `/mcp` | you, **one GitHub App for all clients** | `MCP_CLI_GITHUB_CLIENT_ID/SECRET`, `OAUTH_STATE_SECRET` |

`APP_BASE_URL` must be your real public URL for either to work — every callback below is built from it.

## A. Web-app login providers

Callback URL for every provider: **`${APP_BASE_URL}/api/auth/oauth/callback/<provider>`**
(`<provider>` = `github` | `google` | `microsoft`)

| Provider | Where | Notes |
|---|---|---|
| GitHub | Settings → Developer settings → **OAuth Apps** → New | Homepage = `APP_BASE_URL`. Copy Client ID + a generated Client Secret → `GITHUB_CLIENT_ID/SECRET` |
| Google | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application) | Authorized redirect URI = the callback above → `GOOGLE_CLIENT_ID/SECRET` |
| Microsoft | Entra admin center → App registrations → New (Accounts in any org + personal) | Redirect URI (Web) = the callback above. The server uses the `common` tenant endpoint. → `MICROSOFT_CLIENT_ID/SECRET` |

New users created this way (and via `/register`) get `DEFAULT_USER_ROLE` — `USER` in the shipped `.env.example`; unset means `DEMO_USER`, a read-only role that cannot create POVs or join teams until an admin promotes them in `/admin/users`. `ALLOW_REGISTRATION=false` refuses first logins from unknown accounts. See RUNNING.md → Roles.

## B. MCP OAuth (AI clients)

pAIchart is an OAuth 2.1 **authorization server + resource server** for MCP clients (RFC 8414 metadata,
Dynamic Client Registration, PKCE, RFC 8707 resource indicators). Clients discover it from
`${APP_BASE_URL}/.well-known/oauth-authorization-server`. Behind the scenes it authenticates the human
with **GitHub** using the *proxy pattern*: the server does the GitHub exchange, so **one GitHub App serves
every MCP client** — you never register per-client apps.

1. GitHub → Settings → Developer settings → **GitHub Apps** (an App, not an OAuth App) → New.
   - Callback URL: **`${APP_BASE_URL}/oauth/callback`** (the server's own — not per-client)
   - Request user authorization (OAuth) during installation: **on**. Webhooks: off. Permissions: none needed beyond user email.
2. Client ID + a generated client secret → `MCP_CLI_GITHUB_CLIENT_ID` / `MCP_CLI_GITHUB_CLIENT_SECRET`.
3. `OAUTH_STATE_SECRET` = `openssl rand -hex 32`.
4. Restart the MCP server, then verify:
   ```bash
   curl -s ${APP_BASE_URL}/.well-known/oauth-authorization-server | jq .issuer   # == APP_BASE_URL
   curl -s ${APP_BASE_URL}/.well-known/oauth-protected-resource | jq .resource   # == APP_BASE_URL/mcp
   ```
5. In Claude Desktop / ChatGPT, add an MCP connector with URL `${APP_BASE_URL}/mcp` — the client will
   discover the metadata, register itself, and send the user through GitHub.

Tokens are RS256, signed with the key from `npm run jwt:keys`, verifiable at `${APP_BASE_URL}/api/auth/jwks`.
Audiences are per resource (`…/api` for web tokens, `…/mcp` for MCP tokens) and never interchangeable.

## Without OAuth
Skip all of the above. Password login (`npm run db:admin` creates the first account) and API keys minted in
Settings → API Keys cover local development and single-operator installs.

## Troubleshooting
- `redirect_uri_mismatch` → the provider's registered callback ≠ `APP_BASE_URL` + the path above (scheme and trailing slash count).
- Metadata shows the wrong `issuer` → `APP_BASE_URL` is wrong in `.env` (it must be the public URL, not `localhost`, in production). Restart after changing.
- Client says "authentication required" forever → the MCP server isn't reachable at `${APP_BASE_URL}/mcp` through your proxy (see RUNNING.md → Production shape).
