# Docker MCP Service Gold Standard Pattern v2

**Type**: Implementation Pattern (end-to-end service creation)
**Confidence**: 98% (production-validated March 2026)
**Status**: Complete — evolved from v1 (browser-automation) + EIA + Snowflake learnings
**Created**: March 15, 2026
**Last Updated**: May 16, 2026 (added SSRF registration gate + seed-script-as-escape-valve operational guidance — sec-ops Finding B / Phase 3 C1. Also refined Step 10 seed-script template to `findFirst` + update/create pattern after running the 4 missing-seed-script recovery on production revealed the canonical-id-upsert foot-gun; added shared `assertEndpointSafe` helper notes + tutorial cross-references)
**Author**: Claude Opus 4.6 + Steve Terry
**Supersedes**: `docker-mcp-service-gold-standard.md` (v1, January 2026)

---

## What's New in v2

| Feature | v1 (Jan 2026) | v2 (Mar 2026) |
|---------|---------------|---------------|
| MCP SDK | 1.17.5 | 1.25.3 (Snowflake), 1.17.5 (others, stable) |
| Transport | SSE only | SSE (default) or Streamable HTTP |
| Auth | None (internal only) | JWKS token validation + External OAuth |
| Trust model | TRUSTED only | TRUSTED or OWNER/TEAM_MEMBER (configurable) |
| Env config | Root `.env` | Service-specific `.env` via `env_file` |
| Retry logic | None | Exponential backoff with retryable error detection |
| Third-party auth | Not supported | External OAuth (Snowflake pattern) |
| Registration path | MCP `registry.register` or seed | **Seed script ONLY** for localhost endpoints (May 2026 — SSRF gate now blocks user-facing registration of private-IP endpoints; `SSRF_EXEMPT_SERVICES` exempts the seeded list at update time but `registry.register` has no exemption since no DB record exists yet) |

---

## Overview

This pattern captures the **complete journey** from creating a Docker-based MCP service to production deployment with Hub integration. It incorporates critical lessons learned from 7 production services.

**What This Pattern Covers**:
1. Service code structure and directory layout
2. MCP SDK integration with Express + SSE transport
3. JWKS token validation (defense-in-depth)
4. External OAuth passthrough (third-party auth like Snowflake)
5. Docker container build and deployment
6. Service registration and trust level configuration
7. Compliance policy configuration (two separate lists)
8. CI/CD pipeline integration
9. Testing patterns and troubleshooting
10. Production deployment checklist

**Use this pattern to create**:
- Internal MCP services (notification, analytics, etc.)
- External API integrations (EIA, EODHD, Snowflake, etc.)
- Services with third-party OAuth passthrough

**Architecture context**: This pattern builds **Tier 3 (External Hub Services)** — Docker containers callable via `services(action: "call")`. See `/.claude/knowledge/domain/mcp/three-tier-tool-architecture.md` for how external services fit alongside Tier 1 (platform tools) and Tier 2 (internal services), including the Hub routing flow and trust level integration.

---

## Architecture Decision: Trust Level

**Before creating a service, decide its trust model:**

| Model | When to Use | Token Behavior | Config |
|-------|-------------|----------------|--------|
| **TRUSTED** | Internal services that don't need user identity for auth (weather, notifications) | Always receives token regardless of context | Add to BOTH policy lists |
| **OWNER/TEAM_MEMBER** | Services that authenticate to third parties using the caller's identity (Snowflake, external APIs) | Token only with `povId` + team membership | Add to `service-call-policy.js` only (SSRF bypass), NOT `service-approval-policy.js` |

**Key insight (Snowflake learning)**: If your service uses the JWT token to authenticate to a third party (External OAuth), you probably want OWNER/TEAM_MEMBER trust — not TRUSTED. TRUSTED sends tokens to every caller, which may fail if the caller's identity doesn't match a user in the third-party system.

### Two Separate Policy Lists

```
service-call-policy.js          → SSRF bypass (allows localhost calls)
service-approval-policy.js      → Trust level (determines token forwarding)
```

- **Internal services (weather, EIA)**: Add to BOTH lists
- **External OAuth services (Snowflake)**: Add to `service-call-policy.js` ONLY

---

## Step 1: Directory Structure

