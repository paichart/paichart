# Cross-Service JTI Forensics Runbook

**Purpose**: Trace a specific JWT mint event from pAIchart's audit logs through to its downstream effect at a service like Snowflake.

**Status**: Live since U2 Audience-Tightening Phase F (2026-05-19).
**Source**: Folded from architectural-review Nice-to-have #1 in U2 round 1 specialist review.

---

## The chain we can trace

After U2 Audience-Tightening, every first-party MCP token mint produces a pino log entry with:

```json
{
  "userId": "cmfu87svx0000cjnmo7ldim0h",
  "email": "user@example.com",
  "role": "ADMIN",
  "scope": "mcp:execute",
  "audience": "https://paichart.app/mcp/snowflake-service",
  "azp": "claude-desktop",
  "jti": "a1b2c3d4e5f6...",
  "purpose": "per-call-forward",
  "ttl": 900,
  "kid": "paichart-2026-01",
  "algorithm": "RS256",
  "msg": "Minted first-party MCP token"
}
```

The `jti` (JWT ID) is unique per mint. It's the join key that lets us correlate:
1. **The mint event** at pAIchart (pino log on paichart-mcp)
2. **The receipt** at the downstream service (Snowflake's query history, EIA's request log, etc.)
3. **The originating OAuth client** via `azp` (e.g., which AI client minted this — Claude Desktop, ChatGPT, Gemini)

---

## Forensic queries

### Step 1 — Find the mint event in pAIchart pino logs

On the paichart-mcp PM2 process:

```bash
ssh <PROD_USER>@<PROD_HOST>
pm2 logs --nostream --lines 100000 paichart-mcp 2>&1 \
  | grep "Minted first-party MCP token" \
  | grep '"jti":"<jti-value>"'
```

For a specific time window (e.g., last 24 hours):

```bash
pm2 logs --nostream --lines 100000 paichart-mcp 2>&1 \
  | grep "Minted first-party MCP token" \
  | jq 'select(.audience == "https://paichart.app/mcp/snowflake-service") | {jti, userId, azp, time}'
```

By userId (find all mints for a specific user):

```bash
pm2 logs --nostream --lines 100000 paichart-mcp 2>&1 \
  | grep "Minted first-party MCP token" \
  | jq 'select(.userId == "<user-cuid>") | {jti, audience, azp, purpose, time}'
```

### Step 2 — Find the same jti at Snowflake

Snowflake logs the inbound JWT in its query history when External OAuth validates a request. Query:

```sql
SELECT
  QUERY_ID,
  USER_NAME,
  ROLE_NAME,
  START_TIME,
  END_TIME,
  TOTAL_ELAPSED_TIME,
  AUTHENTICATION_FACTORS
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE
  START_TIME > DATEADD(hour, -24, CURRENT_TIMESTAMP())
  AND AUTHENTICATION_FACTORS LIKE '%<jti-value>%'
ORDER BY START_TIME DESC;
```

Note: AUTHENTICATION_FACTORS may not always contain jti — depends on Snowflake's external OAuth logging configuration. If jti isn't directly logged, correlate by user + audience + approximate time window.

### Step 3 — Identify the originating OAuth client via azp

The `azp` claim names the originating client. Possible values today:
- `claude-desktop` — Anthropic Claude Desktop
- `claude-browser` — Anthropic Claude.ai web
- `chatgpt-com` — OpenAI ChatGPT
- `gemini-cli` — Google Gemini CLI
- `webapp` — pAIchart's own web UI
- `mcp-client` — generic / fallback

Trace from jti → mint log → `azp` field → originating client.

### Step 4 — Correlate to user activity

The mint event's `userId` joins to the User table:

```bash
ssh <PROD_USER>@<PROD_HOST>
cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL"

# In psql:
SELECT id, email, role, "lastLoginAt" FROM "User" WHERE id = '<user-cuid>';
```

For activity correlation:

```sql
SELECT type, description, "createdAt"
FROM "Activity"
WHERE "createdBy" = '<user-cuid>'
  AND "createdAt" > now() - interval '24 hours'
ORDER BY "createdAt" DESC
LIMIT 20;
```

---

## Known limitation — X-API-Key authentication

**Tokens minted from X-API-Key authentication (PAICHART_API_KEY) have no `azp` claim.**

The long-lived service key predates azp-propagation work (Component 5 / Option α). For these tokens, the forensic trace chain is:

`jti → mint log → authMethod: 'api-key'`

There is no originating OAuth client to join to. This is **correct semantics** (no OAuth client minting means no azp), not a missing-data bug. Do not flag this as an observability gap.

Example pino log payload for an API-key per-call mint:

```json
{
  "userId": "cmfu87svx0000cjnmo7ldim0h",
  "email": "system@paichart.com",
  "role": "ADMIN",
  "scope": "mcp:execute",
  "audience": "https://paichart.app/api",
  "azp": undefined,
  "jti": "...",
  "purpose": "per-call-forward",
  "authMethod": "api-key"
}
```

The `undefined` azp is preserved (per oauth-multi-client C2 — `payload.azp` passed directly, not coalesced to null) so the JSON encoder OMITS the `azp` field entirely from the JWT. Trace stops at `authMethod: 'api-key'`.

---

## Sampling caveats (Phase F.5)

When `PAICHART_MCP_MINT_LOG_SAMPLE_RATE` is set below 1.0 (e.g., 0.1 = 10% sampling), only sampled `purpose: 'per-call-forward'` mints appear in logs. `oauth-callback` and `refresh` mints ALWAYS log at info regardless of sample rate.

For full forensic coverage during incident response, temporarily set:

```bash
ssh <PROD_USER>@<PROD_HOST>
cd /var/www/paichart-app/current
# Set PAICHART_MCP_MINT_LOG_SAMPLE_RATE=1.0 in .env.production
pm2 reload paichart-mcp --update-env
# Restore previous value when investigation complete
```

Don't leave at 1.0 in steady state — per-call mints generate high log volume at SaaS scale.

---

## Typical investigation patterns

### "Why did user X's workflow break?"
1. Grep pino for `userId` in last 24h
2. Find any mints where `audience` mismatches the destination service (e.g., audience says `/mcp/snowflake-service` but Snowflake rejected)
3. Check audience config at destination service

### "Is there pathological mint volume?"
1. Grep pino for `Minted first-party MCP token` count over 24h
2. Group by `userId` to find top callers
3. If any user > 10k mints/day, investigate workflow patterns or check for compromised account

### "Did refresh-token attempted reuse?"
1. Grep for `cross-client refresh attempt blocked` warnings (logged at warn level by U2 Phase E.8)
2. Look for repeated attempts from the same userId (potential automated attack)

### "Did rate limiter fire for any user?"
1. Grep for `mint_rate_limit_exceeded`
2. Group by `userId` — multiple hits indicate either misbehaving workflow or attack

---

## Cross-references

- Mint location: `lib/auth/token-manager.ts` `mintMcpToken()` (Phase A)
- Phase F.5 sampling: `PAICHART_MCP_MINT_LOG_SAMPLE_RATE` env var
- Phase E.8 client mismatch: `mcp-server-http-clean.js` refresh-grant handlers
- v3.1 plan reference: `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md` (Edit 4)
- Source: architectural-review Nice-to-have #1 from U2 round 1 review
- Per-service audience helper: `lib/mcp/server/tools/hub/audience-policy.js`
