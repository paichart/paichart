# Local MCP Server Creation Guide

**Version**: 1.0
**Created**: 2026-01-27
**Based on**: weather-service + eia-service (proven pattern)
**Type**: Operational Guide

---

> **📌 See also — canonical deploy/register reference:** `.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md` (current, Mar 2026) is the authoritative pattern for **deploying and registering** a local MCP service. This guide is still the best walkthrough for **building** a new TypeScript server from scratch (API client, tools, testing), but for the deploy + Hub-registration steps, follow the gold standard where they differ.

## 🎯 Purpose

Step-by-step guide for creating **local Docker MCP servers** that integrate with the pAIchart MCP Hub. This pattern has been proven with 4 production services (browser-automation, notification, weather, EIA).

**Success Rate**: 2 services built using this guide, both production-ready in 2.5-5 hours.

---

## 📋 Quick Reference

**What You'll Build**:
- TypeScript MCP server with SSE transport
- Docker containerized (security-hardened)
- Integrated with MCP Hub (automatic approval)
- Grade A quality (full tool schemas)
- Production-ready with CI/CD

**Time Investment**: 2.5-6 hours (varies by API complexity)

**Prerequisites**:
- API provider account + API key
- Basic TypeScript knowledge
- Docker installed locally
- GitHub Actions access (for deployment)

---

## 🏗️ The Proven Pattern

### **Architecture Overview**

```
External API (OpenWeather, EIA, etc.)
    ↓
API Client (TypeScript class with caching)
    ↓
MCP Tools (Zod schemas + handlers)
    ↓
MCP Server (SSE transport)
    ↓
Docker Container (localhost:310X)
    ↓
MCP Hub (service registry + orchestration)
    ↓
AI Agents (ChatGPT, Claude Desktop)
```

**Key Decisions** (proven successful):
- ✅ TypeScript (team familiarity, matches existing services)
- ✅ SSE (`/sse`) or Streamable-HTTP (`/mcp`) transport — both supported; the endpoint suffix selects it
- ✅ MCP SDK 1.25.3 (Anthropic's official SDK — matches all current services)
- ✅ Express for HTTP endpoints
- ✅ Docker multi-stage build (security + efficiency)
- ✅ Smart caching (reduce API costs)

---

## 📊 Work Parcels (11 Phases)

### **Time Budget Allocation**

| Phase | Time | Percentage |
|-------|------|------------|
| 1. Planning & Decision | 30-45 min | 10% |
| 2. Project Setup | 15-30 min | 8% |
| 3. API Client | 1-2 hours | 30% |
| 4. MCP Tools | 1-2 hours | 30% |
| 5. MCP Server | 20-45 min | 10% |
| 6. Docker | 15-30 min | 8% |
| 7. Integration | 15-20 min | 5% |
| 8. CI/CD | 10-15 min | 3% |
| 9. Testing | 30-60 min | 12% |
| 10. Registration | 5-10 min | 2% |
| 11. Documentation | 20-30 min | 7% |
| **Total** | **2.5-6 hrs** | **100%** |

---

## Phase 1: Planning & Decision (30-45 minutes)

### **Checklist**:

**1.1 Identify API Provider**
- [ ] API chosen (e.g., OpenWeatherMap, EIA, USDA, NOAA)
- [ ] Free tier available (or budget approved)
- [ ] API documentation accessible
- [ ] Rate limits understood

**1.2 Define Tools** (3-6 tools recommended)
- [ ] List 3-6 MCP tools to implement
- [ ] Each tool has clear purpose
- [ ] Tools are complementary (not redundant)
- [ ] Parameters identified for each

**Example** (Weather service):
1. `current_weather` - Real-time conditions
2. `forecast` - Multi-day planning
3. `hourly_forecast` - Short-term ops
4. `air_quality` - Environmental data

**1.3 Determine Port Number**
- [ ] Check existing services: `docker ps --filter name=mcp-`
- [ ] Choose next available port (3100, 3101, 3102, 3103, **3104**, ...)
- [ ] Document: Port 310X = your-service-name

**1.4 Technology Decision**
- [ ] Use TypeScript (matches existing services) ✅ Recommended
- [ ] Use a current MCP SDK (1.25.3+; official Anthropic SDK) ✅ Required
- [ ] Choose transport: SSE (`/sse`) OR Streamable-HTTP (`/mcp`) — both supported. Existing first-party services use SSE; most third-party servers (SentinelOne, Cloudflare) use Streamable-HTTP. The endpoint suffix selects it. ✅
- [ ] Copy from weather-service or eia-service template ✅ Recommended

**Decision Matrix**:
```
Existing source code available?
├─ Yes, TypeScript → Adapt (1-2 hours faster)
├─ Yes, Go/Python → Port or rebuild (research tradeoffs)
└─ No → Build from scratch using this guide
```

**Outputs**: Service name, port number, tool list, API key acquired

---

## Phase 2: Project Setup (15-30 minutes)

### **Directory Structure**

```bash
services/YOUR-SERVICE-NAME/
├── src/
│   ├── index.ts                 # MCP server (copy from template)
│   ├── client/
│   │   └── api-client.ts        # API wrapper with caching
│   ├── tools/
│   │   ├── tool-1.ts            # MCP tool implementations
│   │   ├── tool-2.ts
│   │   └── ...
│   ├── health/
│   │   └── check.ts             # Health check logic
│   └── utils/                   # Optional utilities
├── Dockerfile                   # Multi-stage build (copy from template)
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config (copy from template)
├── .env.example                 # Environment template
└── README.md                    # Service documentation
```

### **Commands**:

```bash
# Create structure
mkdir -p services/YOUR-SERVICE-NAME/src/{client,tools,health,utils}

# Copy templates
cp services/weather-service/package.json services/YOUR-SERVICE-NAME/
cp services/weather-service/tsconfig.json services/YOUR-SERVICE-NAME/
cp services/weather-service/Dockerfile services/YOUR-SERVICE-NAME/

# Edit package.json
# - Change name to @paichart/YOUR-SERVICE-NAME
# - Update description
# - Add API client dependencies (axios, specific SDKs, etc.)

# Install dependencies
cd services/YOUR-SERVICE-NAME
npm install
```

### **package.json Template**:

```json
{
  "name": "@paichart/YOUR-SERVICE-NAME",
  "version": "1.0.0",
  "description": "MCP [Your Service] - [Brief description]",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.25.3",
    "express": "^4.18.2",
    "axios": "^1.6.0",      // or node-fetch, got, etc.
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### **.env.example Template**:

```bash
# [Your Service] Configuration

# Required: [API Provider] API Key
YOUR_API_KEY=your_key_here

# Service Configuration
YOUR_SERVICE_PORT=310X
NODE_ENV=development

# API Configuration (if applicable)
API_TIMEOUT=30000
MAX_RETRIES=3

# Cache Configuration
CACHE_TTL=600000  # 10 minutes default
```

**Outputs**: Project structure, dependencies installed, TypeScript configured

---

## Phase 3: API Client Implementation (1-2 hours)

### **The Texas Test Approach** 🤠

**Critical Strategy**: Test with a **rich, diverse dataset** first (we used Texas for EIA, Sydney for weather).

**Why it works**:
- Reveals data structure issues quickly
- Shows all edge cases (diverse fuel types, weather conditions)
- Establishes baseline for all other queries
- Makes debugging obvious (big numbers, clear patterns)

**For your service**: Pick the most complex/complete test case first!

---

### **API Client Template**

**File**: `src/client/api-client.ts`

```typescript
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';

const API_KEY = process.env.YOUR_API_KEY;
const API_BASE_URL = 'https://api.provider.com/v1';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT || '30000');
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '600000'); // 10 min default