```
services/service-name/
├── src/
│   ├── index.ts              # MCP server entry (SSE transport)
│   ├── tools/
│   │   ├── tool-one.ts       # Tool implementations
│   │   └── tool-two.ts
│   ├── auth/
│   │   └── jwks-validator.ts # JWKS token validation (if needed)
│   ├── client/               # External API client (if needed)
│   │   └── api-client.ts
│   └── health/
│       └── check.ts
├── .env                      # Service-specific credentials (gitignored)
├── .dockerignore
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Step 2: Package.json

```json
{
  "name": "@paichart/service-name",
  "version": "1.0.0",
  "description": "MCP Service - description",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.25.3",
    "express": "^4.18.2",
    "jose": "^5.2.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Notes**:
- `jose` is included for JWKS token validation (even TRUSTED services may want defense-in-depth)
- Add domain-specific dependencies as needed (e.g., `snowflake-sdk`, `axios`)

---

## Step 3: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**CRITICAL**: The root `tsconfig.json` must exclude `services/**/*.ts` to prevent Next.js from trying to compile service code:
```json
// In root tsconfig.json
"exclude": ["node_modules", "scripts/**/*.ts", "services/**/*.ts"]
```

---

## Step 4: JWKS Token Validation

> **POST-U2 2026-05-19 — per-service audience required**
>
> The Hub now mints **per-service audiences** (RFC 8707) for tokens forwarded to your service: `https://paichart.app/mcp/<your-service-slug>`. Your validator's accept-list MUST include this audience or it will reject all per-call mints with "unexpected aud claim value". The 2 legacy generic audiences remain accepted during the 1-week overlap window after U2 deploy.
>
> Recommended pattern: env-var-driven accept-list so future audience changes don't require code edits per service. See `cline_docs/follow-ups/per-service-jwks-validator-2026-05-18.md` for the architectural improvement spec.

```typescript
// src/auth/jwks-validator.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PAICHART_JWKS_URL = process.env.PAICHART_JWKS_URL || 'https://paichart.app/api/auth/jwks';
const PAICHART_ISSUER = process.env.PAICHART_ISSUER || 'https://paichart.app';

// U2 Audience-Tightening (2026-05-19): per-service audience is the primary accept value.
// Replace <your-service-slug> with your service's normalized name (the value passed
// at service registration; NFKD-normalized lowercase with non-alphanumeric chars
// replaced by dashes — e.g., 'Snowflake Service' → 'snowflake-service').
// The 2 legacy generic audiences stay during the 1-week overlap window; drop them later.
const PER_SERVICE_AUDIENCE = process.env.PAICHART_PER_SERVICE_AUDIENCE
  || `${PAICHART_ISSUER}/mcp/<your-service-slug>`;
const LEGACY_AUDIENCES = (process.env.PAICHART_LEGACY_AUDIENCES
  || `${PAICHART_ISSUER}/api,${PAICHART_ISSUER}/mcp`).split(',').map(s => s.trim()).filter(Boolean);
const PAICHART_AUDIENCES = [PER_SERVICE_AUDIENCE, ...LEGACY_AUDIENCES];

const jwks = createRemoteJWKSet(new URL(PAICHART_JWKS_URL));

export interface ValidatedUser {
  userId: string;
  email: string;
  role: string;
  azp?: string;  // U2 Option α: authorized party (client_id) for forensic chain
}

export async function validateToken(token: string): Promise<ValidatedUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: PAICHART_ISSUER,
    audience: PAICHART_AUDIENCES,
  });
  if (!payload.sub) throw new Error('Token missing subject claim');
  return {
    userId: payload.sub,
    email: payload.email as string,
    role: payload.role as string,
    azp: payload.azp as string | undefined,  // may be undefined for X-API-Key auth (known limit per v3.1 N-5)
  };
}

export async function extractUser(args: Record<string, unknown>): Promise<ValidatedUser | null> {
  const context = args._context as Record<string, unknown> | undefined;
  if (!context?.token) return null;
  return validateToken(context.token as string);
}

export function extractToken(args: Record<string, unknown>): string | undefined {
  const context = args._context as Record<string, unknown> | undefined;
  return context?.token as string | undefined;
}
```

---

## Step 5: MCP Server (index.ts)

Key patterns (see full example in v1 or Snowflake service):

### Transport Boundary Guard (CRITICAL)
```typescript
/** Docker services cannot import from lib/ — inline this */
function ensureObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (value == null) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch { /* fallback */ }
  }
  return fallback;
}
```

### Tool Call Handler — Strip _context Before Zod
```typescript
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;
  const safeArgs = ensureObject(args);

  // Strip _context before Zod validation, preserve for JWKS
  const { _context, ...toolArgs } = safeArgs;
  const validatedInput = tool.inputSchema.parse(toolArgs);

  // Pass _context to handler for token extraction
  const result = await tool.handler({ ...validatedInput, _context });
  // ...
});
```

### Body-Parser Fix (CRITICAL)
```typescript
// ALWAYS pass req.body as third argument
await transport.handlePostMessage(req, res, req.body);
```

### SSE Endpoint — Keep Handler Alive
```typescript
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  // ... setup close handler BEFORE connect
  await mcpServer.connect(transport);
  await closePromise; // CRITICAL: don't return early
});
```

---

## Step 6: Service-Specific .env

**Each service has its own `.env` file** (not the root `.env`):

```bash
# services/service-name/.env
SERVICE_PORT=3106
NODE_ENV=development

# Service-specific credentials
API_KEY=your_key_here

# JWKS (if using token validation)
PAICHART_JWKS_URL=https://paichart.app/api/auth/jwks
PAICHART_ISSUER=https://paichart.app
```

**Docker Compose reads it via `env_file`**:
```yaml
services:
  my-service:
    env_file:
      - ./services/service-name/.env
```

**Why not root `.env`**: Isolates credentials per service. Each service manages its own secrets. The `.env` is gitignored but must be created manually on the production server.

**Production deployment**: After `git pull`, recreate the `.env` on the server:
```bash
ssh root@production 'cat > /var/www/paichart-app/current/services/service-name/.env << EOF
...credentials...
EOF
chmod 600 /var/www/paichart-app/current/services/service-name/.env'
```

---

## Step 7: Dockerfile

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN groupadd -r mcpuser && useradd -r -g mcpuser mcpuser
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN chown -R mcpuser:mcpuser /app
USER mcpuser
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:PORT/health || exit 1
EXPOSE PORT
CMD ["node", "dist/index.js"]
```

---

## Step 8: Docker Compose

```yaml
  service-name:
    container_name: mcp-service-name
    build:
      context: ./services/service-name
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "127.0.0.1:PORT:PORT"
    env_file:
      - ./services/service-name/.env
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "3"
    networks:
      - mcp-internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:PORT/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

---

## Step 9: Compliance Policy Configuration

### service-call-policy.js (ALL services)

Add tool names and service to SSRF bypass:

```javascript
// APPROVED_TOOLS
'tool_one', 'tool_two',

// TRUSTED_INTERNAL_SERVICES (SSRF bypass — ALL localhost services need this)
'service-name',
```

### service-approval-policy.js (TRUSTED services only)

**Only add if the service does NOT use External OAuth / third-party auth:**

```javascript
// TRUSTED_INTERNAL_SERVICES (trust level — determines token forwarding)
'service-name',  // Only if you want TRUSTED (always receives tokens)
// Do NOT add if service uses External OAuth (Snowflake pattern)
```

---

## Step 10: Seed Script

### 🚨 CRITICAL: The seed script is the ONLY registration path for Docker MCP services

The MCP `registry(action: 'register')` tool (callable from Claude Desktop /
ChatGPT / Embedded Hub) runs `assertEndpointSafe()` at the dispatch boundary
and **rejects any localhost / RFC-1918 / IPv6-loopback / AWS-metadata
endpoint** with no admin-only bypass. Trying to register a Docker MCP
service via that path will throw:

```
Endpoint register blocked: Blocked private IPv4: 127.0.0.1
```

Seed scripts call `prisma.mCPTool.upsert()` **directly** and bypass the MCP
handler entirely — Prisma writes the `http://localhost:PORT/sse` endpoint
untouched. This is intentional architectural separation
(sec-ops Finding B, Phase 3 C1, 2026-05-16):

- **`SSRF_EXEMPT_SERVICES`** at `lib/mcp/server/config/service-call-policy.js`
  is a seeded list. Update operations exempt-match by `.name` OR `.id`,
  so updating an already-seeded service with a localhost endpoint works.
- **Registration has no exemption** — there's no DB record yet to match
  against. User-facing self-service registrations should never legitimately
  need localhost / private-IP endpoints.

**To register or re-register a first-party Docker service**:

```bash
# CORRECT — direct Prisma upsert bypasses the SSRF gate
npx ts-node scripts/seed-service-name.ts

# WRONG — MCP tool will (correctly) reject:
#   registry(action: 'register',
#            name: 'service-name',
#            endpoint: 'http://localhost:PORT/sse', ...)
```

After the seed script runs once, the service is in the DB and in
`SSRF_EXEMPT_SERVICES`. Future updates via `registry(action: 'update')` MCP
tool work fine — the exempt check matches the existing record.

### Seed script template — `findFirst` + update/create pattern

**Critical pattern lesson (May 2026)**: do NOT use `upsert({ where: { id: 'canonical-name' }, ... })`. That pattern only works if the row in production also has the canonical id. If the service was ever registered via the user-facing MCP `registry.register` tool — even once, even months ago — its DB id is an auto-CUID (`cmlzz8gwu...`), not `'service-name'`. A canonical-id upsert will then **create a duplicate row** instead of updating the existing one.

The robust pattern is `findFirst` by name, then `update` (if found, preserving the existing id) or `create` (if not, with canonical id):

```typescript
// scripts/seed-service-name.ts
import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICE_NAME = 'service-name';

const CANONICAL_DATA = {
  name: SERVICE_NAME,
  description: 'Description...',
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: {
    tools: [
      {
        name: 'tool_one',
        description: 'What it does',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    ],
    categories: ['data-analytics'],
    transport: 'http',
  } as object,
  configuration: {
    endpoint: 'http://localhost:PORT/sse',
    transport: 'sse',
    category: 'data-services',
    serviceType: 'mcp_service',
    healthCheck: '/health',
    timeout: 60000,
  },
  credentials: {} as object,
  permissions: { publicAccess: true } as object,
};

async function main() {
  console.log(`Seeding ${SERVICE_NAME}...`);

  const existing = await prisma.mCPTool.findFirst({ where: { name: SERVICE_NAME } });

  if (existing) {
    await prisma.mCPTool.update({
      where: { id: existing.id },  // preserve existing id (CUID or canonical)
      data: CANONICAL_DATA,
    });
    console.log(`  ✓ updated existing row (id: ${existing.id})`);
  } else {
    await prisma.mCPTool.create({
      data: { id: SERVICE_NAME, ...CANONICAL_DATA },  // canonical id on first create
    });
    console.log(`  ✓ created new row with canonical id: ${SERVICE_NAME}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

**Why this is idempotent across three cases**:
- Existing row with auto-CUID → updates content, preserves the CUID (no duplicate)
- Existing row with canonical id → updates in place
- No row → creates with canonical id

**Don't forget**: also add the service name/id to `SSRF_EXEMPT_SERVICES` in `lib/mcp/server/config/service-call-policy.js` (Step 9 above), or the ongoing health-check fetches and service-call dispatches will be SSRF-blocked at runtime — separate from the registration gate.

### What to strip from `configuration` when seeding over an existing user-registration row

A service registered via the user-facing MCP tool acquires registration-event metadata in `configuration`. The seed script's canonical state should NOT include these — they're event records, not service identity:

| Field | Source | Keep in seed? |
|---|---|---|
| `endpoint`, `transport`, `category`, `serviceType`, `healthCheck`, `timeout` | Canonical service identity | ✅ Yes |
| `ownerId`, `ownerEmail`, `createdBy` | Set by user-registration handler | ❌ Drop |
| `approvalStatus`, `approvalNote` | Compliance evaluation event | ❌ Drop |
| `evaluationResult` (1–3KB blob) | Compliance evaluator output | ❌ Drop |

Running the seed script over a user-registered row normalizes the configuration to canonical state. After: `ownerEmail` gone, `evaluationResult` gone, `permissions` reduced to `{ publicAccess: true }` (the canonical first-party pattern).

`permissions` follows the same rule. User-registration handler sets:
```js
{ owner: userId, canDelete: [userId], canModify: [userId], publicAccess: true }
```
Seed script normalizes to:
```js
{ publicAccess: true }
```
Admins retain full access via role; the per-user `owner`/`canDelete`/`canModify` keys are only meaningful for user-owned external services, not first-party Docker services.

---

## Step 10b: Pull real tool schemas (services that WRAP a third-party server)

**Applies when your service wraps a third-party MCP server** — i.e. you register tools you did **not** author (a supergateway / Caddy-proxy / FastMCP-wrapper over SentinelOne, Chronicle, Trend, Cloudflare, etc.). The seed must carry the **real** parameter schemas, **not placeholders or doc-transcribed guesses**. Doc-sourced schemas drift from reality — wrong param names, wrong required-ness, missing params — and mislead AI clients (and the Hub's `qualityAssessment: "Grade A"` counts a *present* schema as "full" even when it's empty, so it won't catch this).

**Pull them from the live server's `tools/list` and re-seed** (works even on placeholder creds — `tools/list` doesn't call the upstream):

```bash
# On the box, after the container is up. Args: <port> <out.json> <curated tool names...>
python3 scripts/pull-mcp-schemas.py 3108 /tmp/svc.json tool_a tool_b tool_c
```

Then:
1. Save the output to `scripts/seed-data/<service>-tools.json` (keep it in the repo so re-seeds are reproducible).
2. Have the seed read it: `capabilities: { tools: JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data', '<svc>-tools.json'), 'utf8')) }`.
3. Re-run the seed, then **verify** with `registry(action: "tools", service_name: "...")` — confirm real params (not empty `properties: {}`).
4. Re-pull to refresh when the upstream changes.

**Not needed for services you author yourself** (your own TypeScript server, Steps 1–9) — there you write the `inputSchema` definitions directly, so they're already authoritative.

*(Real-world payoff, 2026-07-12: live-pulling caught that a doc-transcribed `powerquery` schema used the wrong param names (`start_time` vs real `start_datetime`) and that the SecOps tools were missing their `project_id/customer_id/region` params — errors that would have broken tool calls + workflow chaining.)*

---

## Step 11: CI/CD (GitHub Actions)

Update `.github/workflows/docker-services-deploy.yml`:

1. Add to `workflow_dispatch` options
2. Add to `push.paths` trigger
3. Add to `strategy.matrix.service`
4. Add env vars to `.env.docker` creation
5. Add container to cleanup command

---

## Step 12: Retry Logic

```typescript
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
const RETRY_BASE_DELAY = 1000;

function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return msg.includes('network') || msg.includes('timeout') ||
    msg.includes('connection') || msg.includes('econnreset') ||
    msg.includes('socket hang up');
}

// In execute method: exponential backoff
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  try {
    return await this._executeOnce(args);
  } catch (err: any) {
    if (attempt < MAX_RETRIES && isRetryableError(err)) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
      await sleep(delay);
      this.connection = null; // Reset for reconnect
    } else {
      throw err;
    }
  }
}
```

### Upstream-Call Resilience (2026-05-28 — eia/eodhd/weather incident)

A transient upstream stall — a keep-alive socket gone half-open after idle, a brief network blip — must fail **fast and recoverably**, not hang until the caller gives up. Four rules, learned from a field incident where a workflow step timed out at exactly 30s while the service looked healthy and silently hung:

**1. Per-request timeout MUST sit below the Hub's 30s per-step ceiling.** The Hub aborts every service call / workflow step at `maxExecutionTime` (default 30000). If your HTTP-client timeout *equals* that, your own retry never runs inside the caller's window — the Hub returns FAILED at the same instant. This was the core defect: eia/eodhd's timeout was bound to `*_API_TIMEOUT=30000` == the ceiling.

```typescript
// Hard-cap below the ceiling in code (the deployed env had drifted to 30000):
const API_TIMEOUT = Math.min(parseInt(process.env.API_TIMEOUT || '15000', 10), 15000);
```

**2. Retry transient timeout/connection errors, not only HTTP 5xx.** Step 12's classifier above is correct — but *audit your service against it*. eia/eodhd had regressed to status-only (`status >= 500 || status === 429`), so a timeout (which carries no `response.status`) was never retried. For axios, also match `error.code`:

```typescript
const transient = ['ECONNABORTED','ETIMEDOUT','ECONNRESET','ECONNREFUSED','EPIPE','ENOTFOUND','EAI_AGAIN'];
// retryable = status>=500 || status===429 || transient.includes(error.code)
```

**3. Disable keep-alive (or evict stale sockets).** A connection pooled across an idle period can be silently dropped by the upstream/NAT; reusing it hangs until timeout. For low-volume services the simplest robust fix is a non-keep-alive agent (handshake cost is negligible):

```typescript
import http from 'http'; import https from 'https';
const httpsAgent = new https.Agent({ keepAlive: false });
const httpAgent  = new http.Agent({ keepAlive: false });
// axios:      axios.create({ httpAgent, httpsAgent, timeout: API_TIMEOUT, ... })
// node-fetch: fetch(url, { agent: httpsAgent, signal: AbortSignal.timeout(API_TIMEOUT) })
```

**4. Log every upstream call's latency + outcome.** The incident needed external reproduction to diagnose only because the clients were silent. One line per call makes the next hang visible in `docker logs`:

```typescript
console.log(`[Service] upstream OK ${endpoint} ${Date.now() - startedAt}ms`);                                  // success
console.error(`[Service] upstream FAILED ${endpoint} ${Date.now()-startedAt}ms: ${err.code||''} ${err.message}`); // failure
```

> **Highest-leverage of the four**: rule 1. With the timeout == the ceiling, `MAX_RETRIES` is dead weight (the caller has already given up). Decoupling the two is what makes Step 12's retry actually fire. Pairs with Gotcha #11 — a health probe that pings `/health` stays green while the *tool's* upstream path is wedged, so a green health check is not evidence the tool works.

---

## Step 13: External OAuth Pattern (Snowflake)

When your service authenticates to a third party using the caller's JWT:

**PREREQUISITE**: The third party must support **External OAuth with custom authorization servers**. This means it can accept JWTs from pAIchart's JWKS endpoint, validate signatures, and map claims to local users. Services like Snowflake and Databricks support this. Services like GitHub and Slack do NOT — they are OAuth providers, not consumers of external JWTs. For those, use a service account with static credentials.

See `mcp-hub-external-service-authentication.md` → "Per-User Authentication to Third-Party Services" for the full compatibility table.

### Snowflake External OAuth Setup
```sql
CREATE SECURITY INTEGRATION paichart_external_oauth
  TYPE = external_oauth
  ENABLED = true
  EXTERNAL_OAUTH_TYPE = custom
  EXTERNAL_OAUTH_ISSUER = 'https://paichart.app'
  EXTERNAL_OAUTH_JWS_KEYS_URL = 'https://paichart.app/api/auth/jwks'
  -- U2 Audience-Tightening (RFC 8707): include your per-service audience as the primary value.
  -- The 2 legacy generic audiences remain accepted during the 1-week overlap window.
  EXTERNAL_OAUTH_AUDIENCE_LIST = (
    'https://paichart.app/mcp/<your-service-slug>',   -- per-service (RFC 8707, primary)
    'https://paichart.app/api',                       -- legacy (overlap window)
    'https://paichart.app/mcp'                        -- legacy (overlap window)
  )
  EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'email'
  EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'login_name'
  EXTERNAL_OAUTH_ANY_ROLE_MODE = 'ENABLE';
```

### Dual Auth Mode (service account + per-user OAuth)
```typescript
async execute(sql: string, binds?: any[], oauthToken?: string) {
  if (oauthToken) {
    // Per-user: create ephemeral connection with caller's JWT
    const conn = await connectOAuth(oauthToken);
    try {
      return await executeQuery(conn, sql, binds);
    } finally {
      conn.destroy(() => {}); // Always cleanup per-user connections
    }
  } else {
    // Service account fallback (health checks, no user context)
    await this.connectServiceAccount();
    return await executeQuery(this.serviceConnection, sql, binds);
  }
}
```

### Trust Level Configuration
- Do NOT add to `service-approval-policy.js` TRUSTED list
- Token forwarding requires `povId` + OWNER/TEAM_MEMBER trust
- This prevents tokens from being sent when there's no authorization context

### Strict OAuth Enforcement (REQUIRE_OAUTH)

For services where per-user identity is mandatory (audit trails, row-level security), add `REQUIRE_OAUTH=true` to the service `.env`. This changes behavior from permissive to restrictive:

| Scenario | REQUIRE_OAUTH=false (default) | REQUIRE_OAUTH=true |
|----------|------------------------------|-------------------|
| No `povId` (ANONYMOUS trust) | Service account query succeeds | **Rejected** — clear error message |
| With `povId` + team member | OAuth user query | OAuth user query |
| With `povId` + NOT team member | Service account fallback | **Rejected** — clear error message |
| Health check | Service account | Service account (bypassed) |

```typescript
// In the client's execute() method:
if (REQUIRE_OAUTH) {
  // No token → reject (not fallback)
  throw new Error('Per-user authentication required. Call via workflow.execute with povId.');
}
```

**When to use**: Services that authenticate to third parties via External OAuth where the service account should never be used for user queries (Snowflake, Databricks, etc.).

**When NOT to use**: Internal services where service account access is fine (weather, EIA, notifications).

**Future consideration**: If multiple services need this, promote `REQUIRE_OAUTH` to an MCPTool record field so the Hub can reject calls early with a helpful error before connecting to the service.

### SSRF / Trust Decoupling (Mar 2026)

Two separate policy files control two separate concerns:

| File | Function | Purpose |
|------|----------|---------|
| `service-call-policy.js` | `isSSRFExemptService()` | Network-layer: can we call localhost? |
| `service-approval-policy.js` | `isTrustedInternalService()` | Application-layer: should we forward JWT? |

**Standard services** (weather, EIA): Add to BOTH lists.
**External OAuth services** (Snowflake): Add to `service-call-policy.js` ONLY.

This separation was validated by 5 specialists (avg 91.2/100) and prevents the coupling bug where removing a service from the trust list also breaks SSRF bypass.

### SSRF Registration Gate (May 2026 — Phase 3 C1)

A third SSRF surface was added to close an asymmetry: the MCP `registry`
tool's `register` action now runs `assertEndpointSafe()` at the dispatch
boundary, same as `update` has done since BC51.

| Surface | Caller | Exempt-by-record? | Effect on Docker services |
|---------|--------|-------------------|---------------------------|
| `assertEndpointSafe()` at `registry(action: 'register')` | MCP tool callers (Claude Desktop / ChatGPT / Embedded) | **No** — no DB record yet | Blocks localhost. **Use seed script instead** (Step 10) |
| `assertEndpointSafe()` at `registry(action: 'update')` | MCP tool callers | **Yes** — matches existingService against `SSRF_EXEMPT_SERVICES` | Localhost updates pass for seeded services |
| `isSSRFExemptService()` at health-check + service-call | Hub runtime | **Yes** — matches loaded service | Localhost calls pass for seeded services |

**Why Docker services aren't disrupted**: seed scripts (Step 10) write
directly via `prisma.mCPTool.upsert()` — they don't traverse the MCP
handler dispatch boundary at all. After seeding, the service is in
`SSRF_EXEMPT_SERVICES`, so subsequent updates / health-checks / service-
calls exempt-match cleanly.

**The gate is intentional**: `SSRF_EXEMPT_SERVICES` is a seeded list, not a
self-service registration path. User-facing MCP-tool registrations should
never legitimately need localhost / RFC-1918 endpoints. If a runtime-
container-provisioning use case ever emerges (admin-only carve-out), see
`cline_docs/follow-ups/sec-ops-finding-b-ssrf-asymmetry.md` Decision 1
option (c).

**Reviewed by**: dev-ops-specialist (2026-05-16) — unconditional clear for
Docker container deployments. Reference: `cline_docs/reviews/phase-3-verdict-matrix-2026-05-16/`.

### Shared `assertEndpointSafe()` helper

The runtime SSRF gate is exposed as `assertEndpointSafe(endpoint, { existingService?, action? })` at `lib/mcp/server/tools/hub/hub-utilities.js`. Behavior:

- If `existingService` is passed AND it matches `SSRF_EXEMPT_SERVICES` (by `.name` OR `.id`): returns silently (exempt path).
- Otherwise calls `validateUrlSafety(endpoint)` and throws if unsafe.

Used at: `service-registration-handler.js` (register path, no `existingService`), `service-update-handler.js` (update path, passes `existingService`).

**Lesson learned (sec-ops Finding B, 2026-05-16)**: before this consolidation, `validateUrlSafety` was called inline at 6 sites in the hub (workflow-tools, service-call, hub-utilities, service-health, service-update, register). Each wrapped the exempt check + error shape differently — service-health used `isSSRFExemptService(service) ? { safe: true } : validateUrlSafety(...)`, others used `if (!isSSRFExemptService(...)) { const urlCheck = validateUrlSafety(...) ...`. The asymmetry between paths is what let the register gap persist.

**When you add a new path that needs the runtime gate**: import the helper, don't reimplement the check inline. Asymmetric defenses across handlers are how SSRF gaps get introduced — see Audit Checklist item 7 in `Z:\paichart\tutorials\09-hardening-mcp-tools.md` for the general pattern.

### Tutorial cross-references

The runtime-gates pattern (Layer 4 controls for threats Zod can't reach statically), the symmetric-coverage audit shape, and the seed-script-as-administrative-escape-valve principle are documented in:

- `Z:\paichart\tutorials\mcp-tool-layered-architecture-spec.md` — Part C "Static schemas vs runtime gates"
- `Z:\paichart\tutorials\09-hardening-mcp-tools.md` — "When the schema can't reach the threat" + audit checklist items 7 (symmetric runtime-gate coverage) and 8 (administrative escape valves)

These are the universal versions of what this gold standard documents specifically for Docker MCP services.

---

## Use Case: Snowflake MCP Service (Complete Reference)

Production-validated March 2026. This documents the end-to-end configuration for a Docker MCP service that authenticates to a third party (Snowflake) using the caller's pAIchart JWT via External OAuth.

### Architecture

```
User (Claude Desktop / ChatGPT)
  │  authenticates as <maintainer-email>
  ▼
pAIchart Hub (mcp-server-http-clean.js)
  │  validates JWT, determines trust level
  │  OWNER/TEAM_MEMBER trust (requires povId) → forwards _context.token
  ▼
Snowflake MCP Service (Docker, localhost:3106, SSE)
  │  extractToken() gets JWT from _context
  │  validateToken() verifies via JWKS (defense-in-depth)
  │  passes JWT to Snowflake via OAuth authenticator
  ▼
Snowflake (External OAuth)
  │  validates JWT signature via paichart.app/api/auth/jwks
  │  maps email claim → login_name
  │  uses user's default role (PAICHART_READER)
  ▼
Query executes as the authenticated user
```

### Snowflake Configuration (Production-Validated March 2026)

```sql
-- 1. Security integration (one-time setup)
-- CRITICAL: scope_mapping_attribute must be 'scope' (not 'scp')
-- CRITICAL: scope_delimiter must be ' ' (space, not comma) to match OAuth 2.0 standard
-- CRITICAL: allowed_roles_list must be empty () to avoid role filtering
CREATE OR REPLACE SECURITY INTEGRATION paichart_external_oauth
  TYPE = external_oauth
  ENABLED = true
  EXTERNAL_OAUTH_TYPE = custom
  EXTERNAL_OAUTH_ISSUER = 'https://paichart.app'
  EXTERNAL_OAUTH_JWS_KEYS_URL = 'https://paichart.app/api/auth/jwks'
  -- U2 Audience-Tightening (RFC 8707): include your per-service audience as the primary value.
  -- The 2 legacy generic audiences remain accepted during the 1-week overlap window.
  EXTERNAL_OAUTH_AUDIENCE_LIST = (
    'https://paichart.app/mcp/<your-service-slug>',   -- per-service (RFC 8707, primary)
    'https://paichart.app/api',                       -- legacy (overlap window)
    'https://paichart.app/mcp'                        -- legacy (overlap window)
  )
  EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'email'
  EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'login_name'
  EXTERNAL_OAUTH_ANY_ROLE_MODE = 'ENABLE'
  EXTERNAL_OAUTH_SCOPE_MAPPING_ATTRIBUTE = 'scope'
  EXTERNAL_OAUTH_SCOPE_DELIMITER = ' ';

-- 2. Non-admin role (ACCOUNTADMIN/SECURITYADMIN/ORGADMIN blocked by default)
CREATE ROLE IF NOT EXISTS PAICHART_READER;
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE PAICHART_READER;
GRANT USAGE ON DATABASE SNOWFLAKE_SAMPLE_DATA TO ROLE PAICHART_READER;
GRANT USAGE ON ALL SCHEMAS IN DATABASE SNOWFLAKE_SAMPLE_DATA TO ROLE PAICHART_READER;
GRANT SELECT ON ALL TABLES IN DATABASE SNOWFLAKE_SAMPLE_DATA TO ROLE PAICHART_READER;

-- 3. Service account (for health checks and fallback when no user token)
CREATE USER PAICHART_SERVICE_ACCOUNT
  PASSWORD = '<strong_password>'
  TYPE = PERSON
  DEFAULT_ROLE = 'PAICHART_READER'
  MUST_CHANGE_PASSWORD = FALSE
  COMMENT = 'Service account for pAIchart MCP service';
GRANT ROLE PAICHART_READER TO USER PAICHART_SERVICE_ACCOUNT;

-- 4. Per-user OAuth setup (each pAIchart user needs a Snowflake user)
-- The Snowflake username may differ from login_name (e.g., STEVE_TERRY vs steve.terry@...)
-- Use SHOW USERS to find the actual username, then grant role and set default
GRANT ROLE PAICHART_READER TO USER STEVE_TERRY;
ALTER USER STEVE_TERRY SET DEFAULT_ROLE = 'PAICHART_READER';
```

### Snowflake Gotchas (Lessons Learned)

| Issue | Symptom | Fix |
|-------|---------|-----|
| Scope delimiter | "role not listed in Access Token" | `EXTERNAL_OAUTH_SCOPE_DELIMITER = ' '` (space, not comma) |
| Scope mapping attribute | "role filtered" | `EXTERNAL_OAUTH_SCOPE_MAPPING_ATTRIBUTE = 'scope'` (matches JWT claim name) |
| Allowed roles list | "role not listed" even with ANY_ROLE_MODE | `EXTERNAL_OAUTH_ALLOWED_ROLES_LIST = ()` (empty) |
| Blocked roles | ACCOUNTADMIN blocked by default | Create non-admin role (PAICHART_READER) |
| Username vs login_name | "user not found" | Snowflake auto-creates usernames (STEVE_TERRY), login_name is the email. Use `SHOW USERS` to find actual username |
| Role not granted | "default role not granted to user" | Must `GRANT ROLE` AND `ALTER USER SET DEFAULT_ROLE` |
| JWT scope claim | Snowflake needs `session:role-any` | MCP token minting appends this automatically |

### Snowflake Account Format
- **Account**: `ORGNAME-ACCOUNTNAME` (e.g., `IJEUBCF-BK27563`) — from URL `app.snowflake.com/ijeubcf/bk27563`
- **Username**: May differ from login_name — use `SHOW USERS` to find it
- **Login name**: Email address — must match JWT `email` claim
- **Login name matching**: Case-insensitive

### Service .env
```bash
SNOWFLAKE_SERVICE_PORT=3106
SNOWFLAKE_ACCOUNT=IJEUBCF-BK27563
SNOWFLAKE_USER=PAICHART_SERVICE_ACCOUNT    # Dedicated service account (not personal)
SNOWFLAKE_PASSWORD=<password>               # Service account password
SNOWFLAKE_ROLE=PAICHART_READER             # Non-admin role
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
NODE_ENV=production
PAICHART_JWKS_URL=https://paichart.app/api/auth/jwks
PAICHART_ISSUER=https://paichart.app
REQUIRE_OAUTH=true                         # Reject queries without per-user OAuth
```

### Policy Configuration
```javascript
// service-call-policy.js — SSRF bypass (YES)
SSRF_EXEMPT_SERVICES: ['...', 'snowflake-service']

// service-approval-policy.js — Trust level (NO)
// snowflake-service: intentionally NOT trusted — uses External OAuth
// Token forwarding requires OWNER/TEAM_MEMBER trust (via povId)

// service-call-policy.js — Approved tools
APPROVED_TOOLS: ['...', 'run_snowflake_query', 'list_objects', 'describe_object']
```

### Testing from Claude Desktop
```
// Without povId — uses service account (no token forwarded)
services(action: "workflow.execute", steps: [{
  service: "Snowflake Service",
  tool: "list_objects",
  arguments: { objectType: "databases" }
}])

// With povId — forwards token for per-user OAuth
services(action: "workflow.execute", steps: [{
  service: "Snowflake Service",
  tool: "list_objects",
  arguments: { objectType: "databases" }
}], povId: "cmmcmw0qs0007yx60k1k5kpvx")
```

---

## Production Deployment Checklist

- [ ] Create directory structure in `services/service-name/`
- [ ] Implement `src/index.ts` with SSE transport
- [ ] **CRITICAL**: `handlePostMessage(req, res, req.body)` — pass third arg
- [ ] **CRITICAL**: `ensureObject` guard before `.parse()` in CallToolRequestSchema
- [ ] **CRITICAL**: Strip `_context` from args before Zod validation, preserve for handler (see Step 5)
- [ ] **CRITICAL**: Exclude `services/**/*.ts` from root `tsconfig.json`
- [ ] Create tool implementations in `src/tools/`
- [ ] Create health check in `src/health/check.ts`
- [ ] Set up `package.json` with MCP SDK 1.25.3
- [ ] Create `Dockerfile` (multi-stage build)
- [ ] Create service-specific `.env` (gitignored)
- [ ] Add to `docker-compose.yml` with `env_file` directive
- [ ] Add to `service-call-policy.js` (SSRF bypass + APPROVED_TOOLS)
- [ ] Decide trust model: add to `service-approval-policy.js` ONLY if TRUSTED
- [ ] Update `.github/workflows/docker-services-deploy.yml`
- [ ] `npm install && npm run build` (verify TypeScript compiles)
- [ ] Local test: `npm run dev` then `curl localhost:PORT/health`
- [ ] Docker test: `docker compose build service && docker compose up -d service`
- [ ] Create seed script in `scripts/seed-service-name.ts`
- [ ] **CRITICAL**: Seed script uses the `findFirst` + update/create pattern (NOT canonical-id `upsert`), so it's idempotent whether the row currently has the canonical id, an auto-CUID id, or doesn't exist — see Step 10
- [ ] **CRITICAL**: Seed script writes via Prisma directly (NOT the MCP `registry.register` tool — would be blocked by SSRF gate for localhost endpoints)
- [ ] Add service name/id to `SSRF_EXEMPT_SERVICES` in `lib/mcp/server/config/service-call-policy.js` (Step 9) — separate from registration; required for ongoing health-check + service-call dispatches
- [ ] If touching the SSRF gate or other runtime defenses on register/update paths: get a `dev-ops-specialist` review BEFORE shipping. Their job is to verify Docker container hostname/port reality matches the gate's exempt logic (see sec-ops Finding B, 2026-05-16 — that review caught the seed-script-bypass-handler asymmetry that the security-side specialists couldn't see from the code alone).
- [ ] Deploy to production: push, git pull, create `.env`, build, start
- [ ] Run seed script on production
- [ ] **Restart MCP server** (`pm2 restart paichart-mcp`) to pick up policy changes
- [ ] Test via Hub: `services(action: "call")` or `services(action: "workflow.execute")`
- [ ] Verify with `token-troubleshooting-demo` workflow (trust level check)
- [ ] **Post-change**: Verify `dist/` matches `src/` (`npx tsc` in service dir) — dist is gitignored, local staleness won't affect Docker builds but causes confusion during audits

---

## Common Gotchas (Lessons Learned)

### 1. Next.js Compiles Service Code
**Symptom**: `Cannot find module 'snowflake-sdk'` during Next.js build
**Fix**: Add `"services/**/*.ts"` to root `tsconfig.json` exclude list

### 2. MCP Server Doesn't Pick Up Policy Changes
**Symptom**: SSRF blocked even after adding to TRUSTED list
**Fix**: `pm2 restart paichart-mcp` — policy files are loaded at startup

### 2a. MCP `registry.register` rejects localhost endpoint (May 2026)
**Symptom**: Trying to register a Docker MCP service via Claude Desktop /
ChatGPT throws `Endpoint register blocked: Blocked private IPv4: 127.0.0.1`
**Fix**: Use the seed script, NOT the MCP tool. `npx ts-node scripts/seed-service-name.ts`
writes via `prisma.mCPTool.upsert()` directly and bypasses the SSRF gate.
See Step 10 for full operational guidance. This is **intentional** — the
registration path has no exemption since no DB record exists yet to match
against `SSRF_EXEMPT_SERVICES`.

### 3. Snowflake Account Format
**Symptom**: "Incorrect username or password"
**Fix**: Use `ORGNAME-ACCOUNTNAME` format (e.g., `IJEUBCF-BK27563`), email as username

### 4. Snowflake OAuth Role Blocked
**Symptom**: "role not listed in Access Token or was filtered"
**Fix**: Three things must all be correct:
1. `EXTERNAL_OAUTH_SCOPE_DELIMITER = ' '` (space, not default comma)
2. `EXTERNAL_OAUTH_SCOPE_MAPPING_ATTRIBUTE = 'scope'` (matches JWT claim name)
3. `GRANT ROLE PAICHART_READER TO USER <username>` + `ALTER USER SET DEFAULT_ROLE`

### 5. Production .env Lost After Git Pull
**Symptom**: Container fails to start after deployment
**Fix**: `.env` is gitignored — must be recreated on production server after each pull

### 6. Token Forwarding Requires povId (Non-TRUSTED Services)
**Symptom**: `authenticatedAs: "service-account"` instead of `"oauth-user"`
**Fix**: Include `povId` in workflow execution. Non-TRUSTED services need OWNER/TEAM_MEMBER trust which requires POV context.

### 7. Health Check Shows "degraded" on First Start
**Symptom**: Health returns `connected: false` initially
**Fix**: Normal — Snowflake/external connections are lazy (connect on first query, not startup)
**Caveat (2026-05-13)**: "degraded" is fine *transiently* during startup, but the health endpoint MUST return HTTP 503 (not 200) whenever the upstream is unreachable so the Hub's HTTP-status probe registers it. Earlier versions of the Snowflake service returned 200 for both `healthy` and `degraded`, masking real outages for hours. See gotcha #11 below for the correct status mapping.

### 8. MCP SDK 1.25.3 Stricter Startup Validation (Mar 2026)
**Symptom**: Service that previously showed "degraded" health now crashes at startup with missing env var errors
**Context**: SDK 1.25.3 validates configuration earlier than 1.17.5. Services with missing credentials (e.g., Snowflake without `SNOWFLAKE_ACCOUNT`) will fail-fast instead of starting in degraded mode. This is **better behavior** — fail-fast with a clear error beats silent degraded state that only fails when users try to query.
**Fix**: Configure credentials before starting, or stop the service until ready. Do NOT downgrade — the crash is telling you the truth.
**All 7 services now on 1.25.3** (Mar 2026): Standardized after boundary contract audit.

### 9. `_context` Stripping Before Zod (Mar 2026)
**Symptom**: TRUSTED services (EODHD, EIA, weather, notification, browser-auto) pass `_context` to Zod parse
**Context**: Zod silently drops unknown keys, so this works. But if a service upgrades to OWNER/TEAM_MEMBER trust and needs `_context.token`, it will be silently lost.
**Fix**: Follow gold standard Step 5 pattern — strip `_context` before Zod, pass to handler separately:
```typescript
const { _context, ...toolArgs } = safeArgs;
const validatedInput = tool.inputSchema.parse(toolArgs);
const result = await tool.handler({ ...validatedInput, _context });
```

### 10. Stale dist/ Files After Source Changes
**Symptom**: Discovery audit reports ensureObject missing but src has it — `dist/` is outdated
**Context**: `dist/` is gitignored and not used by Docker (Docker builds from source). But stale dist causes confusion during code audits.
**Fix**: Run `npx tsc` in service dir after source changes. Add to post-change checklist.

### 11. Health Probe Picks a Query Snowflake Answers Without Compute
**Symptom**: Health says 200/healthy but actual tool calls fail with "account suspended" / "warehouse not available".
**Context (2026-05-13)**: Snowflake answers `SELECT 1` and metadata queries from its cloud-services layer without engaging a warehouse. A suspended-for-payment account still returns success on those probes, so `testConnection()` returns true while user-facing queries fail. Same trap applies to any managed/billable upstream where compute and identity live on different planes.
**Fix for Snowflake**: probe `SELECT CURRENT_WAREHOUSE()` (or `SELECT 1 FROM <sample_table> LIMIT 1`) — requires the connection to actually have a warehouse attached.
**General rule**: a health probe for a managed/billable upstream must exercise the same path as user-facing tool calls, not the cheapest possible path the SDK happens to expose.

### 12. Service Hardcodes Hub-Flavored Hints into Its Own Errors
**Symptom**: User reports a misleading error like *"Per-user authentication required... call via workflow.execute with povId"* even though the real cause is billing / quota / syntax / network.
**Context (2026-05-13)**: The Snowflake service's strict-OAuth-failure path appended a fixed workflow-execute hint to *every* upstream error, including `"Your account is suspended due to lack of payment method"`. This sent multi-step diagnoses in the wrong direction.
**Fix v1 (2026-05-13)**: Inspect the upstream error message and only append auth-flow hints when the upstream error is genuinely identity-related (OAuth, JWT, role, "incorrect username or password", etc.). For non-auth errors, surface the upstream message cleanly. See `services/snowflake-service/src/snowflake/client.ts` `isIdentityError()` helper for the pattern.
**Fix v2 (2026-05-18)**: v1 was incomplete. When the Snowflake **account itself** is suspended (trial ended, billing past due, warehouses suspended), Snowflake's OAuth handler returns "Invalid OAuth access token" — which contains "access token" and so v1's `isIdentityError()` returns true → still falls through to the misleading POV-membership hint. v2 closes this by caching the account-level verdict from `testConnection()` (the service-account path that DOES see "Your free trial has ended..." messages) in `this.lastAccountIssue` and checking that BEFORE running `isIdentityError`. When set, the OAuth path surfaces the real cause ("Snowflake account suspended (observed via health check): ..."). Also softened the v1 hint to acknowledge both possibilities when no account evidence is cached. See `services/snowflake-service/src/snowflake/client.ts` `detectAccountIssue()` helper.
**Cross-layer rule**: services should NOT hardcode strings that describe the calling environment. The Hub already attaches its own `nextSteps` / hints in the call response; let it own that surface.
**Information-flow rule (v2 lesson)**: when one auth path sees a clear error message and another auth path sees a masked version of the same root cause, cache the clear verdict on the client and let downstream paths consult it. The service-account `testConnection` runs periodically via /health and is the cheapest authoritative source for account-level state.

### 13. successRate Inflated by Transport-Layer Counting
**Symptom**: Hub reports `successRate: 99.9%` and `errorCount: 872` on `total: 1333` calls — the math doesn't work.
**Root cause (2026-05-13)**: Two paths feed into `MCPTool.successRate`: (a) health pings (in `service-health-handler.js` — counts `response.ok` only, no body parse), and (b) tool-call interaction tracking (in `hub-utilities.js` `trackServiceInteraction` — was reading `result.success` from the outer wrapper, which is always `true` when transport succeeds). Errors returned as `{ content: [{type:'text', text:'{"success":false,...}'}] }` inside a 200 response were invisible to both paths.
**Fix (both ends)**:
1. **Service side**: set `isError: true` on the MCP response when your tool handler returns an application-level failure (`{success: false, ...}`). MCP spec compliant. See `services/snowflake-service/src/index.ts` (2026-05-13 update).
2. **Hub side**: `trackServiceInteraction` now uses an `isToolError()` helper that checks both `result.isError === true` AND the JSON-encoded text payload. See `lib/mcp/server/tools/hub/hub-utilities.js` (2026-05-13 update).
**For new services**: prefer (1) over (2). The Hub-side parser is a backstop for legacy services that haven't migrated.

---

## Health Probe Contract for Managed/Billable Upstreams

When a service wraps a managed/billable upstream (Snowflake, Sentry, Anthropic, OpenAI, paid weather/finance APIs), the health probe and tool-success accounting need extra care because the failure modes are richer than "network reachable / not reachable":

| Upstream state | What `SELECT 1` shows | What user-facing tool call shows | What health should report |
|---|---|---|---|
| Account active, network OK | 200 healthy | success | `healthy` / HTTP 200 |
| Account suspended (billing) | 200 healthy (metadata layer) | error: "account suspended" | `unhealthy` / HTTP 503 |
| Quota exceeded | 200 healthy | error: "quota exceeded" | `unhealthy` / HTTP 503 |
| Network down | timeout / 5xx | timeout | `unhealthy` / HTTP 503 |
| Credentials revoked | auth error | auth error | `unhealthy` / HTTP 503 |

**Three rules to follow**:

1. **Probe the same path as real tool calls.** If your tools need a warehouse, probe a warehouse-bound query. If they need an LLM completion, probe a 1-token completion. Don't probe the cheapest endpoint just because it's fast.
2. **Map non-healthy state to HTTP 503.** The Hub's HTTP-status check is the cheapest possible signal; don't make it lie. `'degraded'` is rarely useful — collapse it into `'unhealthy'` unless you have a specific reason to expose a third state to the Hub.
3. **Don't conflate transport success with application success.** Tool handlers that return `{success: false, error: ...}` must set `isError: true` on the MCP response so the Hub's interaction tracker records the failure. See gotcha #13.

### 14. Upstream Result Caching Can Mask Compute-Unavailability

**Symptom**: An end-to-end test against a managed-upstream service returns success in hundreds of milliseconds with realistic-looking data, yet `/health` is correctly reporting 503 and the next non-cached query immediately fails with the upstream's billing/quota/suspension error.

**Context (2026-05-13)**: Snowflake caches result sets for 24 hours and serves identical query text without engaging the warehouse. A `SELECT COUNT(*) FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.NATION` we'd run hours earlier returned `C: 25` in 445 ms via the OAuth-user path — fast enough to look like a fresh compute result, but actually served from result cache. The same Snowflake account was suspended for non-payment at the time, and a non-cacheable variant (`WHERE N_NATIONKEY > FLOOR(RANDOM() * 100)`) immediately surfaced the billing error.

The same trap applies in principle to any managed upstream that aggressively caches: BigQuery (60-minute cache for identical queries), OpenAI (no result cache but does cache token-counting), Stripe (idempotency keys), etc.

**Fix shape for verification harnesses**: when validating that a service is *actually* serving compute (not just looking like it), inject non-determinism into the query that forces a fresh evaluation. For Snowflake:

```sql
-- Cacheable (may hit result cache for 24h)
SELECT COUNT(*) FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.NATION;

-- Non-cacheable (RANDOM() forces fresh compute on every run)
SELECT COUNT(*) FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.NATION WHERE N_NATIONKEY > FLOOR(RANDOM() * 100);

-- Also non-cacheable (CURRENT_TIMESTAMP changes per call)
SELECT CURRENT_TIMESTAMP();  -- but doesn't engage warehouse either
```

`CURRENT_TIMESTAMP()` is non-cacheable but doesn't engage compute — it's answered by cloud services, same trap as gotcha #11. The reliable pattern is **non-determinism inside a warehouse-bound query**, which our `SELECT CURRENT_WAREHOUSE()` probe (gotcha #11) handles by checking the session state directly rather than relying on a cacheable result.

**For tool authors**: if your service has a "verify this is working" tool, make the underlying query non-cacheable. A user troubleshooting via your service should see real compute failures, not yesterday's success cached at the upstream.

---

## Port Registry

| Port | Service | Status |
|------|---------|--------|
| 3100 | browser-automation | Production |
| 3101 | notification | Production |
| 3102 | weather | Production |
| 3103 | eia | Production |
| 3104 | eodhd | Production |
| 3105 | test-auth | Production |
| 3106 | snowflake | Production |
| 3107 | (next available) | — |

---

## Security Design: services(action: "call") Does Not Forward Tokens

`services(action: "call")` intentionally does NOT forward `_context.token`. Only `services(action: "workflow.execute")` with `povId` does. This is a **security decision**:

- **Direct calls have no authorization scope** — no `povId` means no trust level context
- **Prevents token harvesting** — a malicious public service can't collect JWTs from every caller
- **Workflow execution has guardrails** — `povId` + OWNER/TEAM_MEMBER trust provides explicit authorization

For services requiring per-user authentication (like Snowflake External OAuth), always use `workflow.execute` with `povId`.

**Full rationale**: `/.claude/knowledge/domain/mcp/TODO-services-call-token-forwarding.md`

---

## Related Resources

- v1 pattern (removed) — SSE-only, January 2026, superseded by this file
- `identity-preserving-token-forwarding-pattern.md` — Token forwarding chain
- `transport-boundary-argument-coercion-pattern.md` — ensureObject utility
- `mcp-hub-external-service-authentication.md` — External service auth guide
- `hub-authentication-context-passing.md` — Token flow documentation
- `TODO-paichart-scope-evaluation.md` — Scope system roadmap
- `TODO-services-call-token-forwarding.md` — Token forwarding for direct calls

---

**Pattern Status**: Production-validated (7 services deployed)
**Last Updated**: March 17, 2026
**Confidence**: 98%