// Response validation schema
const APIResponseSchema = z.object({
  data: z.any(),
  // Add your API's response structure
});

export class APIClient {
  private client: AxiosInstance;
  private cache = new Map<string, { data: any; expiry: number }>();

  constructor() {
    if (!API_KEY) {
      throw new Error('YOUR_API_KEY environment variable is required');
    }

    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,  // or X-API-Key, etc.
      },
    });
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    retries = MAX_RETRIES
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;

      const isRetryable = this.isRetryableError(error);
      if (!isRetryable) throw error;

      const delay = 1000 * (2 ** (MAX_RETRIES - retries)); // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));

      return this.retryRequest(fn, retries - 1);
    }
  }

  private isRetryableError(error: any): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    // Retry on 5xx errors and 429 (rate limit)
    return status ? status >= 500 || status === 429 : false;
  }

  /**
   * Generic request with caching
   */
  private async request<T>(
    endpoint: string,
    params: Record<string, any>,
    cacheKey: string,
    cacheTTL: number = CACHE_TTL
  ): Promise<T> {
    // Check cache
    const cached = this.getFromCache<T>(cacheKey);
    if (cached) return cached;

    // Make request with retry
    const response = await this.retryRequest(async () => {
      return await this.client.get(endpoint, { params });
    });

    // Validate response (optional but recommended)
    const validated = APIResponseSchema.parse(response.data);

    // Cache result
    this.setCache(cacheKey, validated, cacheTTL);

    return validated as T;
  }

  /**
   * Your API methods here
   */
  async getYourData(param: string): Promise<YourDataType> {
    const cacheKey = `your-data:${param}`;

    const data = await this.request<any>(
      '/your-endpoint',
      { param },
      cacheKey,
      CACHE_TTL
    );

    return this.transformYourData(data);
  }

  // Transformation helpers
  private transformYourData(data: any): YourDataType {
    // Transform API response to your interface
    return {
      // ... your transformation logic
    };
  }

  // Cache utilities
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    return cached.data as T;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const apiClient = new APIClient();
```

### **Key Learnings**:

**From Weather Service**:
- ✅ 10-minute cache TTL works great (80% hit rate)
- ✅ Geocoding should cache 24 hours (coordinates don't change!)
- ✅ Simple in-memory Map is sufficient (no need for Redis)

**From EIA Service**:
- ✅ **Variable cache TTL by data type** (1h-7d)
- ✅ Historical data: 24 hours (static)
- ✅ Current data: 1 hour (more dynamic)
- ✅ Metadata: 7 days (rarely changes)
- ⚠️ **Check API response field names** (fueltypeid, not fuelTypeId)
- ⚠️ **Check units** (thousand MWh vs MWh - multiply by 1000!)
- ⚠️ **Check facet names** (location vs stateid vs stateID - capital ID!)

**Outputs**: Working API client with retry logic and caching

---

## Phase 4: MCP Tools Implementation (1-2 hours)

### **Tool Template**

**File**: `src/tools/your-tool.ts`

```typescript
import { z } from 'zod';
import { apiClient } from '../client/api-client.js';

// Zod schema for parameters
export const yourToolSchema = z.object({
  param1: z.string()
    .describe('Clear description of parameter (shown to AI agents)'),
  param2: z.number().min(1).max(10).optional().default(5)
    .describe('Optional parameter with constraints'),
  units: z.enum(['metric', 'imperial']).optional().default('metric')
    .describe('Unit system')
});

// Tool handler
export async function yourTool(args: z.infer<typeof yourToolSchema>) {
  try {
    const data = await apiClient.getYourData(args.param1);

    return {
      success: true,
      data,
      message: `Your data for ${args.param1}`,
      summary: {
        // Key metrics for quick view
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### **Tool Design Best Practices**:

**1. Keep tools focused** (do one thing well):
```
✅ Good: get_current_weather(location)
❌ Bad: get_all_weather_data(location, forecast, hourly, alerts)
```

**2. Use descriptive parameters**:
```typescript
// ✅ Good - Clear, constrained
location: z.string().describe('City name, country code (e.g., "London,UK")')
days: z.number().min(1).max(5).default(5).describe('Forecast days (1-5)')

// ❌ Bad - Vague, unconstrained
location: z.string()
days: z.number()
```

**3. Return consistent structure**:
```typescript
{
  success: boolean,        // Always include
  data: any,              // Main payload
  message: string,        // Human-readable summary
  summary?: object,       // Key metrics (optional)
  error?: string          // If success: false
}
```

**4. Number of tools** (sweet spot: 4-6):
- 3 tools: Minimal (might be too simple)
- 4-6 tools: Optimal (comprehensive without overwhelming)
- 7-10 tools: Advanced (only if API is very rich)

**Outputs**: 3-6 MCP tools with Zod schemas and handlers

---

## Phase 5: MCP Server Setup (20-45 minutes)

### **Copy Template** (Fastest approach):

```bash
# Copy entire index.ts from weather-service or eia-service
cp services/weather-service/src/index.ts services/YOUR-SERVICE/src/

# Then adapt:
# 1. Change port (3102 → 310X)
# 2. Change service name ("weather-service" → "your-service")
# 3. Import your tools
# 4. Register your tools in tools object
# 5. Update health check
```

### **Critical Sections** (what to customize):

**1. Port and Service Name** (lines 1-20):
```typescript
const PORT = parseInt(process.env.YOUR_SERVICE_PORT || '310X');

const mcpServer = new Server(
  { name: 'your-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);
```

**2. Tool Registry** (lines 20-60):
```typescript
const tools = {
  your_tool_1: {
    name: 'your_tool_1',
    description: 'What this tool does',
    inputSchema: yourTool1Schema,
    handler: yourTool1,
  },
  your_tool_2: {
    name: 'your_tool_2',
    description: 'What this tool does',
    inputSchema: yourTool2Schema,
    handler: yourTool2,
  },
  // ... add all your tools
};
```

**3. SSE Transport** (lines 140-200):
```typescript
// ✅ DON'T CHANGE - This pattern works perfectly
// Just copy/paste from template
app.get('/sse', async (req, res) => { ... });
app.post('/message', async (req, res) => { ... });
```

**4. Health Check** (lines 200-220):
```typescript
app.get('/health', async (_req, res) => {
  const stats = apiClient.getCacheStats();
  res.json({
    status: 'healthy',
    service: 'your-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    cache: {
      size: stats.size,
      enabled: true,
      ttl: 'your TTL strategy'
    },
    apiKey: !!process.env.YOUR_API_KEY ? 'configured' : 'missing',
    mcpConnections: activeTransports.size,
  });
});
```

**Outputs**: Working MCP server, compiles successfully, runs locally

---

## Phase 6: Docker Configuration (15-30 minutes)

### **Dockerfile** (Copy & Adapt):

```bash
# Copy from weather-service (it's perfect)
cp services/weather-service/Dockerfile services/YOUR-SERVICE/

# Then adapt (sed commands):
sed -i 's/WEATHER_SERVICE_PORT/YOUR_SERVICE_PORT/g' services/YOUR-SERVICE/Dockerfile
sed -i 's/3102/310X/g' services/YOUR-SERVICE/Dockerfile
```

**The multi-stage build is proven - don't change it!**

### **docker-compose.yml** (Add your service):

```yaml
  your-service:
    container_name: mcp-your-service
    build:
      context: ./services/YOUR-SERVICE-NAME
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "127.0.0.1:310X:310X"  # Localhost only - internal service
    environment:
      - NODE_ENV=production
      - YOUR_SERVICE_PORT=310X
      # Your API credentials
      - YOUR_API_KEY=${YOUR_API_KEY}
      - API_TIMEOUT=30000
      - MAX_RETRIES=3
    deploy:
      resources:
        limits:
          cpus: '0.5'      # Adjust based on needs
          memory: 256M     # Adjust based on needs
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
      test: ["CMD", "curl", "-f", "http://localhost:310X/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    # Security options (DON'T CHANGE - proven secure)
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

**Also update** docker-compose.yml header comments:
```yaml
# Health checks:
#   curl http://localhost:310X/health       # Your service
```

**Outputs**: Docker image builds, container runs, health check passes

---

## Phase 7: Integration (15-20 minutes)

### **7.1 Update service-call-policy.js — SSRF-exempt (REQUIRED for every local service)**

A localhost endpoint is SSRF-blocked at call time unless the service name/id is in **`SSRF_EXEMPT_SERVICES`** (`lib/mcp/server/config/service-call-policy.js`; `TRUSTED_INTERNAL_SERVICES` in *that* file is a backward-compat alias of the same list). This is what actually lets the Hub reach `http://localhost:310X`:
```javascript
const SSRF_EXEMPT_SERVICES = [
  'browser-automation-service',
  'notification-service',
  'weather-service',
  'eia-service',
  'your-service-name',  // ADD THIS
];
```

**Add each tool name to APPROVED_TOOLS** (belt-and-suspenders — tools declared in your seed script's `capabilities.tools` are also accepted dynamically):
```javascript
// Your Service (internal Docker service)
'your_tool_1', 'your_tool_2', 'your_tool_3',
```

### **7.2 Update service-approval-policy.js — TRUSTED (ONLY if the service should receive the caller's JWT)**

`TRUSTED_INTERNAL_SERVICES` in `service-approval-policy.js` is a **separate, different-purpose list**: it controls **first-party JWT forwarding**, NOT localhost access.
- ✅ Add your service here **only** if it consumes pAIchart's JWT as an identity assertion (validates our JWKS, maps the `email` claim) — e.g. weather/eia.
- ❌ Do **NOT** add it if the container holds its **own** upstream credential (API key / vendor token) and doesn't consume pAIchart JWTs — e.g. Snowflake, and any third-party server like SentinelOne. Adding it there over-shares every caller's JWT with that vendor.

```javascript
const TRUSTED_INTERNAL_SERVICES = [
  'browser-automation-service',
  'notification-service',
  'weather-service',
  'eia-service',
  // 'your-service-name',  // ADD ONLY IF it consumes pAIchart's JWT (see above)
];
```

**Two lists, two concerns** (don't conflate them):
- `service-call-policy.js` → **`SSRF_EXEMPT_SERVICES`** = *can the Hub reach this localhost address?* (required for ALL local services)
- `service-approval-policy.js` → **`TRUSTED_INTERNAL_SERVICES`** = *should the Hub forward the caller's JWT to it?* (only for JWT-consuming services)

⚠️ Both files load at process start — after editing, `pm2 restart paichart-mcp` (avoid restarting during an in-flight pipeline run).

### **7.3 Add API Key to Environment**

**Root .env file** (for local development):
```bash
# Add to /home/steve/copov15/.env
YOUR_API_KEY=your_actual_key_here
```

**⚠️ IMPORTANT**: Never commit .env to git! It's in .gitignore.

**Outputs**: Service whitelisted, API key configured locally

---

## Phase 8: CI/CD Configuration (10-15 minutes)

### **Update GitHub Actions Workflow**

**File**: `.github/workflows/docker-services-deploy.yml`

**8.1 Add to workflow dispatch options** (line ~11):
```yaml
options:
  - all
  - browser-automation
  - notification
  - weather
  - eia
  - your-service  # ADD THIS
```

**8.2 Add to push trigger paths** (line ~20):
```yaml
paths:
  - 'services/browser-automation-service/**'
  - 'services/notification-service/**'
  - 'services/weather-service/**'
  - 'services/eia-service/**'
  - 'services/YOUR-SERVICE-NAME/**'  # ADD THIS
  - 'docker-compose.yml'
```

**8.3 Add to service matrix** (line ~37):
```yaml
matrix:
  service:
    - name: browser-automation
      context: ./services/browser-automation-service
      port: 3100
    - name: notification
      context: ./services/notification-service
      port: 3101
    - name: weather
      context: ./services/weather-service
      port: 3102
    - name: eia
      context: ./services/eia-service
      port: 3103
    - name: your-service  # ADD THIS
      context: ./services/YOUR-SERVICE-NAME
      port: 310X
```

**8.4 Add environment variables** (line ~135):
```yaml
# Your Service
YOUR_SERVICE_PORT=310X
YOUR_API_KEY=${{ secrets.YOUR_API_KEY }}
API_TIMEOUT=30000
MAX_RETRIES=3
```

**8.5 Add to container cleanup** (line ~153):
```bash
docker rm -f mcp-browser-automation mcp-notification mcp-weather mcp-eia mcp-your-service 2>/dev/null || true
```

### **8.6 Add GitHub Secret**

**Go to**: `https://github.com/YOUR-ORG/YOUR-REPO/settings/secrets/actions`

**Add secret**:
- Name: `YOUR_API_KEY`
- Value: Your actual API key

**Outputs**: CI/CD pipeline configured, ready to deploy

---

## Phase 9: Testing (30-60 minutes)

### **The 3-Tier Testing Strategy**

#### **Tier 1: Local Testing** (15 minutes)

```bash
# 1. Build
cd services/YOUR-SERVICE
npm run build

# 2. Start service locally
YOUR_API_KEY=your_key node dist/index.js

# 3. Test health endpoint
curl -s http://localhost:310X/health | jq

# Expected:
{
  "status": "healthy",
  "apiKey": "configured",
  "mcpConnections": 0
}

# 4. Test tools endpoint
curl -s http://localhost:310X/tools | jq '.tools[] | {name, description}'

# Expected: All your tools listed
```

**The Texas Test** (or equivalent):
```bash
# Test with the richest/most complex dataset
# For weather: Sydney (different hemisphere, diverse weather)
# For EIA: Texas (largest generator, diverse fuel mix)
# For your service: Pick the most complete test case
```

---

#### **Tier 2: Docker Testing** (10 minutes)

```bash
# 1. Build Docker image
docker compose build your-service

# 2. Start container
docker compose up -d your-service

# 3. Check health
docker logs mcp-your-service --tail 10
curl -s http://localhost:310X/health | jq

# 4. Check container status
docker ps --filter "name=mcp-your-service"

# Expected: Container running, healthy status
```

---

#### **Tier 3: Production Testing** (After deployment - 15 minutes)

```bash
# 1. Verify deployment
ssh <PROD_USER>@<PROD_HOST> "docker ps --filter name=mcp-your-service"

# 2. Check health on production
ssh <PROD_USER>@<PROD_HOST> "curl -s http://localhost:310X/health | jq"

# 3. Check logs
ssh <PROD_USER>@<PROD_HOST> "docker logs mcp-your-service --tail 20"

# 4. Test via MCP Hub (after registration)
# Connect with /mcp command, then:
services(action: "call")({
  targetService: "your-service",
  tool: "your_tool_1",
  arguments: { param: "test_value" }
})
```

### **Common Issues & Solutions**:

| Issue | Cause | Solution |
|-------|-------|----------|
| "API key missing" | ENV not loaded | Check .env file, restart service |
| "404 Not Found" | Wrong endpoint path | Check API documentation |
| "400 Bad Request" | Wrong parameter names | Inspect raw API response |
| All data shows as "other" | Field name mismatch | Check API response field names |
| Wrong units (0.17 vs 81.67) | Missing unit conversion | Check API docs for units field |
| Utilization >100% | Time period mismatch | Match periods, convert MW→MWh |

**Outputs**: All tools tested and working, issues resolved

---

## Phase 10: MCP Hub Registration (5-10 minutes)

> **⚠️ Register with a SEED SCRIPT, not the `registry` tool.** As of the 2026-05 SSRF hardening, `registry(action:"register")` runs `assertEndpointSafe()` → `validateUrlSafety()` (`lib/mcp/server/tools/hub/service-registration-handler.js:271`) and **rejects private/loopback endpoints** like `http://localhost:310X/...` (`Endpoint register blocked: Blocked private IPv4`). Local Docker services MUST be registered by a seed script (`scripts/seed-<name>-service.ts`) that writes the row via `prisma.mCPTool` directly — copy `scripts/seed-eodhd-service.ts`, use the `findFirst` + update/create pattern (never a canonical-id upsert), set the endpoint suffix to match your transport (`/sse` → SSE, `/mcp` → Streamable-HTTP), then run `npx ts-node scripts/seed-<name>-service.ts` on the box.

> **Wrapping a third-party server instead of building your own?** This guide assumes you author the tools (so you write the `inputSchema`s directly — they're authoritative). If instead you're **wrapping** an existing third-party MCP server (proxy/bridge/wrapper), do **not** hand-transcribe its schemas from docs — pull the **real** ones from the live server and re-seed. See the gold-standard pattern **Step 10b** (`scripts/pull-mcp-schemas.py`).

### **10.1 Registration payload shape**

**Grade A registration** — the fields your seed script sets (same shape a `registry(action:"register")` call would take, but written directly to the DB to bypass the localhost SSRF gate):

```javascript
registry(action: "register")({
  name: "your-service",
  description: "[Brief description of what service does]

WHEN TO USE:
✅ [Use case 1]
✅ [Use case 2]
✅ [Use case 3]

FEATURES:
- [Feature 1]
- [Feature 2]
- [Feature 3]",
  endpoint: "http://localhost:310X/sse",
  category: "data-services",  // or automation, communication, etc.
  version: "1.0.0",
  authType: "NONE",
  capabilities: {
    tools: [
      {
        name: "your_tool_1",
        description: "What this tool does",
        inputSchema: {
          type: "object",
          properties: {
            param1: {
              type: "string",
              description: "Parameter description"
            }
          },
          required: ["param1"]
        }
      }
      // ... all your tools with full schemas
    ]
  }
})
```

**⚠️ Critical for Grade A**:
- All tools MUST have inputSchema
- All parameters MUST have descriptions
- Use enums for fixed choices
- Add min/max for numbers
- Specify required fields

### **10.2 Make Public**

```javascript
registry(action: "update")({
  service_name: "your-service",
  updates: {
    status: "ACTIVE",
    permissions: { publicAccess: true }
  }
})
```

**Approval status**: a seed script writes the row directly and sets `status` itself (`ACTIVE`) — it does not run the approval evaluator, so there is no `PENDING_APPROVAL` step for seeded local services.

**Outputs**: Service registered, activated, public, Grade A quality

---

## Phase 11: Documentation (20-30 minutes)

### **Files to Create**:

**1. README.md** (service documentation):
```markdown
# [Your Service] - MCP Server

[Brief description]

## Features
- ✅ [Feature 1]
- ✅ [Feature 2]

## API Provider
[Provider name]: [Brief description]
- [Rate limits]
- [Coverage]

## Installation
npm install

## Configuration
[API key setup]

## Tools
### tool_1
[Description + example]

### tool_2
[Description + example]

## Cache Strategy
[Your TTL strategy]

## Integration with MCP Hub
[How it connects]

## Security
[Security features]

## Performance
[Expected metrics]
```

**2. Implementation Plan** (optional):
- Copy `eia-service-implementation-plan.md` structure
- Adapt for your service
- Useful for future reference

**3. Testing Plan** (optional):
- Copy `eia-service-testing-plan.md` structure
- Define test cases for each tool
- Document expected results

**Outputs**: Service documented, easy for others to understand

---

## 🎓 Key Learnings from 2 Services

### **What Works (Copy These Exactly)**:

**1. SSE Transport Pattern** ⭐⭐⭐⭐⭐
- Weather service: Copied from browser-automation
- EIA service: Copied from weather service
- **Result**: Zero SSE debugging needed
- **Lesson**: Don't reinvent SSE - copy the proven pattern

**2. Directory Structure** ⭐⭐⭐⭐⭐
```
src/
  index.ts        # MCP server
  client/         # API integration
  tools/          # Tool implementations
  health/         # Health check
  utils/          # Helpers (optional)
```
- **Result**: Clear organization, easy to navigate
- **Lesson**: Consistency across services helps team

**3. Smart Caching** ⭐⭐⭐⭐⭐
- Weather: 10-min fixed TTL (80% hit rate)
- EIA: Variable TTL 1h-7d (80% hit rate)
- **Result**: Stay in free tier, fast responses
- **Lesson**: Cache aggressively, API calls are expensive

**4. Dockerfile Multi-Stage Build** ⭐⭐⭐⭐⭐
- Builder stage: Has dev dependencies, builds TypeScript
- Production stage: Only runtime dependencies, minimal image
- **Result**: 400MB images (could be 2GB without multi-stage)
- **Lesson**: Copy the Dockerfile exactly, just change port

**5. The Texas Test Approach** ⭐⭐⭐⭐⭐
- Test with richest/most complex dataset first
- Reveals all issues quickly
- Establishes baseline
- **Lesson**: Don't test with simple case first!

---

### **What to Watch For (Common Pitfalls)**:

**1. API Field Names Vary** ⚠️⚠️⚠️
```
EIA Examples:
- location vs stateid vs stateID (capital ID!)
- sector vs sectorid
- fueltypeid vs energy_source_code
```
**Solution**: Inspect raw API response early, don't assume field names

**2. Units Conversion** ⚠️⚠️⚠️
```
EIA: "generation-units": "thousand megawatthours" (not MWh!)
→ Need to multiply by 1000
```
**Solution**: Always check response for `-units` fields

**3. Aggregated Data Duplication** ⚠️⚠️
```
EIA: 5 sectors × 30 fuel types = 150 records for same state
→ Need to filter to avoid 5x over-counting
```
**Solution**: Understand data granularity, filter aggregates appropriately

**4. Docker Layer Caching** ⚠️⚠️
```
Code changes don't apply → Docker cached old source
```
**Solution**: Use `--no-cache` flag when debugging code changes

**5. Environment File Management** ⚠️⚠️
```
.env.docker missing on production → API key not loaded
```
**Solution**: GitHub Actions creates it, or manually create for testing

---

## 🚀 Deployment Workflow

### **Complete Deployment Checklist**:

**Before Pushing**:
- [ ] All tools tested locally (curl + manual testing)
- [ ] Docker build successful locally
- [ ] Health endpoint returns 200
- [ ] API key works (not "missing" in health check)
- [ ] TypeScript compiles with no errors
- [ ] README.md created

**GitHub Secret**:
- [ ] API key added to GitHub Secrets
- [ ] Secret name matches workflow (YOUR_API_KEY)

**Commit & Push**:
```bash
git add services/YOUR-SERVICE-NAME/ \
  docker-compose.yml \
  lib/mcp/server/config/service-call-policy.js \
  lib/mcp/server/config/service-approval-policy.js \
  .github/workflows/docker-services-deploy.yml

git commit -m "feat(services): Add [Your Service] MCP server

- Implemented X MCP tools
- [API Provider] integration with caching
- Docker containerization (port 310X)
- Updated service policies (SSRF-exempt; trusted only if JWT-consuming)
- Grade A quality schemas"

git push origin main
```

**Monitor Deployment**:
- [ ] Watch GitHub Actions (both workflows should run)
- [ ] Production Deploy completes first (~5-8 min)
- [ ] Docker Services Deploy completes second (~5-10 min)
- [ ] Both show green checkmarks

**Verify Production**:
```bash
ssh <PROD_USER>@<PROD_HOST> "docker ps --filter name=mcp-your-service"
ssh <PROD_USER>@<PROD_HOST> "curl -s http://localhost:310X/health | jq"
```

**Register with MCP Hub** (seed script — the `registry` tool rejects localhost endpoints):
```bash
# On the box, after the container is healthy:
cd /var/www/paichart-app/current && npx ts-node scripts/seed-your-service.ts
# The script sets status: "ACTIVE" and permissions.publicAccess: true directly.
```

**Test End-to-End**:
```javascript
services(action: "call")({
  targetService: "your-service",
  tool: "your_tool_1",
  arguments: { param: "test" }
})
```

---

## 📊 Success Metrics

### **Quality Checklist**:

**Service Quality**:
- [ ] All tools execute successfully
- [ ] Data quality validated (realistic values)
- [ ] Error handling works (graceful failures)
- [ ] Cache hit rate >70%
- [ ] Response times acceptable (<15s)

**Integration Quality**:
- [ ] Grade A rating (full schemas)
- [ ] Public access enabled
- [ ] Discoverable via services(action: "discover")
- [ ] Health check passes
- [ ] Auto-approved (TRUSTED_INTERNAL_SERVICES)

**Production Quality**:
- [ ] Container running healthy
- [ ] Logs show no errors
- [ ] API key configured
- [ ] Health checks passing every 30s
- [ ] Auto-restart on failure

**Documentation Quality**:
- [ ] README.md explains all tools
- [ ] Environment variables documented
- [ ] Example usage provided
- [ ] Integration guide included

---

## 🎯 Time Estimates by Service Type

### **Simple API Service** (e.g., weather):
- **Complexity**: Low (straightforward REST API)
- **Tools**: 3-4 simple tools
- **API Quirks**: Minimal
- **Time**: **2.5-3 hours**

**Example**: Weather, currency exchange, stock quotes

---

### **Medium API Service** (e.g., EIA):
- **Complexity**: Medium (complex data structure, multiple endpoints)
- **Tools**: 4-6 tools, some complex
- **API Quirks**: Moderate (facet names, units, aggregation)
- **Time**: **4-6 hours** (includes debugging)

**Example**: Government data APIs, financial data, scientific data

---

### **Complex API Service**:
- **Complexity**: High (OAuth, webhooks, stateful operations)
- **Tools**: 6-10 tools, complex logic
- **API Quirks**: High (authentication flows, rate limits, pagination)
- **Time**: **8-12 hours**

**Example**: CRM integrations, payment processors, social media APIs

---

## 🔧 Quick Start Checklist

**Use this for your next service**:

```
□ API chosen, key acquired
□ 3-6 tools defined
□ Port selected (310X)
□ Project structure created (copy template)
□ package.json configured, dependencies installed
□ API client implemented with retry + caching
□ MCP tools implemented with Zod schemas
□ MCP server configured (copy from template)
□ Dockerfile adapted
□ docker-compose.yml updated
□ service-call-policy.js updated (2 places)
□ service-approval-policy.js updated
□ GitHub Actions workflow updated (5 places)
□ GitHub Secret added
□ Local testing complete (The Texas Test!)
□ Docker testing complete
□ Git committed and pushed
□ Production deployment verified
□ MCP Hub registration (Grade A)
□ Public access enabled
□ End-to-end testing complete
□ README.md created
```

**Total**: 24 checkboxes to production! 🎯

---

## 📚 Templates & References

### **Copy These Files**:

**Fastest path to success**:
1. Copy `services/weather-service/` → rename to your service
2. Update package.json (name, description, dependencies)
3. Replace API client implementation
4. Replace tool implementations
5. Update port numbers throughout
6. Test and deploy

**Key files to copy**:
- `src/index.ts` - MCP server (95% reusable)
- `Dockerfile` - Multi-stage build (98% reusable)
- `tsconfig.json` - TypeScript config (100% reusable)
- `package.json` - Structure (adapt dependencies)

### **Reference Documentation**:

**Previous Services**:
- `cline_docs/weather-service-implementation-guide.md` - Complete walkthrough
- `cline_docs/eia-service-implementation-plan.md` - Complex service example
- `cline_docs/eia-service-testing-plan.md` - Testing methodology

**Integration Docs**:
- `.claude/knowledge/domain/mcp/mcp-hub-service-registration-reference.md` - Registration guide
- `cline_docs/github-actions-secret-setup-guide.md` - CI/CD secrets

**Debugging**:
- `cline_docs/EIA-MCP-Integration-Journey.md` - 7 iterations to perfection (learn from our mistakes!)

---

## 🎯 Service-Specific Adaptations

### **For External APIs** (like OpenWeather):

**Focus**: Simple, stable API integration

**Key Considerations**:
- Authentication method (API key, OAuth, etc.)
- Rate limits and caching strategy
- Response structure consistency
- Error handling patterns

**Example**: weather-service (OpenWeatherMap)
- Simple API key authentication
- Generous free tier (1M calls/month)
- Consistent response structure
- 10-min caching = 80% hit rate

---

### **For Government APIs** (like EIA):

**Focus**: Complex data structures, multiple endpoints

**Key Considerations**:
- **Facet name variations** across endpoints (test thoroughly!)
- **Units inconsistency** (check `-units` fields)
- **Aggregation levels** (sector, fuel type, region)
- **Data granularity** (avoid duplication)

**Example**: eia-service (U.S. EIA)
- 6 tools (complex multi-state analysis)
- Variable cache TTL (1h-7d by data type)
- 7 debugging iterations (facets, units, aggregation)
- "Texas Test" revealed all issues quickly

---

### **For Real-Time APIs** (like market data):

**Focus**: Low latency, frequent updates

**Key Considerations**:
- Short cache TTL (1-5 minutes)
- WebSocket support (optional)
- High availability requirements
- Cost management (API calls expensive)

**Example**: Alpha Vantage (not our implementation, but integrated)
- Serverless deployment
- Wrapper pattern (TOOL_CALL meta-tool)
- Streamable HTTP transport

---

## 💡 Pro Tips

### **Tip 1: Copy Don't Create**

**Fastest path**:
```bash
# Start with weather-service template
cp -r services/weather-service services/your-service

# Global search/replace
find services/your-service -type f -exec sed -i 's/weather-service/your-service/g' {} \;
find services/your-service -type f -exec sed -i 's/WEATHER_SERVICE/YOUR_SERVICE/g' {} \;
find services/your-service -type f -exec sed -i 's/3102/310X/g' {} \;

# Then customize API client and tools
```

**Time saved**: 1-2 hours vs building from scratch

---

### **Tip 2: Test Incrementally**

**Don't wait until everything is done**:

```
Hour 1: API client only
→ Test with curl/Postman
→ Verify authentication works
→ Check response structure

Hour 2: First tool only
→ Test with local MCP server
→ Verify parameter validation
→ Check data transformation

Hour 3: All tools
→ Test each individually
→ Verify no conflicts

Hour 4: Docker + Production
→ Only after local testing passes
```

**Why**: Finding bugs early is 10x faster than debugging production

---

### **Tip 3: The Texas Test Strategy**

**For each service type, pick the "Texas"**:

| Service Type | "Texas" Equivalent | Why |
|--------------|-------------------|-----|
| Weather | Sydney, Australia | Different hemisphere, diverse weather |
| Energy | Texas, USA | Largest generator, diverse fuel mix |
| Stock data | S&P 500 | Most complete data, high volume |
| Agriculture | Iowa, USA | Corn/soy capital, rich dataset |
| Transportation | New York City | Complex routes, high density |

**The pattern**: Pick the **most complex, data-rich** test case first!

---

### **Tip 4: Cache Everything**

**Caching Strategy Decision Tree**:

```
Is data real-time (changes <1 min)?
├─ Yes → Cache 1-5 minutes
└─ No ↓

Is data current (changes hourly)?
├─ Yes → Cache 10-60 minutes
└─ No ↓

Is data daily/weekly updates?
├─ Yes → Cache 1-6 hours
└─ No ↓

Is data historical/static?
└─ Yes → Cache 24 hours - 7 days
```

**Examples**:
- Stock prices: 1-5 min (real-time)
- Weather forecast: 10-60 min (updated hourly)
- Energy generation: 1-6 hours (daily updates)
- Historical data: 24 hours (static)
- Metadata: 7 days (rarely changes)

**Impact**: Weather service with 10-min cache stays in free tier with 100+ users

---

## 🔍 Debugging Workflow

### **When Things Don't Work**:

**1. Check Service Logs**:
```bash
docker logs mcp-your-service --tail 50
```

**2. Test API Directly**:
```bash
curl -s "https://api.provider.com/endpoint?param=value" \
  -H "Authorization: Bearer YOUR_KEY" | jq
```

**3. Inspect Raw Response**:
```bash
# Add to your tool temporarily:
console.log('Raw API response:', JSON.stringify(data, null, 2));
```

**4. Check Field Names**:
```bash
# Get first record keys
curl ... | jq '.response.data[0] | keys'
```

**5. Verify Facets/Parameters**:
```bash
# Check API metadata
curl ... | jq '.facets[] | {id, description}'
```

### **The 7-Iteration Journey** (EIA Service):

Learn from our debugging iterations:
1. ❌ All fuel types show "other: 100%" → Wrong field name (`fueltypeid`)
2. ❌ Total 0.17 TWh (should be 81 TWh) → Missing units conversion (×1000)
3. ❌ Utilization 2008% → Wrong units (MWh/MW without time)
4. ❌ Utilization 0.5% → Wrong time period (15 months vs 3 months)
5. ❌ State profile 404 → Wrong facet name (stateID with capital I!)
6. ❌ Capacity 400 → Wrong facet name (sector vs sectorid)
7. ✅ Sector value "electric-utility" (not "1") → WORKS!

**Lesson**: Each iteration revealed deeper API understanding. Be patient, iterate systematically.

---

## ✅ Production Readiness Criteria

**Before calling it "done"**:

### **Functional Requirements**:
- [ ] All tools execute without errors
- [ ] Data quality validated (realistic values match known patterns)
- [ ] Error messages are helpful (not generic "error occurred")
- [ ] Edge cases handled (missing data, invalid inputs)

### **Performance Requirements**:
- [ ] Response times <15 seconds (most tools)
- [ ] Cache hit rate >70%
- [ ] Memory usage stable (<256MB typical)
- [ ] No memory leaks (run for 24h, memory stays flat)

### **Security Requirements**:
- [ ] API keys in environment variables (not hardcoded)
- [ ] Container runs as non-root user
- [ ] Read-only filesystem
- [ ] Localhost-only binding (127.0.0.1:310X)
- [ ] Resource limits set (CPU, memory)

### **Integration Requirements**:
- [ ] Added to TRUSTED_INTERNAL_SERVICES (both policies)
- [ ] All tools in APPROVED_TOOLS
- [ ] Grade A quality (full schemas)
- [ ] Public access enabled
- [ ] Auto-approved (no pending status)

### **Operational Requirements**:
- [ ] Health checks passing
- [ ] Auto-restart on failure
- [ ] Logs accessible (docker logs)
- [ ] Monitoring enabled (health endpoint)
- [ ] Documented (README + guides)

---

## 📈 Success Stories

### **Weather Service** (2.5 hours):
- Tools: 4/4 working
- Quality: Grade A
- Cache: 80% hit rate
- Result: Production-perfect on first try

### **EIA Service** (5 hours with debugging):
- Tools: 6/6 working
- Quality: Grade A
- Cache: 80% hit rate (variable TTL)
- Result: Perfect data after 7 iterations

**Common Pattern**: Both achieved production quality through systematic iteration

---

## 🎁 What You Get

**After following this guide**:
- ✅ Production-ready MCP server (Docker containerized)
- ✅ Integrated with MCP Hub (discoverable, callable)
- ✅ Grade A quality (full tool schemas)
- ✅ Auto-approved (TRUSTED_INTERNAL_SERVICES)
- ✅ CI/CD enabled (automatic deployment)
- ✅ Documented (README + guides)
- ✅ Tested (3-tier testing complete)

**And you'll contribute to**:
- 🌟 Growing MCP ecosystem
- 🌟 Cross-service intelligence capabilities
- 🌟 Commodities intelligence stack vision
- 🌟 Operational excellence for businesses

---

## 📞 Getting Help

**If you get stuck**:

**1. Check existing services**:
- Compare your code to weather-service or eia-service
- Look for differences in implementation
- Copy proven patterns exactly

**2. Review debug logs**:
- `docker logs mcp-your-service`
- Check for API errors, validation errors, connection issues

**3. Test API directly**:
- Use curl to verify API works outside MCP
- Inspect raw responses
- Confirm field names and structure

**4. Reference documentation**:
- This guide (comprehensive workflow)
- EIA-MCP-Integration-Journey.md (debugging journey)
- Implementation plans (detailed examples)

**5. Common issues**:
- API key not loading → Check .env.docker creation
- Docker cache → Use --no-cache flag
- Wrong field names → Inspect raw API response
- Units conversion → Check response `-units` fields

---

## 🚀 Next Services to Build

**High-Value Opportunities**:

**1. USDA Agricultural Data** (agriculture + weather = crop intelligence)
- Tools: Crop reports, soil data, yields, forecasts
- Cross-service: Weather + USDA = planting/harvest optimization
- Value: Reduce crop losses 10-20% through weather correlation

**2. NOAA Climate Data** (long-term trends + operational data)
- Tools: Climate normals, historical extremes, drought indices
- Cross-service: NOAA + EIA = long-term renewable planning
- Value: Infrastructure investment optimization

**3. Natural Gas Storage (EIA-914)** (energy storage intelligence)
- Tools: Storage levels, injection/withdrawal, regional data
- Cross-service: Storage + weather = demand forecasting
- Value: Natural gas trading signals

**4. Commodity Futures Data** (complete commodity intelligence)
- Tools: Futures prices, options, historical data
- Cross-service: Weather + EIA + futures = complete trading intelligence
- Value: Data-driven commodity trading (not speculation)

**5. Transportation/Logistics** (weather + routing)
- Tools: Route optimization, traffic, delivery estimates
- Cross-service: Weather + routes = logistics optimization
- Value: Fuel savings 8-15%, on-time delivery improvement

---

## ✅ You're Ready!

**You now have**:
- ✅ Proven pattern (SSE + Docker + TypeScript)
- ✅ 2 working examples (weather, EIA)
- ✅ Complete workflow (11 phases)
- ✅ Testing methodology (Texas Test)
- ✅ Debugging strategies (7-iteration journey)
- ✅ Time estimates (2.5-6 hours typical)
- ✅ Success metrics (quality checklist)

**Go build your next MCP server!** 🚀

**Average time to production**: 2.5-6 hours
**Services built with this pattern**: 4 (browser, notification, weather, EIA)
**Success rate**: 100%

---

**Guide Version**: 1.0
**Last Updated**: 2026-01-27
**Maintained By**: pAIchart MCP Hub Team
